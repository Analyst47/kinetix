"""Repository targets: URL and ref validation, a hostile remote, and the end-to-end flow."""

import subprocess
from pathlib import Path

import pytest

from app.services import gitfetch
from app.services.gitfetch import FetchFailed, FetchRejected
from tests.conftest import create_project, register

FILE_OK = ["-c", "protocol.file.allow=always"]


def _git(cwd: Path, *args: str) -> str:
    env = {"GIT_CONFIG_GLOBAL": "/dev/null", "GIT_CONFIG_NOSYSTEM": "1", "HOME": str(cwd)}
    return subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@example.com", *args],
        cwd=cwd,
        env={**env, "PATH": "/usr/bin:/bin"},
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()


@pytest.fixture
def hostile_remote(tmp_path) -> tuple[Path, str]:
    """A bare repo whose content tries a symlink escape, a submodule and an LFS filter."""
    work = tmp_path / "src"
    work.mkdir()
    _git(work, "init", "-q", "-b", "main", ".")
    (work / "app.js").write_text("const q = `SELECT * FROM t WHERE id = ${req.query.id}`\n")
    (work / "passwd").symlink_to("/etc/passwd")
    (work / ".gitattributes").write_text("*.bin filter=lfs diff=lfs merge=lfs\n")
    (work / "blob.bin").write_text("version https://git-lfs.github.com/spec/v1\n")
    (work / ".gitmodules").write_text(
        '[submodule "evil"]\n\tpath = evil\n\turl = https://169.254.169.254/evil.git\n'
    )
    _git(work, "add", "-A")
    _git(work, "commit", "-q", "-m", "first")
    _git(work, "tag", "v1.0.0")
    first = _git(work, "rev-parse", "HEAD")
    (work / "app.js").write_text("// second commit\n")
    _git(work, "commit", "-q", "-am", "second")
    bare = tmp_path / "remote.git"
    _git(tmp_path, "clone", "-q", "--bare", str(work), str(bare))
    _git(bare, "config", "uploadpack.allowAnySHA1InWant", "true")
    return bare, first


# ── Validation ────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "url",
    [
        "https://github.com/OWASP/juice-shop",
        "https://github.com/OWASP/juice-shop.git",
        "https://gitlab.com/group/sub/project/",
        "https://codeberg.org/forgejo/forgejo",
    ],
)
def test_public_https_urls_are_accepted(url):
    repo = gitfetch.parse_repo_url(url)
    assert repo.url.startswith("https://") and not repo.url.endswith("/")


@pytest.mark.parametrize(
    "url",
    [
        "http://github.com/a/b",
        "git@github.com:a/b.git",
        "ssh://git@github.com/a/b",
        "file:///etc",
        "ext::sh -c touch% /tmp/pwned",
        "https://user:token@github.com/a/b",
        "https://github.com:8443/a/b",
        "https://github.com/a/b?x=1",
        "https://localhost/a/b",
        "https://127.0.0.1/a/b",
        "https://[::1]/a/b",
        "https://169.254.169.254/latest",
        "https://git.corp.internal/a/b",
        "https://github.com/a/../../b",
        "https://github.com/",
    ],
)
def test_unsafe_urls_are_rejected(url):
    with pytest.raises(FetchRejected):
        gitfetch.parse_repo_url(url)


@pytest.mark.parametrize("ref", ["main", "v17.1.1", "release/2.x", "refs/tags/v1", "a" * 40])
def test_valid_refs(ref):
    assert gitfetch.validate_ref(ref) == ref


@pytest.mark.parametrize(
    "ref", ["--upload-pack=touch /tmp/x", "-x", "../main", "a..b", "x@{1}", "main.lock", "/x"]
)
def test_refs_that_could_be_options_or_traversal_are_rejected(ref):
    with pytest.raises(FetchRejected):
        gitfetch.validate_ref(ref)


@pytest.mark.parametrize("answer", [["10.0.0.5"], ["140.82.112.3", "127.0.0.1"], ["::1"]])
def test_hosts_resolving_to_internal_addresses_are_refused(answer):
    with pytest.raises(FetchRejected):
        gitfetch.resolve_public("github.com", lambda _h: answer)


