import re

import httpx
import pyotp
import pytest

from app.email import Message, ResendMailer
from tests.conftest import PASSWORD, make_client, register
from tests.test_mfa import _enable, _next_code

EMAIL = "fahim@example.com"
NEW = "a brand new long passphrase"
FORGOT = "/api/v1/auth/password/forgot"
CHECK = "/api/v1/auth/password/reset/check"
RESET = "/api/v1/auth/password/reset"


def _token(outbox) -> str:
    match = re.search(r"/reset-password#token=([\w-]+)", outbox.outbox[-1].text)
    assert match, outbox.outbox[-1].text
    return match.group(1)


def _login(c, password=PASSWORD):
    return c.post("/api/v1/auth/login", json={"email": EMAIL, "password": password})


def test_forgot_answers_the_same_whether_or_not_the_account_exists(client, outbox):
    register(client)
    anon = make_client()
    known = anon.post(FORGOT, json={"email": EMAIL.upper()})
    unknown = anon.post(FORGOT, json={"email": "nobody@example.com"})
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()
    assert [m.to for m in outbox.outbox] == [EMAIL]
    msg = outbox.outbox[0]
    assert msg.subject == "Reset your KinetixZero password" and msg.idempotency_key
    # The token travels in the fragment, never the path or query string.
    assert "#token=" in msg.text and "?token" not in msg.text


