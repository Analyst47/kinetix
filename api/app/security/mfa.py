"""TOTP (RFC 6238) multi-factor authentication with one-time recovery codes."""

import base64
import hashlib
import secrets
import time

import pyotp
from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings

ISSUER = "Kinetix"
STEP_SECONDS = 30
RECOVERY_CODE_COUNT = 10


def _fernet() -> Fernet:
    key = hashlib.sha256(("kinetix-mfa:" + get_settings().secret_key).encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def new_secret() -> str:
    return pyotp.random_base32(length=32)


def encrypt(secret: str) -> str:
    return _fernet().encrypt(secret.encode()).decode()


def decrypt(token: str) -> str | None:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken:
        return None


def provisioning_uri(secret: str, email: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=ISSUER)


def match_step(
    secret: str, code: str, last_step: int | None, now: float | None = None
) -> int | None:
    """Return the time step the code belongs to, allowing ±1 step of clock drift.

    A step at or before ``last_step`` is refused, so an intercepted code can't be replayed.
    """
    code = code.strip().replace(" ", "")
    if not (code.isdigit() and len(code) == 6):
        return None
    totp = pyotp.TOTP(secret)
    current = int((now if now is not None else time.time()) // STEP_SECONDS)
    for step in (current, current - 1, current + 1):
        if secrets.compare_digest(totp.at(step * STEP_SECONDS), code):
            if last_step is not None and step <= last_step:
                return None
            return step
    return None


def new_recovery_codes() -> list[str]:
    alphabet = "abcdefghjkmnpqrstuvwxyz23456789"
    codes = []
    for _ in range(RECOVERY_CODE_COUNT):
        raw = "".join(secrets.choice(alphabet) for _ in range(10))
        codes.append(f"{raw[:5]}-{raw[5:]}")
    return codes


def hash_recovery_code(code: str) -> str:
    normalized = code.strip().lower().replace(" ", "")
    return hashlib.sha256(normalized.encode()).hexdigest()