def test_the_checked_address_is_pinned_for_the_connection(tmp_path):
    seen = {}

    def fake_checkout(remote, ref, workdir, *, extra_config):
        seen.update(remote=remote, ref=ref, config=extra_config)
        workdir.mkdir(parents=True)
        (workdir / "a.txt").write_text("x")
        return "a" * 40

    out = gitfetch.fetch_into(
        "https://github.com/a/b",
        "main",
        tmp_path / "dest",
        resolver=lambda _h: ["140.82.112.3"],
        checkout_fn=fake_checkout,
    )
    assert seen["config"] == ["-c", "http.curloptResolve=github.com:443:140.82.112.3"]
    assert out.commit == "a" * 40 and (tmp_path / "dest" / "a.txt").read_text() == "x"


# ── Against a real (local) hostile remote ─────────────────────────────────────


def test_hardened_git_refuses_non_https_transports(hostile_remote, tmp_path):
    bare, _ = hostile_remote
    with pytest.raises(FetchFailed):
        gitfetch.checkout(f"file://{bare}", None, tmp_path / "w")


def test_checkout_neutralizes_symlinks_submodules_and_filters(hostile_remote, tmp_path):
    bare, _ = hostile_remote
    sha = gitfetch.checkout(f"file://{bare}", None, tmp_path / "w", extra_config=FILE_OK)
    assert len(sha) == 40
    dest = tmp_path / "dest"
    report = gitfetch.copy_tree(tmp_path / "w", dest)
    passwd = dest / "passwd"
    assert passwd.is_file() and not passwd.is_symlink()
    assert passwd.read_text() == "/etc/passwd"  # the link text, never the target's contents
    assert not (dest / "evil").exists()  # the submodule was never fetched
    assert (dest / "blob.bin").read_text().startswith("version https://git-lfs")
    assert not (dest / ".git").exists() and ".git" in report.skipped
    assert (dest / "app.js").read_text() == "// second commit\n"


def test_checkout_by_tag_and_by_commit(hostile_remote, tmp_path):
    bare, first = hostile_remote
    by_tag = gitfetch.checkout(f"file://{bare}", "v1.0.0", tmp_path / "t", extra_config=FILE_OK)
    by_sha = gitfetch.checkout(f"file://{bare}", first, tmp_path / "s", extra_config=FILE_OK)
    assert by_tag == by_sha == first
    assert "SELECT" in (tmp_path / "s" / "app.js").read_text()


def test_missing_ref_gets_a_clear_message(hostile_remote, tmp_path):
    bare, _ = hostile_remote
    with pytest.raises(FetchFailed, match="Couldn't find 'nope'"):
        gitfetch.checkout(f"file://{bare}", "nope", tmp_path / "w", extra_config=FILE_OK)


def test_copy_enforces_the_file_limit(tmp_path, monkeypatch):
    from app.config import get_settings

    src = tmp_path / "src"
    src.mkdir()
    for i in range(3):
        (src / f"{i}.txt").write_text("x")
    monkeypatch.setattr(get_settings(), "archive_max_files", 2)
    with pytest.raises(FetchRejected, match="more than 2 files"):
        gitfetch.copy_tree(src, tmp_path / "dest")


# ── End to end through the API ────────────────────────────────────────────────


def _fake_remote(monkeypatch, files: dict[str, str] | None = None, fail: str | None = None):
    def fake_checkout(remote, ref, workdir, *, extra_config):
        if fail:
            raise FetchFailed(fail)
        workdir.mkdir(parents=True)
        for name, text in (files or {"routes/login.ts": "export const x = 1\n"}).items():
            (workdir / name).parent.mkdir(parents=True, exist_ok=True)
            (workdir / name).write_text(text)
        return "3f2c9e1" + "0" * 33

    monkeypatch.setattr(gitfetch, "system_resolver", lambda _h: ["140.82.112.3"])
    monkeypatch.setattr(gitfetch, "checkout", fake_checkout)