def test_reset_flow_changes_password_and_signs_out_every_session(client, outbox):
    register(client)
    anon = make_client()
    anon.post(FORGOT, json={"email": EMAIL})
    token = _token(outbox)
    status = anon.post(CHECK, json={"token": token}).json()
    assert status == {"valid": True, "mfa_required": False, "email_hint": "f••••@example.com"}

    assert anon.post(RESET, json={"token": token, "password": NEW}).status_code == 204
    assert client.get("/api/v1/auth/me").status_code == 401  # the old session is gone
    assert _login(make_client()).status_code == 401
    assert _login(make_client(), NEW).status_code == 200
    assert outbox.outbox[-1].subject == "Your KinetixZero password was changed"
    # Single use.
    r = anon.post(RESET, json={"token": token, "password": "yet another passphrase"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "reset_invalid"
    assert anon.post(CHECK, json={"token": token}).json() == {
        "valid": False,
        "mfa_required": False,
        "email_hint": None,
    }


def test_reset_rejects_short_passwords_and_garbage_tokens(client, outbox):
    register(client)
    anon = make_client()
    anon.post(FORGOT, json={"email": EMAIL})
    assert anon.post(RESET, json={"token": _token(outbox), "password": "short"}).status_code == 422
    r = anon.post(RESET, json={"token": "x" * 43, "password": NEW})
    assert r.status_code == 400


def test_expired_link_is_refused(client, outbox):
    from sqlalchemy import text

    from tests.conftest import admin_engine

    register(client)
    anon = make_client()
    anon.post(FORGOT, json={"email": EMAIL})
    token = _token(outbox)
    with admin_engine.begin() as conn:
        conn.execute(text("UPDATE password_resets SET expires_at = now() - interval '1 minute'"))
    assert anon.post(RESET, json={"token": token, "password": NEW}).status_code == 400


def test_a_newer_password_change_voids_outstanding_links(client, outbox):
    register(client)
    make_client().post(FORGOT, json={"email": EMAIL})
    token = _token(outbox)
    r = client.post(
        "/api/v1/auth/password/change",
        json={"current_password": PASSWORD, "new_password": NEW},
    )
    assert r.status_code == 204
    assert make_client().post(RESET, json={"token": token, "password": "x" * 20}).status_code == 400


def test_reset_does_not_bypass_two_step_verification(client, outbox):
    register(client)
    secret, _ = _enable(client)
    anon = make_client()
    anon.post(FORGOT, json={"email": EMAIL})
    token = _token(outbox)
    assert anon.post(CHECK, json={"token": token}).json()["mfa_required"] is True

    r = anon.post(RESET, json={"token": token, "password": NEW})
    assert r.status_code == 401 and r.json()["error"]["code"] == "invalid_code"
    r = anon.post(RESET, json={"token": token, "password": NEW, "code": _next_code(secret)})
    assert r.status_code == 204
    assert _login(make_client(), NEW).json()["mfa_required"] is True


def test_reset_with_mfa_accepts_a_recovery_code(client, outbox):
    register(client)
    _, recovery = _enable(client)
    anon = make_client()
    anon.post(FORGOT, json={"email": EMAIL})
    r = anon.post(
        RESET, json={"token": _token(outbox), "password": NEW, "recovery_code": recovery[0]}
    )
    assert r.status_code == 204


def test_wrong_codes_burn_the_link(client, outbox):
    register(client)
    secret, _ = _enable(client)
    anon = make_client()
    anon.post(FORGOT, json={"email": EMAIL})
    token = _token(outbox)
    for _ in range(5):
        anon.post(RESET, json={"token": token, "password": NEW, "code": "000000"})
    good = pyotp.TOTP(secret).now()
    r = anon.post(RESET, json={"token": token, "password": NEW, "code": good})
    assert r.status_code == 400


def test_reset_emails_are_capped_per_address_without_revealing_it(client, outbox):
    register(client)
    anon = make_client()
    responses = [anon.post(FORGOT, json={"email": EMAIL}) for _ in range(5)]
    assert {r.status_code for r in responses} == {202}
    assert len(outbox.outbox) == 3


def test_change_password_requires_the_current_one_and_keeps_this_session(client, outbox):
    register(client)
    other = make_client()
    assert _login(other).status_code == 200
    change = "/api/v1/auth/password/change"
    r = client.post(change, json={"current_password": "wrong", "new_password": NEW})
    assert r.status_code == 403
    r = client.post(change, json={"current_password": PASSWORD, "new_password": PASSWORD})
    assert r.status_code == 422 and r.json()["error"]["code"] == "password_unchanged"
    r = client.post(change, json={"current_password": PASSWORD, "new_password": NEW})
    assert r.status_code == 204
    assert client.get("/api/v1/auth/me").status_code == 200
    assert other.get("/api/v1/auth/me").status_code == 401
    assert outbox.outbox[-1].subject == "Your KinetixZero password was changed"


def test_turning_off_mfa_sends_a_notice(client, outbox):
    register(client)
    secret, _ = _enable(client)
    r = client.post(
        "/api/v1/auth/mfa/disable", json={"password": PASSWORD, "code": _next_code(secret)}
    )
    assert r.status_code == 204
    assert outbox.outbox[-1].subject == "Two-step verification was turned off"


def test_invitations_are_emailed(client, outbox):
    org = register(client)
    r = client.post(
        f"/api/v1/orgs/{org}/invitations", json={"email": "ava@example.com", "role": "researcher"}
    )
    assert r.status_code == 201 and r.json()["emailed"] is True
    msg = outbox.outbox[-1]
    assert msg.to == "ava@example.com"
    assert "Fahim Abrar invited you to Fahim's lab" in msg.subject
    assert r.json()["link"] in msg.text


# ── Delivery backends ─────────────────────────────────────────────────────────


def test_resend_backend_posts_with_bearer_key_and_idempotency_key():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["headers"] = dict(request.headers)
        seen["body"] = request.read()
        return httpx.Response(200, json={"id": "abc"})

    mailer = ResendMailer(
        api_key="re_test",
        sender="KinetixZero <security@kinetix.example>",
        client=httpx.Client(transport=httpx.MockTransport(handler)),
    )
    mailer.send(
        Message(to="a@example.com", subject="S", text="Hi <b>\n\nTwo", idempotency_key="k1")
    )
    assert seen["url"] == "https://api.resend.com/emails"
    assert seen["headers"]["authorization"] == "Bearer re_test"
    assert seen["headers"]["idempotency-key"] == "k1"
    import json

    body = json.loads(seen["body"])
    assert body["to"] == ["a@example.com"] and body["from"].startswith("KinetixZero")
    assert "&lt;b&gt;" in body["html"]  # text is escaped in the HTML twin


@pytest.mark.parametrize("status", [401, 422, 500])
def test_resend_failures_never_raise(status):
    mailer = ResendMailer(
        api_key="k",
        sender="s@x",
        client=httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(status))),
    )
    mailer.send(Message(to="a@example.com", subject="S", text="T"))


def test_shared_demo_account_cannot_lock_others_out(client, outbox, monkeypatch):
    from app.config import get_settings

    register(client)
    monkeypatch.setattr(get_settings(), "demo_account_email", EMAIL.upper())
    r = client.post(
        "/api/v1/auth/password/change", json={"current_password": PASSWORD, "new_password": NEW}
    )
    assert r.status_code == 403 and r.json()["error"]["code"] == "demo_account"
    assert client.post("/api/v1/auth/mfa/setup", json={"password": PASSWORD}).status_code == 403
    assert make_client().post(FORGOT, json={"email": EMAIL}).status_code == 202
    assert outbox.outbox == []
