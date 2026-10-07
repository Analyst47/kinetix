import io
import tarfile
import zipfile
from pathlib import Path

import pytest

from app.services.archives import ArchiveRejected, extract


def _zip(tmp_path: Path, members: dict[str, bytes], symlink: str | None = None) -> Path:
    path = tmp_path / "a.zip"
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, data in members.items():
            zf.writestr(name, data)
        if symlink:
            info = zipfile.ZipInfo(symlink)
            info.external_attr = 0o120777 << 16
            zf.writestr(info, "/etc/passwd")
    return path


def _tar(tmp_path: Path, add) -> Path:
    path = tmp_path / "a.tar.gz"
    with tarfile.open(path, "w:gz") as tf:
        add(tf)
    return path


def test_normal_archive_extracts(tmp_path):
    archive = _zip(tmp_path, {"app/routes/login.ts": b"x", "package.json": b"{}"})
    report = extract(archive, tmp_path / "out")
    assert report.files == 2
    assert (tmp_path / "out/app/routes/login.ts").read_bytes() == b"x"


@pytest.mark.parametrize(
    "name", ["../evil.txt", "a/../../evil.txt", "/etc/cron.d/x", "C:/Windows/x"]
)
def test_zip_slip_is_rejected(tmp_path, name):
    archive = _zip(tmp_path, {name: b"x"})
    with pytest.raises(ArchiveRejected):
        extract(archive, tmp_path / "out")
    assert not (tmp_path / "evil.txt").exists()


def test_nothing_is_written_when_any_member_is_bad(tmp_path):
    archive = _zip(tmp_path, {"ok.txt": b"fine", "../evil.txt": b"x"})
    with pytest.raises(ArchiveRejected):
        extract(archive, tmp_path / "out")
    assert not (tmp_path / "out/ok.txt").exists()


def test_zip_symlink_is_rejected(tmp_path):
    archive = _zip(tmp_path, {"a.txt": b"x"}, symlink="link")
    with pytest.raises(ArchiveRejected, match="links"):
        extract(archive, tmp_path / "out")


def test_tar_symlink_and_hardlink_are_rejected(tmp_path):
    def add_symlink(tf):
        info = tarfile.TarInfo("link")
        info.type = tarfile.SYMTYPE
        info.linkname = "/etc/passwd"
        tf.addfile(info)

    with pytest.raises(ArchiveRejected, match="links"):
        extract(_tar(tmp_path, add_symlink), tmp_path / "out")

    def add_hardlink(tf):
        info = tarfile.TarInfo("hard")
        info.type = tarfile.LNKTYPE
        info.linkname = "/etc/shadow"
        tf.addfile(info)

    with pytest.raises(ArchiveRejected, match="links"):
        extract(_tar(tmp_path, add_hardlink), tmp_path / "out2")


def test_zip_bomb_ratio_is_rejected(tmp_path):
    archive = _zip(tmp_path, {"zeros.bin": b"\0" * (20 * 1024 * 1024)})
    with pytest.raises(ArchiveRejected, match="ratio"):
        extract(archive, tmp_path / "out")


def test_git_hooks_are_skipped(tmp_path):
    archive = _zip(tmp_path, {".git/hooks/post-checkout": b"#!/bin/sh\nrm -rf /", "a.txt": b"x"})
    report = extract(archive, tmp_path / "out")
    assert not (tmp_path / "out/.git/hooks/post-checkout").exists()
    assert ".git/hooks/post-checkout" in report.skipped


def test_non_archive_is_rejected(tmp_path):
    path = tmp_path / "x.zip"
    path.write_bytes(b"not an archive")
    with pytest.raises(ArchiveRejected, match="unsupported"):
        extract(path, tmp_path / "out")


def test_tar_with_regular_files_extracts(tmp_path):
    def add(tf):
        data = b"hello"
        info = tarfile.TarInfo("src/a.py")
        info.size = len(data)
        tf.addfile(info, io.BytesIO(data))

    report = extract(_tar(tmp_path, add), tmp_path / "out")
    assert report.files == 1
    assert (tmp_path / "out/src/a.py").read_bytes() == b"hello"
