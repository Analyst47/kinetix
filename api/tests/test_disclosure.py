from datetime import UTC, datetime, timedelta

import httpx
import pytest

from app.errors import ApiError
from app.services import securitytxt
from tests.conftest import create_finding, create_project, make_client, register

VECTOR = "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:N/SC:N/SI:N/SA:N"


def _confirmed(client, org) -> str:
    create_project(client, org)
    f = create_finding(client, org, description="Raw SQL built from req.body.email.")
    url = f"/api/v1/orgs/{org}/projects/juice-shop/findings/{f['public_id']}"
    client.post(f"{url}/transitions", json={"status": "needs_validation"})
    client.post(f"{url}/evidence", files={"file": ("r.txt", b"POST /login", "text/plain")})
    client.patch(url, json={"reproduction": "1. Send ' OR 1=1-- as email.", "cvss_vector": VECTOR})
    r = client.post(f"{url}/transitions", json={"status": "confirmed"})
    assert r.status_code == 200, r.text
    _backdate(org)
    return url


def _backdate(org: str, days: int = 120) -> None:
    """Pretend the finding was discovered a while ago so past notification dates are valid."""
    from sqlalchemy import select, text

    from app.db import engine
    from app.models import Organization

    with engine.begin() as conn:
        org_id = conn.scalar(select(Organization.id).where(Organization.slug == org))
        conn.execute(text("SELECT set_config('app.org_id', :o, true)"), {"o": str(org_id)})
        conn.execute(
            text("UPDATE findings SET created_at = now() - make_interval(days => :d)"), {"d": days}
        )


def _start(client, url, **kw):
    body = {"vendor_name": "OWASP Juice Shop", "contact": "mailto:security@example.org", **kw}
    return client.post(f"{url}/disclosure", json=body)


def _event(client, url, kind, days_ago=0, **kw):
    when = (datetime.now(UTC) - timedelta(days=days_ago)).isoformat()
    return client.post(f"{url}/disclosure/events", json={"kind": kind, "occurred_at": when, **kw})


def test_disclosure_requires_a_confirmed_finding(client):
    org = register(client)
    create_project(client, org)
    f = create_finding(client, org)
    url = f"/api/v1/orgs/{org}/projects/juice-shop/findings/{f['public_id']}"
    r = _start(client, url)
    assert r.status_code == 409 and r.json()["error"]["code"] == "not_confirmed"


def test_full_timeline_drives_the_finding_lifecycle(client):
    org = register(client)
    url = _confirmed(client, org)
    d = _start(client, url).json()
    assert (
        d["stage"] == "draft"
        and d["health"] == "draft"
        and d["allowed_events"] == ["notified", "note"]
    )

    draft = client.get(f"{url}/disclosure/draft").json()
    assert draft["to"] == "mailto:security@example.org"
    assert "Hello OWASP Juice Shop security team" in draft["body"]
    assert "90-day coordinated disclosure" in draft["body"]
    assert "' OR 1=1--" in draft["body"]

    d = _event(client, url, "notified", days_ago=10).json()
    assert d["stage"] == "notified" and d["days_remaining"] == 80 and d["health"] == "on_track"
    assert client.get(url).json()["status"] == "reported"

    d = _event(client, url, "acknowledged", days_ago=8, note="Triaged by vendor").json()
    assert client.get(url).json()["status"] == "vendor_acknowledged"

    d = _event(client, url, "extension", days=30, note="Vendor asked for time").json()
    assert d["days_remaining"] == 110

    assert _event(client, url, "cve_assigned", cve_id="CVE-26-1").status_code == 422
    d = _event(client, url, "cve_assigned", cve_id="CVE-2026-41234").json()
    assert d["cve_id"] == "CVE-2026-41234"

    _event(client, url, "fix_released", days_ago=1)
    assert client.get(url).json()["status"] == "fix_available"
    d = _event(client, url, "public_disclosure", advisory_url="https://example.org/advisory").json()
    assert d["stage"] == "published" and d["health"] == "complete"
    assert client.get(url).json()["status"] == "public_disclosure"

    actions = [e["action"] for e in client.get(f"{url}/custody").json()["events"]]
    for a in (
        "disclosure.started",
        "disclosure.notified",
        "disclosure.extension",
        "disclosure.public_disclosure",
    ):
        assert a in actions

    report = client.post(f"{url}/report/export", json={"format": "markdown"}).text
    assert "## Disclosure timeline" in report and "CVE-2026-41234" in report


def test_public_disclosure_is_allowed_after_deadline_without_a_fix(client):
    org = register(client)
    url = _confirmed(client, org)
    _start(client, url)
    _event(client, url, "notified", days_ago=95)
    d = client.get(f"{url}/disclosure").json()
    assert d["health"] == "overdue" and d["days_remaining"] == -5
    r = _event(client, url, "public_disclosure")
    assert r.status_code == 201
    assert client.get(url).json()["status"] == "public_disclosure"


