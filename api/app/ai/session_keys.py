"""Per-session, bring-your-own-key storage for AI providers.

A user pastes their own provider API key; KinetixZero holds it only for the life of their login
session and never writes it to the database. The key is encrypted at rest with the server
secret and stored in Redis under the session id with the session's TTL, so it disappears when
the session ends (and logout clears it explicitly). If Redis isn't configured, a best-effort
per-process cache is used instead (fine for a single-worker deployment).

The key is never returned to the client, never logged, and never recorded on an AiRun.
"""

import base64
import hashlib
import json
import threading
import time
import uuid
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings
from app.security import ratelimit

BYOK_PROVIDERS = ("anthropic", "gemini")

# Per-process fallback store: session_id -> (encrypted_blob, expires_at_monotonic).
_mem: dict[str, tuple[str, float]] = {}
_lock = threading.Lock()


def _fernet() -> Fernet:
    key = hashlib.sha256(("kinetix-aikey:" + get_settings().secret_key).encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def _rkey(session_id: uuid.UUID) -> str:
    return f"kx:aikey:{session_id}"


def _ttl_seconds() -> int:
    return max(60, int(get_settings().session_ttl_hours * 3600))


def set_key(session_id: uuid.UUID, provider: str, api_key: str, model: str | None) -> None:
    """Encrypt and store a provider key for this session only. Overwrites any existing one."""
    blob = (
        _fernet()
        .encrypt(
            json.dumps({"provider": provider, "api_key": api_key, "model": model or None}).encode()
        )
        .decode()
    )
    ttl = _ttl_seconds()
    client = ratelimit._redis()
    if client is not None:
        try:
            client.set(_rkey(session_id), blob, ex=ttl)
            return
        except Exception as exc:
            ratelimit._redis_failed(exc)
    with _lock:
        _mem[str(session_id)] = (blob, time.monotonic() + ttl)


def _decrypt(blob: str) -> dict[str, Any] | None:
    try:
        data = json.loads(_fernet().decrypt(blob.encode()).decode())
    except (InvalidToken, ValueError, TypeError):
        return None
    if not isinstance(data, dict) or data.get("provider") not in BYOK_PROVIDERS:
        return None
    if not isinstance(data.get("api_key"), str) or not data["api_key"]:
        return None
    return data


def get_key(session_id: uuid.UUID) -> dict[str, Any] | None:
    """Return {provider, api_key, model} for this session, or None if none is set."""
    client = ratelimit._redis()
    if client is not None:
        try:
            raw = client.get(_rkey(session_id))
            blob = raw.decode() if isinstance(raw, bytes | bytearray) else raw
            return _decrypt(blob) if blob else None
        except Exception as exc:
            ratelimit._redis_failed(exc)
    with _lock:
        entry = _mem.get(str(session_id))
        if entry is None:
            return None
        blob, expires = entry
        if time.monotonic() >= expires:
            _mem.pop(str(session_id), None)
            return None
        return _decrypt(blob)


def clear_key(session_id: uuid.UUID) -> None:
    client = ratelimit._redis()
    if client is not None:
        try:
            client.delete(_rkey(session_id))
        except Exception as exc:
            ratelimit._redis_failed(exc)
    with _lock:
        _mem.pop(str(session_id), None)
