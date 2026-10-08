"""Rate limits shared through Redis, trusted-proxy client IPs, and production defaults."""

import os

import pytest
from starlette.requests import Request

from app.config import Settings, get_settings
from app.errors import ApiError
from app.security import ratelimit
from app.security.clientip import client_ip
from app.services.storage import safe_filename

REDIS_URL = os.environ.get("KINETIX_TEST_REDIS_URL", "redis://localhost:6379/15")


def _request(peer: str, xff: str | None = None) -> Request:
    headers = [(b"x-forwarded-for", xff.encode())] if xff is not None else []
    return Request({"type": "http", "client": (peer, 1234), "headers": headers})


# ── Client IP ─────────────────────────────────────────────────────────────────


def test_without_trusted_proxies_the_header_is_ignored(monkeypatch):
    monkeypatch.setattr(get_settings(), "trusted_proxies", [])
    assert client_ip(_request("203.0.113.9", "6.6.6.6")) == "203.0.113.9"


@pytest.mark.parametrize(
    ("peer", "xff", "expected"),
    [
        ("172.18.0.5", "198.51.100.7", "198.51.100.7"),  # the edge proxy added the client
        ("172.18.0.5", "6.6.6.6, 198.51.100.7", "198.51.100.7"),  # client-spoofed hop ignored
        ("172.18.0.5", "198.51.100.7, 172.18.0.9", "198.51.100.7"),  # two trusted hops
        ("172.18.0.5", "198.51.100.7:4711", "198.51.100.7"),  # with a port
        ("172.18.0.5", "[2001:db8::1]:443", "2001:db8::1"),
        ("172.18.0.5", "not-an-ip, 198.51.100.7", "198.51.100.7"),
        ("172.18.0.5", "198.51.100.7, not-an-ip", "172.18.0.5"),  # garbage: stop trusting
        ("172.18.0.5", "", "172.18.0.5"),
        ("203.0.113.9", "6.6.6.6", "203.0.113.9"),  # untrusted peer: header ignored
    ],
)
def test_forwarded_for_is_read_from_the_right_through_trusted_hops(
    monkeypatch, peer, xff, expected
):
    monkeypatch.setattr(get_settings(), "trusted_proxies", ["172.16.0.0/12"])
    assert client_ip(_request(peer, xff)) == expected


# ── Redis-backed limits ───────────────────────────────────────────────────────


@pytest.fixture
def redis_limits(monkeypatch):
    import redis

    try:
        redis.Redis.from_url(REDIS_URL, socket_connect_timeout=0.5).ping()
    except Exception:
        pytest.skip("Redis isn't available")
    monkeypatch.setattr(get_settings(), "rate_limit_backend", "redis")
    monkeypatch.setattr(get_settings(), "redis_url", REDIS_URL)
    monkeypatch.setattr(ratelimit, "_redis_client", None)
    monkeypatch.setattr(ratelimit, "_redis_down_until", 0.0)
    yield
    monkeypatch.setattr(ratelimit, "_redis_client", None)


def test_redis_limits_are_shared_between_processes(redis_limits):
    # Two limiter objects with one name stand in for the same limit in two API processes.
    a = ratelimit.RateLimiter("test-shared", limit=3, window_seconds=60)
    b = ratelimit.RateLimiter("test-shared", limit=3, window_seconds=60)
    a.reset()
    a.hit("k")
    b.hit("k")
    a.hit("k")
    with pytest.raises(ApiError) as exc:
        b.hit("k")
    assert exc.value.status == 429
    b.hit("other-key")  # keys are independent
    a.reset()


def test_redis_keys_never_hold_the_raw_identifier(redis_limits):
    a = ratelimit.RateLimiter("test-hash", limit=5, window_seconds=60)
    a.reset()
    a.hit("fahim@example.com")
    keys = [k.decode() for k in ratelimit._redis().scan_iter("kx:rl:test-hash:*")]
    assert keys and all("fahim" not in k for k in keys)
    a.reset()


def test_unreachable_redis_falls_back_to_per_process_limits(monkeypatch):
    monkeypatch.setattr(get_settings(), "rate_limit_backend", "redis")
    monkeypatch.setattr(get_settings(), "redis_url", "redis://127.0.0.1:1/0")
    monkeypatch.setattr(ratelimit, "_redis_client", None)
    monkeypatch.setattr(ratelimit, "_redis_down_until", 0.0)
    limiter = ratelimit.RateLimiter("test-fallback", limit=2, window_seconds=60)
    limiter.hit("k")
    limiter.hit("k")
    with pytest.raises(ApiError):
        limiter.hit("k")
    monkeypatch.setattr(ratelimit, "_redis_client", None)


def test_distributed_guessing_against_one_account_is_capped(client):
    from tests.conftest import make_client, register

    register(client)
    body = {"email": "fahim@example.com", "password": "wrong-password-123"}
    codes = []
    for _ in range(32):
        # A fresh client each time; in production each would come from a different IP.
        c = make_client()
        ratelimit.login_limiter.reset()  # defeat the per-IP limit, as rotating IPs would
        codes.append(c.post("/api/v1/auth/login", json=body).status_code)
    assert codes[:30] == [401] * 30 and codes[30:] == [429, 429]


# ── Production defaults ───────────────────────────────────────────────────────


def test_production_forces_secure_cookies():
    s = Settings(env="production", secret_key="x" * 40, cookie_secure=False)
    assert s.cookie_secure is True


def test_production_does_not_publish_api_docs(monkeypatch):
    from app import main

    prod = Settings(env="production", secret_key="x" * 40)
    monkeypatch.setattr(main, "get_settings", lambda: prod)
    paths = {getattr(r, "path", None) for r in main.create_app().routes}
    assert "/api/docs" not in paths and "/api/openapi.json" not in paths
    assert "/api/health" in paths


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("CON", "_CON"),
        ("nul.txt", "_nul.txt"),
        ("com1.log", "_com1.log"),
        ("console.log", "console.log"),
    ],
)
def test_reserved_windows_names_are_renamed(raw, expected):
    assert safe_filename(raw) == expected