def test_adding_a_repository_fetches_it_and_records_the_commit(client, monkeypatch):
    _fake_remote(monkeypatch)
    org = register(client)
    create_project(client, org)
    base = f"/api/v1/orgs/{org}/projects/juice-shop"
    r = client.post(
        f"{base}/targets/git",
        json={
            "url": "https://github.com/juice-shop/juice-shop.git",
            "ref": "v17.1.1",
            "scan": False,
        },
    )
    assert r.status_code == 202, r.text
    assert r.json()["fetch_status"] == "pending" and r.json()["name"] == "juice-shop"
    target = client.get(f"{base}/targets").json()[0]
    assert target["fetch_status"] == "ready"
    assert target["commit"] == "3f2c9e1" + "0" * 33 and target["version"] == "v17.1.1"
    assert client.get(f"{base}/scans").json() == []
    actions = [e["action"] for e in client.get(f"/api/v1/orgs/{org}/audit").json()]
    assert "target.added" in actions and "target.fetched" in actions


def test_fetch_then_scan_runs_the_analyzers(client, monkeypatch):
    _fake_remote(monkeypatch, {"config.js": 'const key = "AKIAIOSFODNN7EXAMPLQ"\n'})
    org = register(client)
    create_project(client, org)
    base = f"/api/v1/orgs/{org}/projects/juice-shop"
    client.post(f"{base}/targets/git", json={"url": "https://github.com/a/b"})
    scans = client.get(f"{base}/scans").json()
    assert len(scans) == 1 and scans[0]["status"] == "succeeded"


def test_failed_fetch_is_reported_and_blocks_scans(client, monkeypatch):
    _fake_remote(monkeypatch, fail="The repository doesn't exist or isn't public.")
    org = register(client)
    create_project(client, org)
    base = f"/api/v1/orgs/{org}/projects/juice-shop"
    client.post(f"{base}/targets/git", json={"url": "https://github.com/a/missing"})
    target = client.get(f"{base}/targets").json()[0]
    assert target["fetch_status"] == "failed"
    assert target["fetch_error"] == "The repository doesn't exist or isn't public."
    r = client.post(f"{base}/scans", json={"target_id": target["id"]})
    assert r.status_code == 409 and r.json()["error"]["code"] == "target_not_ready"


def test_a_fetch_that_outlives_its_project_leaves_no_source_tree(client, monkeypatch):
    import uuid

    from sqlalchemy import select

    from app.config import get_settings
    from app.db import SessionLocal
    from app.models import Organization
    from app.services.scans import run_fetch

    _fake_remote(monkeypatch)
    org = register(client)
    create_project(client, org)
    base = f"/api/v1/orgs/{org}/projects/juice-shop"
    client.post(f"{base}/targets/git", json={"url": "https://github.com/a/b", "scan": False})
    target_id = client.get(f"{base}/targets").json()[0]["id"]
    tree = get_settings().storage_dir / "sources" / target_id

    real_checkout = gitfetch.checkout

    def checkout_while_the_project_is_deleted(remote, ref, workdir, *, extra_config):
        commit = real_checkout(remote, ref, workdir, extra_config=extra_config)
        assert client.delete(base, params={"confirm": "juice-shop"}).status_code == 204
        return commit

    monkeypatch.setattr(gitfetch, "checkout", checkout_while_the_project_is_deleted)
    with SessionLocal() as db:
        org_id = db.scalar(select(Organization.id).where(Organization.slug == org))
        with pytest.raises(LookupError):
            run_fetch(db, uuid.UUID(target_id), org_id)
    assert not tree.exists()


def test_invalid_repository_url_is_rejected_before_anything_is_created(client):
    org = register(client)
    create_project(client, org)
    base = f"/api/v1/orgs/{org}/projects/juice-shop"
    r = client.post(f"{base}/targets/git", json={"url": "https://127.0.0.1/a/b"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_repository"
    assert client.get(f"{base}/targets").json() == []
