"""Fixed-window rate limiting for authentication endpoints.

In-process for now; swap the store for Redis (INCR + EXPIRE) when running more than
one API process.
"""

import threading
import time

from app.errors import ApiError


class RateLimiter:
    def __init__(self, limit: int, window_seconds: int):
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, tuple[int, float]] = {}
        self._lock = threading.Lock()

    def hit(self, key: str) -> None:
        now = time.monotonic()
        with self._lock:
            count, start = self._hits.get(key, (0, now))
            if now - start >= self.window:
                count, start = 0, now
            count += 1
            self._hits[key] = (count, start)
        if count > self.limit:
            retry = int(self.window - (now - start)) + 1
            raise ApiError(
                429,
                "rate_limited",
                f"Too many attempts. Try again in {retry} seconds.",
                {"retry_after": retry},
            )

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


login_limiter = RateLimiter(limit=10, window_seconds=300)
register_limiter = RateLimiter(limit=5, window_seconds=3600)
