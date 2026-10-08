"""Content-addressed blob storage on local disk. Files are named by their SHA-256.

The interface is deliberately small (put / open / verify) so an S3-compatible backend
can replace it without touching callers.
"""

import hashlib
import os
import re
import tempfile
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO

from app.config import get_settings
from app.errors import ApiError

_CHUNK = 1024 * 1024
_HEX64 = re.compile(r"^[0-9a-f]{64}$")


@dataclass(frozen=True)
class StoredBlob:
    sha256: str
    size: int


def _root(namespace: str) -> Path:
    root = (get_settings().storage_dir / namespace).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def blob_path(namespace: str, sha256: str) -> Path:
    if not _HEX64.match(sha256):
        raise ValueError("invalid digest")
    return _root(namespace) / sha256[:2] / sha256[2:4] / sha256


def put(namespace: str, stream: BinaryIO, max_bytes: int) -> StoredBlob:
    """Stream to a temp file while hashing; reject oversize input before it is kept."""
    root = _root(namespace)
    digest = hashlib.sha256()
    size = 0
    fd, tmp_name = tempfile.mkstemp(dir=root, prefix=".upload-")
    try:
        with os.fdopen(fd, "wb") as out:
            while chunk := stream.read(_CHUNK):
                size += len(chunk)
                if size > max_bytes:
                    raise ApiError(
                        413, "too_large", f"File exceeds the {max_bytes // (1024 * 1024)} MB limit."
                    )
                digest.update(chunk)
                out.write(chunk)
        sha = digest.hexdigest()
        final = blob_path(namespace, sha)
        final.parent.mkdir(parents=True, exist_ok=True)
        if final.exists():
            os.unlink(tmp_name)
        else:
            os.chmod(tmp_name, 0o440)
            os.replace(tmp_name, final)
        return StoredBlob(sha256=sha, size=size)
    except BaseException:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)
        raise


def verify(namespace: str, sha256: str) -> bool:
    path = blob_path(namespace, sha256)
    if not path.is_file():
        return False
    digest = hashlib.sha256()
    with path.open("rb") as f:
        while chunk := f.read(_CHUNK):
            digest.update(chunk)
    return digest.hexdigest() == sha256


def safe_filename(name: str | None, fallback: str = "evidence.bin") -> str:
    """Keep a display name only: no directories, control characters or reserved names."""
    name = unicodedata.normalize("NFC", name or "")
    name = name.replace("\\", "/").rsplit("/", 1)[-1]
    name = "".join(ch for ch in name if unicodedata.category(ch)[0] != "C").strip().strip(".")
    name = re.sub(r"\s+", " ", name)[:255]
    # Windows device names (CON, nul.txt, COM1...) can't be saved as files on Windows.
    if _RESERVED.match(name):
        name = f"_{name}"
    return name or fallback


_RESERVED = re.compile(r"^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\.|$)", re.IGNORECASE)
