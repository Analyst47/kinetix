"""Deleting a project removes everything under it, keeps the audit chain intact, and is
limited to owners and admins of that workspace."""

from sqlalchemy import select, text

from app.db import SessionLocal
from app.models import Membership, Organization, User
from app.models.enums import Role
from tests.conftest import admin_engine, create_finding, create_project, make_client, register

_COUNTS = {
    "projects": text("SELECT count(*) FROM projects"),
    "findings": text("SELECT count(*) FROM findings"),
}


def _count(table: str) -> int:
    # Counted as the owner, past row-level security, to see everything that's left.
    with admin_engine.connect() as conn:
        return conn.execute(_COUNTS[table]).scalar_one()


def test_delete_removes_the_project_and_its_children_and_is_audited(client):
    org = register(client)
    create_project(client, org)
    finding = create_finding(client, org)
    base = f"/api/v1/orgs/{org}/projects/juice-shop"
    # A second project whose finding points at one in the doomed project as its duplicate.
    create_project(client, org, slug="other")
    other = create_finding(client, org, project="other")
    with admin_engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE findings SET duplicate_of_id = "
                "(SELECT id FROM findings WHERE number = :doomed) WHERE number = :other"
            ),
            {"doomed": int(finding["public_id"][4:]), "other": int(other["public_id"][4:])},
        )
    assert _count("findings") == 2

    r = client.delete(base, params={"confirm": "juice-shop"})
    assert r.status_code == 204, r.text
    assert client.get(base).status_code == 404
    assert _count("projects") == 1 and _count("findings") == 1
    # The survivor no longer points at a deleted finding.
    with admin_engine.connect() as conn:
        assert conn.execute(text("SELECT duplicate_of_id FROM findings")).scalar_one() is None

    events = client.get(f"/api/v1/orgs/{org}/audit").json()
    deleted = next(e for e in events if e["action"] == "project.deleted")
    assert deleted["subject_id"] == "juice-shop" and deleted["data"]["findings"] == 1
    assert client.get(f"/api/v1/orgs/{org}/audit/verify").json()["verified"] is True


def test_delete_requires_the_exact_url_name(client):
    org = register(client)
    create_project(client, org)
    base = f"/api/v1/orgs/{org}/projects/juice-shop"
    r = client.delete(base, params={"confirm": "Juice Shop"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "confirm_mismatch"
    assert client.delete(base).status_code == 422  # confirm is required
    assert client.get(base).status_code == 200


def test_only_owners_and_admins_can_delete_and_never_across_workspaces(client):
    org = register(client)
    create_project(client, org)
    base = f"/api/v1/orgs/{org}/projects/juice-shop"

    member = make_client()
    register(member, email="r@example.com", org="R")
    with SessionLocal() as db:
        db.add(
            Membership(
                org_id=db.scalar(select(Organization.id).where(Organization.slug == org)),
                user_id=db.scalar(select(User.id).where(User.email == "r@example.com")),
                role=Role.RESEARCHER,
            )
        )
        db.commit()
    assert member.delete(base, params={"confirm": "juice-shop"}).status_code == 403

    outsider = make_client()
    register(outsider, email="m@example.com", org="Mallory")
    assert outsider.delete(base, params={"confirm": "juice-shop"}).status_code == 404
    assert client.get(base).status_code == 200
