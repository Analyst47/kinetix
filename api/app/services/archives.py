"""Hostile-input archive extraction.

Source archives come from outside the trust boundary. Before any byte is written we
validate every member against:

- path traversal (``../``, absolute paths, Windows drive letters, NUL bytes)
- links and special files (symlinks, hardlinks, devices, FIFOs)
- resource exhaustion (member count, total unpacked size, compression ratio)
- toolchain hooks that could run code later (``.git/hooks``)

Extraction only ever writes regular files and directories beneath the destination.
"""

import os
import stat
import tarfile
import zipfile
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath

from app.config import get_settings


class ArchiveRejected(Exception):
    def __init__(self, reason: str, member: str | None = None):
        self.reason = reason
        self.member = member
        super().__init__(f"{reason}: {member}" if member else reason)


@dataclass
class ExtractionReport:
    files: int = 0
    unpacked_bytes: int = 0
    skipped: list[str] = field(default_factory=list)


SKIP_PREFIXES = (".git/hooks/",)


def _check_name(name: str) -> str | None:
    """Return the normalized relative path, None to skip, or raise."""
    if "\x00" in name:
        raise ArchiveRejected("member name contains a NUL byte", name.replace("\x00", "\\0"))
    normalized = name.replace("\\", "/")
    if normalized.startswith("/") or (len(normalized) > 1 and normalized[1] == ":"):
        raise ArchiveRejected("absolute path", name)
    parts = [p for p in PurePosixPath(normalized).parts if p not in ("", ".")]
    if any(p == ".." for p in parts):
        raise ArchiveRejected("path escapes the archive root", name)
    if not parts:
        return None
    rel = "/".join(parts)
    if any((rel + "/").startswith(prefix) for prefix in SKIP_PREFIXES):
        return None
    return rel


def _inside(dest: Path, rel: str) -> Path:
    target = (dest / rel).resolve()
    if dest != target and dest not in target.parents:
        raise ArchiveRejected("path escapes the destination", rel)
    return target


def extract(archive: Path, dest: Path) -> ExtractionReport:
    s = get_settings()
    dest.mkdir(parents=True, exist_ok=True)
    dest = dest.resolve()
    archive_size = archive.stat().st_size
    if archive_size > s.archive_max_bytes:
        raise ArchiveRejected("archive is larger than the upload limit")

    if zipfile.is_zipfile(archive):
        return _extract_zip(archive, dest, archive_size)
    if tarfile.is_tarfile(archive):
        return _extract_tar(archive, dest, archive_size)
    raise ArchiveRejected("unsupported archive format; upload a .zip or .tar.gz")


def _budget(report: ExtractionReport, size: int, archive_size: int) -> None:
    s = get_settings()
    report.files += 1
    report.unpacked_bytes += size
    if report.files > s.archive_max_files:
        raise ArchiveRejected(f"archive has more than {s.archive_max_files} files")
    if report.unpacked_bytes > s.archive_max_unpacked_bytes:
        raise ArchiveRejected("archive unpacks to more than the allowed size")
    if report.unpacked_bytes > max(archive_size, 1) * s.archive_max_ratio:
        raise ArchiveRejected("compression ratio is suspiciously high (possible zip bomb)")


def _extract_zip(archive: Path, dest: Path, archive_size: int) -> ExtractionReport:
    report = ExtractionReport()
    with zipfile.ZipFile(archive) as zf:
        members = zf.infolist()
        # Validate everything before writing anything.
        plan: list[tuple[zipfile.ZipInfo, str]] = []
        for info in members:
            rel = _check_name(info.filename)
            if rel is None:
                report.skipped.append(info.filename)
                continue
            # Unix file type bits, when the archiver recorded them (zero means "regular file").
            ftype = stat.S_IFMT(info.external_attr >> 16)
            if ftype and ftype not in (stat.S_IFREG, stat.S_IFDIR):
                raise ArchiveRejected("links and special files are not allowed", info.filename)
            if not info.is_dir():
                _budget(report, info.file_size, archive_size)
            plan.append((info, rel))
        written = 0
        for info, rel in plan:
            target = _inside(dest, rel)
            if info.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            # Count real bytes too; the declared size in the header can lie.
            with zf.open(info) as src, open(target, "xb") as out:
                while chunk := src.read(1024 * 1024):
                    written += len(chunk)
                    if written > report.unpacked_bytes:
                        raise ArchiveRejected(
                            "member is larger than its declared size", info.filename
                        )
                    out.write(chunk)
            os.chmod(target, 0o640)
    return report


def _extract_tar(archive: Path, dest: Path, archive_size: int) -> ExtractionReport:
    report = ExtractionReport()
    with tarfile.open(archive, mode="r:*") as tf:
        plan: list[tuple[tarfile.TarInfo, str]] = []
        for info in tf.getmembers():
            rel = _check_name(info.name)
            if rel is None:
                report.skipped.append(info.name)
                continue
            if not (info.isreg() or info.isdir()):
                raise ArchiveRejected("links and special files are not allowed", info.name)
            if info.isreg():
                _budget(report, info.size, archive_size)
            plan.append((info, rel))
        for info, rel in plan:
            target = _inside(dest, rel)
            if info.isdir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            src = tf.extractfile(info)
            if src is None:
                raise ArchiveRejected("unreadable member", info.name)
            with src, open(target, "xb") as out:
                while chunk := src.read(1024 * 1024):
                    out.write(chunk)
            os.chmod(target, 0o640)
    return report
