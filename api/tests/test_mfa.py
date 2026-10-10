import pyotp

from app.security import mfa
from tests.conftest import PASSWORD, make_client, register

EMAIL = "fahim@example.com"


def _enable(client) -> tuple[str, list[str]]:
    setup = client.post("/api/v1/auth/mfa/setup", json={"password": PASSWORD})
    assert setup.status_code == 200, setup.text
    secret = setup.json()["secret"]
    assert setup.json()["otpauth_uri"].startswith("otpauth://totp/KinetixZero:")
    r = client.post("/api/v1/auth/mfa/enable", json={"code": pyotp.TOTP(secret).now()})
    assert r.status_code == 200, r.text
    return secret, r.json()["recovery_codes"]


def _next_code(secret: str) -> str:
    import time

    return pyotp.TOTP(secret).at(time.time() + 30)


def _login(c):
    return c.post("/api/v1/auth/login", json={"email": EMAIL, "password": PASSWORD})


def test_setup_requires_password(client):
    register(client)
    r = client.post("/api/v1/auth/mfa/setup", json={"password": "wrong-password"})
    assert r.status_code == 403


def test_enabling_mfa_returns_ten_single_use_recovery_codes(client):
    register(client)
    _, codes = _enable(client)
    assert len(codes) == 10 and len(set(codes)) == 10
    status = client.get("/api/v1/auth/mfa").json()
    assert status["enabled"] is True and status["recovery_codes_remaining"] == 10
    assert client.get("/api/v1/auth/me").json()["mfa_enabled"] is True


def test_secret_is_encrypted_at_rest(client, db):
    from sqlalchemy import select

    from app.models import User

    register(client)
    secret, _ = _enable(client)
    stored = db.scalar(select(User.totp_secret_enc))
    assert secret not in stored
    assert mfa.decrypt(stored) == secret


def test_password_alone_does_not_create_a_session_when_mfa_is_on(client):
    register(client)
    secret, _ = _enable(client)
    c = make_client()
    r = _login(c)
    assert r.status_code == 200
    assert r.json()["mfa_required"] is True
    assert "kx_session" not in c.cookies
    assert c.get("/api/v1/auth/me").status_code == 401

    ok = c.post(
        "/api/v1/auth/mfa/verify",
        # The current step was consumed when MFA was enabled; the next one is within drift.
        json={"challenge": r.json()["challenge"], "code": _next_code(secret)},
    )
    assert ok.status_code == 200, ok.text
    assert c.get("/api/v1/auth/me").status_code == 200


def test_totp_code_cannot_be_replayed(client):
    register(client)
    secret, _ = _enable(client)
    code = pyotp.TOTP(secret).now()  # same step that enable() may have consumed
    c = make_client()
    challenge = _login(c).json()["challenge"]
    r = c.post("/api/v1/auth/mfa/verify", json={"challenge": challenge, "code": code})
    # The enable step consumed this time step, so the identical code is refused.
    assert r.status_code == 401


def test_challenge_locks_after_five_wrong_codes(client):
    register(client)
    secret, _ = _enable(client)
    c = make_client()
    challenge = _login(c).json()["challenge"]
    for _ in range(5):
        assert (
            c.post(
                "/api/v1/auth/mfa/verify", json={"challenge": challenge, "code": "000000"}
            ).status_code
            == 401
        )
    r = c.post(
        "/api/v1/auth/mfa/verify", json={"challenge": challenge, "code": pyotp.TOTP(secret).now()}
    )
    assert r.json()["error"]["code"] == "mfa_expired"


def test_recovery_code_works_once(client):
    register(client)
    _, codes = _enable(client)
    c = make_client()
    ch = _login(c).json()["challenge"]
    assert (
        c.post(
            "/api/v1/auth/mfa/verify", json={"challenge": ch, "recovery_code": codes[0].upper()}
        ).status_code
        == 200
    )
    d = make_client()
    ch2 = _login(d).json()["challenge"]
    assert (
        d.post(
            "/api/v1/auth/mfa/verify", json={"challenge": ch2, "recovery_code": codes[0]}
        ).status_code
        == 401
    )


def test_enabling_mfa_signs_out_other_sessions(client):
    register(client)
    other = make_client()
    _login(other)
    assert other.get("/api/v1/auth/me").status_code == 200
    _enable(client)
    assert other.get("/api/v1/auth/me").status_code == 401
    assert client.get("/api/v1/auth/me").status_code == 200


def test_disable_requires_password_and_code(client):
    register(client)
    secret, _ = _enable(client)
    assert (
        client.post(
            "/api/v1/auth/mfa/disable", json={"password": PASSWORD, "code": "123456"}
        ).status_code
        == 422
    )
    import time

    future = pyotp.TOTP(secret).at(time.time() + 30)
    r = client.post("/api/v1/auth/mfa/disable", json={"password": PASSWORD, "code": future})
    assert r.status_code == 204
    assert client.get("/api/v1/auth/mfa").json()["enabled"] is False


def test_match_step_tolerates_one_step_of_drift():
    secret = pyotp.random_base32()
    now = 1_800_000_000
    code_prev = pyotp.TOTP(secret).at(now - 30)
    assert mfa.match_step(secret, code_prev, None, now=now) == now // 30 - 1
    assert mfa.match_step(secret, pyotp.TOTP(secret).at(now - 90), None, now=now) is None
