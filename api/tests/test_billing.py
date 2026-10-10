"""Per-user AI quotas, plans, and their isolation."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError

from app.billing import entitlements
from app.config import get_settings
from app.db import SessionLocal, set_user
from app.errors import ApiError
from app.models import User, UserPlan
from app.routers import ai as ai_router
from tests.conftest import make_client, register
from tests.test_ai import GOOD, _setup


@pytest.fixture(autouse=True)
def _reset_limiter():
    ai_router._limiter.reset()


def _user_id(email: str = "fahim@example.com"):
    with SessionLocal() as db:
        return db.scalar(select(User.id).where(User.email == email))


def test_plan_catalog_is_public_and_quotas_come_from_settings(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "ai_free_searches", 7)
    plans = {p["key"]: p for p in make_client().get("/api/v1/billing/plans").json()}
    assert list(plans) == ["free", "pro", "team"]
    assert plans["free"]["ai_searches"] == 7 and plans["free"]["ai_period"] == "lifetime"
    assert plans["pro"]["ai_period"] == "month" and plans["pro"]["price_monthly_usd"] > 0
    assert plans["team"]["price_monthly_usd"] is None and plans["team"]["self_serve"] is False


def test_billing_requires_sign_in(client):
    assert make_client().get("/api/v1/billing").status_code == 401


def test_free_quota_counts_each_search_then_blocks_with_upgrade(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "ai_free_searches", 3)
    org, url, provider = _setup(client, monkeypatch, GOOD)
    assert client.post(f"{url}/ai/analyze").status_code == 201
    provider.output = {"answer": "a", "confidence": "low", "citations": []}
    assert client.post(f"{url}/ai/ask", json={"question": "Is it reachable?"}).status_code == 201
    provider.output = {"text": "Draft."}
    assert client.post(f"{url}/ai/draft", json={"field": "description"}).status_code == 201

    usage = client.get(f"/api/v1/orgs/{org}/ai").json()["usage"]
    assert usage["searches_used"] == 3 and usage["searches_remaining"] == 0

    calls = len(provider.calls)
    r = client.post(f"{url}/ai/analyze")
    assert r.status_code == 402
    err = r.json()["error"]
    assert err["code"] == "ai_limit_reached"
    assert err["details"] == {"plan": "free", "used": 3, "limit": 3}
    assert "Upgrade" in err["message"]
    assert len(provider.calls) == calls  # the model was never called
    # The charge is recorded in the audit trail with each run.
    event = next(
        e for e in client.get(f"/api/v1/orgs/{org}/audit").json() if e["action"] == "ai.analysis"
    )
    assert event["data"]["quota"] == {"plan": "free", "searches_used": 1, "searches_limit": 3}


def test_a_failed_ai_call_is_not_charged(client, monkeypatch):
    _org, url, provider = _setup(client, monkeypatch, GOOD)

    def boom(**_kw):
        raise ApiError(503, "ai_overloaded", "busy")

    provider.complete = boom  # type: ignore[method-assign]
    assert client.post(f"{url}/ai/analyze").status_code == 503
    assert client.get("/api/v1/billing").json()["usage"]["searches_used"] == 0


def test_quota_is_per_user_not_per_workspace(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "ai_free_searches", 1)
    org, url, _ = _setup(client, monkeypatch, GOOD)
    assert client.post(f"{url}/ai/analyze").status_code == 201
    assert client.post(f"{url}/ai/analyze").status_code == 402

    # A teammate in the same workspace has their own allowance.
    from app.models import Membership, Organization
    from app.models.enums import Role

    mate = make_client()
    register(mate, email="mate@example.com", org="Mate")
    with SessionLocal() as db:
        db.add(
            Membership(
                org_id=db.scalar(select(Organization.id).where(Organization.slug == org)),
                user_id=db.scalar(select(User.id).where(User.email == "mate@example.com")),
                role=Role.RESEARCHER,
            )
        )
        db.commit()
    assert mate.post(f"{url}/ai/analyze").status_code == 201


def test_triage_charges_per_finding_and_caps_the_batch(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "ai_free_searches", 2)
    org, _url, provider = _setup(client, monkeypatch, GOOD)
    base = f"/api/v1/orgs/{org}/projects/juice-shop/findings"
    for i in range(3):
        r = client.post(
            base,
            json={
                "title": f"Noise {i}",
                "severity": "low",
                "cwe": "CWE-79",
                "file_path": "routes/login.ts",
                "line": 4,
            },
        )
        assert r.status_code == 201, r.text
    triage = f"/api/v1/orgs/{org}/projects/juice-shop/ai/triage?limit=10"
    body = client.post(triage).json()
    assert body["reviewed"] == 2 and body["remaining"] == 2 and body["stopped"] is None
    assert len(provider.calls) == 2
    r = client.post(triage)
    assert r.status_code == 402 and r.json()["error"]["code"] == "ai_limit_reached"


def test_paid_plan_quota_resets_each_period(client):
    register(client)
    uid = _user_id()
    start = datetime.now(UTC) - timedelta(days=40)
    with SessionLocal() as db:
        entitlements.apply_subscription(
            db, uid, plan="pro", status="active", period_start=start, period_end=None
        )
        db.commit()
    with SessionLocal() as db:
        set_user(db, uid)
        u = entitlements.consume(db, uid)
        db.commit()
    # 40 days in, the first monthly window has rolled over: usage restarts from this search.
    assert u.plan.key == "pro" and u.used == 1 and u.resets_at is not None
    assert u.resets_at > datetime.now(UTC)
    billing = client.get("/api/v1/billing").json()["usage"]
    assert billing["plan"] == "pro" and billing["searches_used"] == 1
    assert billing["searches_limit"] == get_settings().ai_pro_monthly_searches


def test_lapsed_subscription_falls_back_to_free(client):
    register(client)
    uid = _user_id()
    with SessionLocal() as db:
        entitlements.apply_subscription(
            db, uid, plan="pro", status="past_due", period_start=None, period_end=None
        )
        db.commit()
    assert client.get("/api/v1/billing").json()["usage"]["plan"] == "free"


def test_plan_rows_are_isolated_per_user_by_the_database(client, monkeypatch):
    _org, url, _ = _setup(client, monkeypatch, GOOD)
    client.post(f"{url}/ai/analyze")
    other = make_client()
    register(other, email="b@example.com", org="Lab B")
    me, them = _user_id(), _user_id("b@example.com")

    with SessionLocal() as db:
        # No user bound: nothing is visible, even without a filter.
        assert db.scalars(select(UserPlan)).all() == []
        db.rollback()
        set_user(db, them)
        assert db.scalars(select(UserPlan)).all() == []
        db.rollback()
        set_user(db, me)
        rows = db.scalars(select(UserPlan)).all()
        assert [r.user_id for r in rows] == [me] and rows[0].ai_searches_used == 1
        db.rollback()

        # Nor can one user write a row for (or grant searches to) another.
        set_user(db, them)
        with pytest.raises(DBAPIError):
            db.execute(
                text("INSERT INTO user_plans (user_id, plan) VALUES (:u, 'pro')"), {"u": str(me)}
            )
        db.rollback()
        set_user(db, them)
        assert db.execute(text("UPDATE user_plans SET plan = 'pro'")).rowcount == 0
        db.rollback()


def test_claude_key_comes_from_anthropic_env_and_empty_vars_count_as_unset(monkeypatch):
    from app.config import Settings

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test")
    monkeypatch.setenv("ANTHROPIC_MODEL", "claude-sonnet-5-5")
    # Compose passes optional variables through as empty strings.
    monkeypatch.setenv("KINETIX_AI_MONTHLY_TOKEN_BUDGET", "")
    monkeypatch.setenv("KINETIX_AI_API_KEY", "")
    s = Settings(_env_file=None)
    assert s.ai_provider == "anthropic" and s.ai_managed_enabled is True
    assert s.ai_api_key == "sk-ant-test" and s.ai_model == "claude-sonnet-5-5"
    assert s.ai_monthly_token_budget is None
    assert s.ai_free_searches == 10 and s.billing_enabled is False


def _join(org_slug: str, email: str, role) -> None:
    from app.models import Membership, Organization

    with SessionLocal() as db:
        db.add(
            Membership(
                org_id=db.scalar(select(Organization.id).where(Organization.slug == org_slug)),
                user_id=db.scalar(select(User.id).where(User.email == email)),
                role=role,
            )
        )
        db.commit()


def test_owner_account_is_unlimited_and_not_rate_limited(client, monkeypatch):
    # Configured in a different case than the account: matching ignores case.
    monkeypatch.setattr(get_settings(), "owner_emails", ["fahim@example.com"])
    monkeypatch.setattr(get_settings(), "ai_free_searches", 1)
    org, url, provider = _setup(client, monkeypatch, GOOD)
    usage = client.get("/api/v1/billing").json()["usage"]
    assert usage["unlimited"] is True and usage["sponsor"] == "owner"
    assert usage["plan"] == "owner" and usage["ai_period"] == "unlimited"
    assert usage["searches_limit"] is None and usage["searches_remaining"] is None

    ai_router._limiter.limit = 2  # far below what the owner will use
    try:
        for _ in range(4):
            assert client.post(f"{url}/ai/analyze").status_code == 201
    finally:
        ai_router._limiter.limit = 40
    assert len(provider.calls) == 4
    # Nothing was charged, and each run is still audited as sponsored.
    with SessionLocal() as db:
        set_user(db, _user_id())
        assert db.scalars(select(UserPlan)).all() == []
    event = next(
        e for e in client.get(f"/api/v1/orgs/{org}/audit").json() if e["action"] == "ai.analysis"
    )
    assert event["data"]["quota"] == {"plan": "owner", "unlimited": True, "sponsor": "owner"}


def test_members_of_an_owners_workspace_are_unlimited_strangers_are_not(client, monkeypatch):
    from app.models.enums import Role

    monkeypatch.setattr(get_settings(), "owner_emails", ["FAHIM@example.com".lower()])
    monkeypatch.setattr(get_settings(), "ai_free_searches", 1)
    org, url, _ = _setup(client, monkeypatch, GOOD)

    mate = make_client()
    register(mate, email="mate@example.com", org="Mate")
    _join(org, "mate@example.com", Role.RESEARCHER)
    assert mate.get("/api/v1/billing").json()["usage"]["sponsor"] == "team"
    for _ in range(3):
        assert mate.post(f"{url}/ai/analyze").status_code == 201

    # Someone who only owns their own workspace stays on the metered free plan, even when
    # the owner is a member of *their* workspace (sponsorship flows from owned workspaces).
    stranger = make_client()
    other_org = register(stranger, email="stranger@example.com", org="Elsewhere")
    _join(other_org, "fahim@example.com", Role.ADMIN)
    usage = stranger.get("/api/v1/billing").json()["usage"]
    assert usage["unlimited"] is False and usage["plan"] == "free"


def test_owner_triage_is_not_capped_by_a_quota(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "owner_emails", ["fahim@example.com"])
    monkeypatch.setattr(get_settings(), "ai_free_searches", 1)
    org, _url, provider = _setup(client, monkeypatch, GOOD)
    base = f"/api/v1/orgs/{org}/projects/juice-shop/findings"
    for i in range(3):
        r = client.post(
            base,
            json={
                "title": f"Noise {i}",
                "severity": "low",
                "cwe": "CWE-79",
                "file_path": "routes/login.ts",
                "line": 4,
            },
        )
        assert r.status_code == 201, r.text
    body = client.post(f"/api/v1/orgs/{org}/projects/juice-shop/ai/triage?limit=10").json()
    assert body["reviewed"] == 4 and body["remaining"] == 0 and body["stopped"] is None
    assert len(provider.calls) == 4
