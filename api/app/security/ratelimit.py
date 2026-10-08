"""Fixed-window rate limiting, shared across API processes through Redis.

With KINETIX_RATE_LIMIT_BACKEND=redis, every API process counts against the same window, so
running several workers or replicas doesn't multiply the limits. Keys are hashed before they
reach Redis, so email addresses and IPs aren't stored there in clear. If Redis is
unreachable, each process falls back to its own in-memory counters: limits still apply,
just per process, and the fallback is logged.
"""

import hashlib
import logging
import threading
import time
from typing import Any

from app.config import get_settings
from app.errors import ApiError

log = logging.getLogger("kinetix.ratelimit")

_redis_client: Any = None
_redis_lock = threading.Lock()
_redis_down_until = 0.0


def _redis() -> Any:
    """A shared client, or None while Redis is unavailable (retried every 30 seconds)."""
    global _redis_client, _redis_down_until
    s = get_settings()
    if s.rate_limit_backend != "redis" or time.monotonic() < _redis_down_until:
        return None
    with _redis_lock:
        if _redis_client is None:
            import redis

            _redis_client = redis.Redis.from_url(
                s.redis_url, socket_timeout=0.5, socket_connect_timeout=0.5
            )
    return _redis_client


def _redis_failed(exc: Exception) -> None:
    global _redis_down_until
    _redis_down_until = time.monotonic() + 30
    log.warning("Redis rate limiting unavailable, using per-process limits for 30s: %s", exc)


class RateLimiter:
    def __init__(self, name: str, limit: int, window_seconds: int):
        self.name = name
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, tuple[int, float]] = {}
        self._lock = threading.Lock()

    def _count_redis(self, client: Any, key: str) -> tuple[int, int] | None:
        now = time.time()
        bucket = int(now // self.window)
        digest = hashlib.sha256(key.encode()).hexdigest()[:32]
        rkey = f"kx:rl:{self.name}:{bucket}:{digest}"
        try:
            pipe = client.pipeline()
            pipe.incr(rkey)
            pipe.expire(rkey, self.window + 5, nx=True)
            count = int(pipe.execute()[0])
        except Exception as exc:  # any Redis failure: degrade, don't fail open or crash
            _redis_failed(exc)
            return None
        retry = int((bucket + 1) * self.window - now) + 1
        return count, retry

    def _count_memory(self, key: str) -> tuple[int, int]:
        now = time.monotonic()
        with self._lock:
            count, start = self._hits.get(key, (0, now))
            if now - start >= self.window:
                count, start = 0, now
            count += 1
            self._hits[key] = (count, start)
        return count, int(self.window - (now - start)) + 1

    def hit(self, key: str) -> None:
        client = _redis()
        counted = self._count_redis(client, key) if client is not None else None
        count, retry = counted or self._count_memory(key)
        if count > self.limit:
            raise ApiError(
                429,
                "rate_limited",
                f"Too many attempts. Try again in {retry} seconds.",
                {"retry_after": retry},
            )

    def allow(self, key: str) -> bool:
        """Like hit(), but reports instead of raising. For limits the caller must not reveal."""
        try:
            self.hit(key)
        except ApiError:
            return False
        return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()
        client = _redis()
        if client is not None:
            try:
                for k in client.scan_iter(f"kx:rl:{self.name}:*"):
                    client.delete(k)
            except Exception as exc:
                _redis_failed(exc)


# Per IP and email: slows guessing one account's password from one place.
login_limiter = RateLimiter("login", limit=10, window_seconds=300)
# Per email, from anywhere: caps distributed guessing against one account.
account_limiter = RateLimiter("login-account", limit=30, window_seconds=3600)
register_limiter = RateLimiter("register", limit=5, window_seconds=3600)
# Per IP. Requests over it get a 429, which says nothing about any account.
reset_request_limiter = RateLimiter("reset-request", limit=10, window_seconds=3600)
# Per address, silently: stops anyone flooding a person's inbox with reset emails.
reset_email_limiter = RateLimiter("reset-email", limit=3, window_seconds=3600)
