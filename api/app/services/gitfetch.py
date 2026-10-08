"""Fetch one commit of a public Git repository, treating the remote as hostile.

The remote controls everything it sends: refs, object contents, file names, symlinks,
.gitattributes, .gitmodules and redirects. So the fetch:

- speaks only HTTPS to a public address, resolved once and pinned (http.curloptResolve),
  so a DNS answer can't swap in an internal address between the check and the connection
- refuses redirects, credentials in the URL, other ports and every non-HTTPS protocol
- ignores system and user git config, runs no hooks, fetches no submodules or LFS objects,
  writes symlinks as plain files, and verifies every object it receives
- fetches exactly one commit (depth 1), under a time limit and a low-speed cutoff
- then copies the checkout into storage as regular files only, under the same file-count
  and size limits as uploaded archives, leaving .git behind
"""

import os
import re
import shutil
import subprocess
import tempfile
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlsplit

from app.config import get_settings
from app.services.securitytxt import Resolver, is_public, normalize_domain, system_resolver

FETCH_TIMEOUT_SECONDS = 180
_PATH = re.compile(r"^/[A-Za-z0-9._~\-/]{1,300}$")
_REF = re.compile(r"^(?![-/.])(?!.*(\.\.|//|@\{|\.lock$|/$))[A-Za-z0-9._/-]{1,200}$")


class FetchRejected(Exception):
    """The request is invalid or unsafe. The message is safe to show to the user."""


class FetchFailed(Exception):
    """The fetch was attempted and didn't work. The message is safe to show to the user."""


@dataclass(frozen=True)
class RepoUrl:
    host: str
    path: str

    @property
    def url(self) -> str:
        return f"https://{self.host}{self.path}"


@dataclass
class CopyReport:
    files: int = 0
    bytes: int = 0
    skipped: list[str] = field(default_factory=list)


def parse_repo_url(raw: str) -> RepoUrl:
    raw = raw.strip()
    if raw.startswith("git@") or "://" not in raw:
        raise FetchRejected("Use the repository's HTTPS URL, like https://github.com/owner/repo.")
    parts = urlsplit(raw)
    if parts.scheme.lower() != "https":
        raise FetchRejected("Only HTTPS repository URLs are supported.")
    if parts.username or parts.password or "@" in parts.netloc:
        raise FetchRejected("Remove the credentials from the URL. Only public repositories work.")
    if parts.port not in (None, 443):
        raise FetchRejected("Only the standard HTTPS port is supported.")
    if parts.query or parts.fragment:
        raise FetchRejected("Remove the query string or fragment from the URL.")
    try:
        host = normalize_domain(parts.hostname or "")
    except Exception as exc:
        raise FetchRejected("The URL needs a public host name, like github.com.") from exc
    path = parts.path.rstrip("/")
    if not _PATH.match(path) or ".." in path.split("/"):
        raise FetchRejected("That doesn't look like a repository path.")
    return RepoUrl(host=host, path=path)


def validate_ref(ref: str | None) -> str | None:
    if ref is None or not ref.strip():
        return None
    ref = ref.strip()
    if not _REF.match(ref):
        raise FetchRejected("That isn't a valid branch, tag or commit.")
    return ref


def resolve_public(host: str, resolver: Resolver = system_resolver) -> str:
    try:
        addresses = resolver(host)
    except OSError as exc:
        raise FetchFailed(f"Couldn't resolve {host}.") from exc
    if not addresses:
        raise FetchFailed(f"Couldn't resolve {host}.")
    if not all(is_public(a) for a in addresses):
        raise FetchRejected(f"{host} resolves to a private or reserved address.")
    return addresses[0]


def _env(home: Path) -> dict[str, str]:
    return {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": str(home),
        "GIT_CONFIG_NOSYSTEM": "1",
        "GIT_CONFIG_GLOBAL": os.devnull,
        "GIT_TERMINAL_PROMPT": "0",
        "GIT_ASKPASS": "/bin/false",
        "SSH_ASKPASS": "/bin/false",
        "GIT_LFS_SKIP_SMUDGE": "1",
        "GIT_PROTOCOL_FROM_USER": "0",
        "LC_ALL": "C",
        # The worker may sit behind an egress proxy; keep it if one is configured.
        **{
            k: v
            for k, v in os.environ.items()
            if k.upper() in {"HTTPS_PROXY", "NO_PROXY", "GIT_SSL_CAINFO", "SSL_CERT_FILE"}
        },
    }


def hardening_config() -> list[str]:
    pairs = {
        "protocol.allow": "never",
        "protocol.https.allow": "always",
        "http.followRedirects": "false",
        "http.lowSpeedLimit": "1024",
        "http.lowSpeedTime": "30",
        "core.hooksPath": os.devnull,
        "core.symlinks": "false",
        "core.fsmonitor": "false",
        "core.protectNTFS": "true",
        "core.protectHFS": "true",
        "submodule.recurse": "false",
        "fetch.recurseSubmodules": "false",
        "transfer.fsckObjects": "true",
        "fetch.fsckObjects": "true",
        "advice.detachedHead": "false",
        "init.defaultBranch": "main",
    }
    out: list[str] = []
    for key, value in pairs.items():
        out += ["-c", f"{key}={value}"]
    return out