def test_events_must_follow_the_timeline(client):
    org = register(client)
    url = _confirmed(client, org)
    _start(client, url)
    r = _event(client, url, "acknowledged")
    assert r.status_code == 409 and r.json()["error"]["code"] == "invalid_event"
    r = _event(client, url, "notified", days_ago=-5)
    assert r.status_code == 422 and r.json()["error"]["code"] == "future_date"
    assert _event(client, url, "notified").status_code == 201
    assert _event(client, url, "notified").status_code == 409


def test_due_soon_and_listing_order(client):
    org = register(client)
    url = _confirmed(client, org)
    _start(client, url, deadline_days=30)
    _event(client, url, "notified", days_ago=20)
    items = client.get(f"/api/v1/orgs/{org}/projects/juice-shop/disclosures").json()
    assert items[0]["health"] == "due_soon" and items[0]["days_remaining"] == 10


def test_viewers_cannot_start_disclosures(client):
    from sqlalchemy import select

    from app.db import SessionLocal
    from app.models import Membership, Organization, User
    from app.models.enums import Role

    org = register(client)
    url = _confirmed(client, org)
    viewer = make_client()
    register(viewer, email="v@example.com", org="V")
    with SessionLocal() as db:
        db.add(
            Membership(
                org_id=db.scalar(select(Organization.id).where(Organization.slug == org)),
                user_id=db.scalar(select(User.id).where(User.email == "v@example.com")),
                role=Role.VIEWER,
            )
        )
        db.commit()
    assert _start(viewer, url).status_code == 403


# ── security.txt ──────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "domain",
    ["127.0.0.1", "localhost", "intranet.local", "example.com:8443", "user@example.com", "10.0.0.1",
     "printer.internal", "-bad-.com", "nodots"],
)  # fmt: skip
def test_domain_validation_rejects_unsafe_input(domain):
    with pytest.raises(ApiError):
        securitytxt.normalize_domain(domain)


def test_domain_normalization():
    assert securitytxt.normalize_domain("https://Example.COM/some/path") == "example.com"


@pytest.mark.parametrize(
    "address", ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "::1",
                "::ffff:127.0.0.1", "fc00::1", "0.0.0.0", "100.64.0.1"],
)  # fmt: skip
def test_non_public_resolutions_are_refused(address):
    with pytest.raises(ApiError) as exc:
        securitytxt.fetch("example.com", resolver=lambda _: [address])
    assert exc.value.code == "domain_not_public"


def test_any_private_answer_refuses_the_whole_lookup():
    with pytest.raises(ApiError):
        securitytxt.fetch("example.com", resolver=lambda _: ["93.184.216.34", "127.0.0.1"])


SECURITY_TXT = """# Our policy
Contact: mailto:security@example.com
Contact: https://example.com/report
Expires: 2030-01-01T00:00:00Z
Policy: https://example.com/disclosure
Preferred-Languages: en, fr
"""


def test_fetch_pins_the_checked_address_and_parses():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["host"] = request.headers["host"]
        seen["sni"] = request.extensions.get("sni_hostname")
        return httpx.Response(
            200, text=SECURITY_TXT, headers={"content-type": "text/plain; charset=utf-8"}
        )

    client = httpx.Client(transport=httpx.MockTransport(handler))
    result = securitytxt.fetch("example.com", resolver=lambda _: ["93.184.216.34"], client=client)
    assert seen == {
        "url": "https://93.184.216.34/.well-known/security.txt",
        "host": "example.com",
        "sni": "example.com",
    }
    assert result.contacts == ["mailto:security@example.com", "https://example.com/report"]
    assert result.policy == ["https://example.com/disclosure"]
    assert result.preferred_languages == "en, fr"
    assert result.warnings == []


def test_redirects_are_not_followed():
    client = httpx.Client(
        transport=httpx.MockTransport(
            lambda r: httpx.Response(301, headers={"location": "http://169.254.169.254/"})
        )
    )
    with pytest.raises(ApiError) as exc:
        securitytxt.fetch("example.com", resolver=lambda _: ["93.184.216.34"], client=client)
    assert exc.value.code == "security_txt_missing"


def test_parse_warns_on_expired_and_missing_fields():
    r = securitytxt.parse("Expires: 2020-01-01T00:00:00Z\n", "example.com", "u")
    assert any("expired" in w for w in r.warnings)
    assert any("No Contact" in w for w in r.warnings)


def test_lookup_endpoint_refuses_internal_targets(client, monkeypatch):
    org = register(client)
    monkeypatch.setattr(securitytxt, "system_resolver", lambda _: ["169.254.169.254"])
    monkeypatch.setattr(securitytxt.fetch, "__defaults__", (securitytxt.system_resolver, None))
    r = client.post(f"/api/v1/orgs/{org}/security-txt", json={"domain": "metadata.example.com"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "domain_not_public"


def test_vendor_statuses_can_only_be_reached_through_the_disclosure_timeline(client):
    org = register(client)
    url = _confirmed(client, org)
    detail = client.get(url).json()
    assert "reported" not in detail["allowed_transitions"]
    r = client.post(f"{url}/transitions", json={"status": "reported"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "use_disclosure"
