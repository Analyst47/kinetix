"""Optional monthly spend safeguard for AI usage.

When KINETIX_AI_MONTHLY_TOKEN_BUDGET is set, Kinetix refuses AI calls once that many tokens
(input + output) have been used in the current UTC month. The counter is shared across
processes through Redis when available, and falls back to a per-process counter otherwise —
best-effort, so a Redis hiccup never blocks or crashes an AI request.
"""

import threading
import time
from datetime import UTC, datetime

from app.config import get_settings
from app.errors import ApiError
from app.security import ratelimit

_mem: dict[str, int] = {}
_lock = threading.Lock()


def _month() -> str:
    return datetime.now(UTC).strftime("%Y%m")


def _key() -> str:
    return f"kx:aibudget:{_month()}"


def used() -> int:
    """Tokens used this month, as best we can tell (Redis if up, else this process)."""
    client = ratelimit._redis()
    if client is not None:
        try:
            raw = client.get(_key())
            return int(raw) if raw is not None else 0
        except Exception as exc:  # degrade to per-process view
            ratelimit._redis_failed(exc)
    with _lock:
        return _mem.get(_month(), 0)


def remaining() -> int | None:
    budget = get_settings().ai_monthly_token_budget
    if not budget:
        return None
    return max(0, budget - used())


def check() -> None:
    """Raise if the monthly budget is already exhausted. No-op when no budget is set."""
    budget = get_settings().ai_monthly_token_budget
    if not budget:
        return
    if used() >= budget:
        raise ApiError(
            429,
            "ai_budget_exhausted",
            "This server's monthly AI token budget is used up. It resets at the start of next "
            "month, or an administrator can raise KINETIX_AI_MONTHLY_TOKEN_BUDGET.",
        )


def add(tokens: int) -> None:
    """Record token usage against the monthly counter. Best-effort."""
    if tokens <= 0:
        return
    client = ratelimit._redis()
    if client is not None:
        try:
            month = _month()
            pipe = client.pipeline()
            pipe.incrby(_key(), tokens)
            # Expire ~70 days out so a stale month's counter can't linger forever.
            pipe.expire(_key(), 70 * 86400, nx=True)
            pipe.execute()
            return
        except Exception as exc:
            ratelimit._redis_failed(exc)
    with _lock:
        month = _month()
        _mem[month] = _mem.get(month, 0) + tokens
    # Drop other months so the fallback dict can't grow without bound.
    _trim(time.monotonic())


def _trim(_now: float) -> None:
    with _lock:
        current = _month()
        for k in [k for k in _mem if k != current]:
            _mem.pop(k, None)
