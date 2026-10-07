from sqlalchemy import select

from app.db import SessionLocal
from app.models import Membership, User
from app.models.enums import Role
from tests.conftest import create_finding, create_project, make_client, register


def _invite(client, org, email, role="researcher"):
    r = client.post(f"/api/v1/orgs/{org}/invitations", json={"email": email, "role": role})
    assert r.status_code == 201, r.text
    return r.json()["link"].rsplit("/", 1)[-1]


def test_invite_accept_flow_grants_role(client):
    org = register(client)
    token = _invite(client, org, "ava@example.com")
    preview = make_client().get(f"/api/v1/invitations/{token}").json()
    assert preview["organization"] == "Fahim's lab" and preview["role"] == "researcher"

    ava = make_client()
    register(ava, email="ava@example.com", org="Ava home")
    r = ava.post(f"/api/v1/invitations/{token}/accept")
    assert r.status_code == 200, r.text
    assert ava.get(f"/api/v1/orgs/{org}/projects").status_code == 200
    # Single use.
    assert ava.post(f"/api/v1/invitations/{token}/accept").status_code == 404
    members = client.get(f"/api/v1/orgs/{org}/members").json()
    assert {m["user"]["email"]: m["role"] for m in members} == {
        "fahim@example.com": "owner",
        "ava@example.com": "researcher",
    }


def test_forwarded_invitation_cannot_be_used_by_another_account(client):
    org = register(client)
    token = _invite(client, org, "ava@example.com")
    mallory = make_client()
    register(mallory, email="mallory@example.com", org="M")
    r = mallory.post(f"/api/v1/invitations/{token}/accept")
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "wrong_account"


def test_reinviting_revokes_previous_link(client):
    org = register(client)
    first = _invite(client, org, "ava@example.com")
    _invite(client, org, "ava@example.com", role="viewer")
    assert make_client().get(f"/api/v1/invitations/{first}").status_code == 404
    assert len(client.get(f"/api/v1/orgs/{org}/invitations").json()) == 1


def _add(org_slug: str, email: str, role: Role) -> None:
    with SessionLocal() as db:
        from app.models import Organization

        org_id = db.scalar(select(Organization.id).where(Organization.slug == org_slug))
        uid = db.scalar(select(User.id).where(User.email == email))
        db.add(Membership(org_id=org_id, user_id=uid, role=role))
        db.commit()


def test_admin_cannot_touch_owners_or_invite_owners(client):
    org = register(client)
    admin = make_client()
    register(admin, email="admin@example.com", org="A")
    _add(org, "admin@example.com", Role.ADMIN)
    owner_id = client.get("/api/v1/auth/me").json()["user"]["id"]
    assert (
        admin.patch(f"/api/v1/orgs/{org}/members/{owner_id}", json={"role": "viewer"}).status_code
        == 403
    )
    assert admin.delete(f"/api/v1/orgs/{org}/members/{owner_id}").status_code == 403
    assert (
        admin.post(
            f"/api/v1/orgs/{org}/invitations", json={"email": "x@example.com", "role": "owner"}
        ).status_code
        == 403
    )


def test_last_owner_cannot_leave_or_be_demoted(client):
    org = register(client)
    me = client.get("/api/v1/auth/me").json()["user"]["id"]
    r = client.patch(f"/api/v1/orgs/{org}/members/{me}", json={"role": "admin"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "last_owner"
    assert client.delete(f"/api/v1/orgs/{org}/members/{me}").status_code == 409


def test_researcher_cannot_manage_members(client):
    org = register(client)
    res = make_client()
    register(res, email="r@example.com", org="R")
    _add(org, "r@example.com", Role.RESEARCHER)
    assert (
        res.post(
            f"/api/v1/orgs/{org}/invitations", json={"email": "z@example.com", "role": "viewer"}
        ).status_code
        == 403
    )
    assert res.get(f"/api/v1/orgs/{org}/invitations").status_code == 403


def test_member_changes_are_audited(client):
    org = register(client)
    _invite(client, org, "ava@example.com")
    actions = [e["action"] for e in client.get(f"/api/v1/orgs/{org}/audit").json()]
    assert "member.invited" in actions


def test_report_markdown_export_is_audited_with_its_hash(client):
    import hashlib

    org = register(client)
    create_project(client, org)
    f = create_finding(client, org)
    base = f"/api/v1/orgs/{org}/projects/juice-shop/findings/{f['public_id']}"
    data = client.get(f"{base}/report").json()
    assert data["draft"] is True and data["cwe"] == "CWE-89"
    assert "parameterized" in data["remediation"]

    r = client.post(f"{base}/report/export", json={"format": "markdown"})
    assert r.status_code == 200
    text = r.text
    assert text.startswith("# FND-000001: Potential SQL injection in login handler")
    assert "> **Draft.**" in text
    assert "## Chain of custody" in text
    sha = hashlib.sha256(r.content).hexdigest()
    assert r.headers["x-report-sha256"] == sha
    custody = client.get(f"{base}/custody").json()["events"]
    assert custody[0]["action"] == "report.exported"
    assert custody[0]["data"]["sha256"] == sha
