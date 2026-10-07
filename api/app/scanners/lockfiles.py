"""Dependency extraction from lockfiles and pinned manifests.

Parsers read untrusted files: they never execute anything, cap file sizes and treat
malformed input as "no dependencies" rather than an error that stops the scan.
"""

import json
import re
from dataclasses import dataclass
from pathlib import Path

MAX_MANIFEST_BYTES = 50 * 1024 * 1024
IGNORED_DIRS = {"node_modules", ".git", "vendor", "dist", "build", ".venv", "venv"}


@dataclass(frozen=True)
class Package:
    ecosystem: str
    name: str
    version: str
    direct: bool
    license: str | None
    manifest: str


def _walk(root: Path, filename_pattern: re.Pattern[str]) -> list[Path]:
    found = []
    for path in sorted(root.rglob("*")):
        rel = path.relative_to(root)
        if any(part in IGNORED_DIRS for part in rel.parts[:-1]):
            continue
        if (
            path.is_file()
            and not path.is_symlink()
            and filename_pattern.fullmatch(path.name)
            and path.stat().st_size <= MAX_MANIFEST_BYTES
        ):
            found.append(path)
    return found


def parse_npm_lock(path: Path, root: Path) -> list[Package]:
    manifest = str(path.relative_to(root))
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    out: dict[tuple[str, str], Package] = {}
    packages = data.get("packages")
    if isinstance(packages, dict):  # lockfileVersion 2 and 3
        root_pkg = packages.get("", {}) or {}
        direct = set((root_pkg.get("dependencies") or {}).keys()) | set(
            (root_pkg.get("devDependencies") or {}).keys()
        )
        for key, meta in packages.items():
            if not key or not isinstance(meta, dict) or meta.get("link"):
                continue
            name = meta.get("name") or key.rsplit("node_modules/", 1)[-1]
            version = meta.get("version")
            if not isinstance(name, str) or not isinstance(version, str):
                continue
            is_direct = key == f"node_modules/{name}" and name in direct
            lic = meta.get("license") if isinstance(meta.get("license"), str) else None
            prev = out.get((name, version))
            out[(name, version)] = Package(
                "npm", name, version, is_direct or bool(prev and prev.direct), lic, manifest
            )
    elif isinstance(data.get("dependencies"), dict):  # lockfileVersion 1

        def visit(deps: dict, top: bool) -> None:
            for name, meta in deps.items():
                if not isinstance(meta, dict) or not isinstance(meta.get("version"), str):
                    continue
                out.setdefault(
                    (name, meta["version"]),
                    Package("npm", name, meta["version"], top, None, manifest),
                )
                if isinstance(meta.get("dependencies"), dict):
                    visit(meta["dependencies"], False)

        visit(data["dependencies"], True)
    return list(out.values())


_REQ = re.compile(
    r"^\s*([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?\s*==\s*([A-Za-z0-9._+!-]+)\s*(?:[;#].*)?$"
)


def parse_requirements(path: Path, root: Path) -> list[Package]:
    manifest = str(path.relative_to(root))
    out = []
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return []
    for line in lines:
        m = _REQ.match(line)
        if m:
            out.append(Package("PyPI", m.group(1).lower(), m.group(2), True, None, manifest))
    return out


def discover(root: Path) -> list[Package]:
    packages: list[Package] = []
    for path in _walk(root, re.compile(r"(npm-shrinkwrap|package-lock)\.json")):
        packages.extend(parse_npm_lock(path, root))
    for path in _walk(root, re.compile(r"requirements(-[\w.-]+)?\.txt")):
        packages.extend(parse_requirements(path, root))
    return packages