def _git(
    args: list[str], cwd: Path, env: dict[str, str], config: list[str], timeout: float
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(  # noqa: S603 - fixed argv, no shell
        ["git", *config, *args],  # noqa: S607
        cwd=cwd,
        env=env,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )


def _explain(stderr: str, ref: str | None) -> str:
    low = stderr.lower()
    if "could not read username" in low or "authentication" in low or "403" in low:
        return "The repository is private or doesn't exist. Only public repositories work."
    if "not found" in low and "repository" in low:
        return "The repository doesn't exist or isn't public."
    if "couldn't find remote ref" in low or "not our ref" in low or "invalid refspec" in low:
        return f"Couldn't find {ref!r} in the repository." if ref else "The repository is empty."
    if "redirect" in low or "301" in low or "302" in low:
        return "The server redirected the request. Use the repository's canonical URL."
    if "fsck" in low or "badtree" in low or "dangling" in low:
        return "The repository sent malformed objects, so it was rejected."
    first = next((line for line in stderr.splitlines() if line.strip()), "unknown error")
    return f"git couldn't fetch the repository: {first.strip()[:200]}"


def checkout(
    remote: str,
    ref: str | None,
    workdir: Path,
    *,
    extra_config: list[str] | None = None,
    timeout: float = FETCH_TIMEOUT_SECONDS,
) -> str:
    """Fetch one commit of `remote` into `workdir` and check it out. Returns the commit SHA."""
    env = _env(workdir.parent)
    config = hardening_config() + (extra_config or [])
    workdir.mkdir(parents=True)
    steps = [
        (["init", "-q", "."], 30),
        (["remote", "add", "origin", remote], 30),
        (["fetch", "-q", "--depth", "1", "--no-tags", "origin", ref or "HEAD"], timeout),
        (["checkout", "-q", "--detach", "FETCH_HEAD"], 120),
        (["rev-parse", "HEAD"], 30),
    ]
    result = None
    for args, limit in steps:
        try:
            result = _git(args, workdir, env, config, limit)
        except subprocess.TimeoutExpired as exc:
            raise FetchFailed("Fetching the repository took too long.") from exc
        if result.returncode != 0:
            raise FetchFailed(_explain(result.stderr, ref))
    assert result is not None
    sha = result.stdout.strip()
    if not re.fullmatch(r"[0-9a-f]{40}|[0-9a-f]{64}", sha):
        raise FetchFailed("git returned an unexpected commit id.")
    return sha


def copy_tree(src: Path, dest: Path) -> CopyReport:
    """Copy regular files only, skipping .git, links and special files, within upload limits."""
    s = get_settings()
    report = CopyReport()
    src = src.resolve()
    dest.mkdir(parents=True, exist_ok=True)
    for dirpath, dirnames, filenames in os.walk(src, followlinks=False):
        here = Path(dirpath)
        rel_dir = here.relative_to(src)
        keep = []
        for d in dirnames:
            p = here / d
            if (rel_dir == Path(".") and d == ".git") or p.is_symlink():
                report.skipped.append(str(rel_dir / d))
            else:
                keep.append(d)
        dirnames[:] = sorted(keep)
        for name in sorted(filenames):
            p = here / name
            rel = rel_dir / name
            st = p.lstat()
            if not os.path.isfile(p) or p.is_symlink() or st.st_nlink > 1:
                report.skipped.append(str(rel))
                continue
            report.files += 1
            report.bytes += st.st_size
            if report.files > s.archive_max_files:
                raise FetchRejected(f"The repository has more than {s.archive_max_files} files.")
            if report.bytes > s.archive_max_unpacked_bytes:
                raise FetchRejected("The repository is larger than the allowed size.")
            out = dest / rel
            out.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(p, out, follow_symlinks=False)
            os.chmod(out, 0o640)
    return report


@dataclass
class Fetched:
    commit: str
    report: CopyReport


def fetch_into(
    url: str,
    ref: str | None,
    dest: Path,
    *,
    resolver: Resolver | None = None,
    checkout_fn: Callable[..., str] | None = None,
) -> Fetched:
    """Validate, fetch and copy a public repository snapshot into `dest`."""
    repo = parse_repo_url(url)
    ref = validate_ref(ref)
    ip = resolve_public(repo.host, resolver or system_resolver)
    pin = f"{repo.host}:443:[{ip}]" if ":" in ip else f"{repo.host}:443:{ip}"
    with tempfile.TemporaryDirectory(prefix="kx-git-") as tmp:
        work = Path(tmp) / "repo"
        sha = (checkout_fn or checkout)(
            repo.url, ref, work, extra_config=["-c", f"http.curloptResolve={pin}"]
        )
        dest.parent.mkdir(parents=True, exist_ok=True)
        staging = Path(tempfile.mkdtemp(prefix="kx-git-copy-", dir=dest.parent))
        try:
            report = copy_tree(work, staging)
            if dest.exists():
                shutil.rmtree(dest)
            staging.rename(dest)
        except Exception:
            shutil.rmtree(staging, ignore_errors=True)
            raise
    return Fetched(commit=sha, report=report)
