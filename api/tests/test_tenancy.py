"""Tenant isolation: the API refuses cross-org access, and the database does too."""

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError

from app import dbguard
from app.db import SessionLocal, engine, set_tenant
from app.models import Finding, Membership, Organization, User
from app.models.enums import Role
from tests.conftest import admin_engine, create_finding, create_project, make_client, register


def test_non_member_gets_404_not_403(client):
    org = register(client)
    create_project(client, org)
    create_finding(client, org)

    outsider = make_client()
    register(outsider, email="mallory@example.com", org="Mallory Inc")
    for path in (
        f"/api/v1/orgs/{org}/projects",
        f"/api/v1/orgs/{org}/projects/juice-shop/findings",
        f"/api/v1/orgs/{org}/projects/juice-shop/findings/FND-000001",
        "/api/v1/orgs/does-not-exist/projects",
    ):
        r = outsider.get(path)
        assert r.status_code == 404, path
        assert r.json()["error"]["code"] == "not_found"


def test_finding_numbers_are_per_organization(client):
    org_a = register(client)
    create_project(client, org_a)
    create_finding(client, org_a)

    b = make_client()
    org_b = register(b, email="b@example.com", org="Lab B")
    create_project(b, org_b)
    assert create_finding(b, org_b)["public_id"] == "FND-000001"
    # Org B can't reach org A's FND-000001 through its own project path either.
    assert b.get(f"/api/v1/orgs/{org_a}/projects/juice-shop/findings/FND-000001").status_code == 404


def test_row_level_security_hides_other_tenants_rows_without_any_filter(client):
    org_a = register(client)
    create_project(client, org_a)
    create_finding(client, org_a)
    b = make_client()
    org_b = register(b, email="b@example.com", org="Lab B")

    with SessionLocal() as db:
        a_id = db.scalar(select(Organization.id).where(Organization.slug == org_a))
        b_id = db.scalar(select(Organization.id).where(Organization.slug == org_b))

        # No tenant bound: nothing is visible.
        assert db.scalars(select(Finding)).all() == []
        db.rollback()

        set_tenant(db, b_id)
        assert db.scalars(select(Finding)).all() == []
        db.rollback()

        set_tenant(db, a_id)
        assert len(db.scalars(select(Finding)).all()) == 1


def test_row_level_security_blocks_writes_into_another_tenant(client):
    org_a = register(client)
    create_project(client, org_a)
    b = make_client()
    org_b = register(b, email="b@example.com", org="Lab B")

    with SessionLocal() as db:
        a_id = db.scalar(select(Organization.id).where(Organization.slug == org_a))
        b_id = db.scalar(select(Organization.id).where(Organization.slug == org_b))
        set_tenant(db, b_id)
        try:
            db.execute(
                text(
                    "INSERT INTO targets (id, org_id, project_id, kind, name, locator, created_at) "
                    "SELECT gen_random_uuid(), :a, id, 'archive', 'x', 'x', now() FROM projects"
                ),
                {"a": a_id},
            )
            db.commit()
            inserted = True
        except Exception:
            db.rollback()
            inserted = False
        # Either the insert errors, or (since tenant B can't see A's projects) it inserts nothing.
        set_tenant(db, a_id)
        assert db.scalar(text("SELECT count(*) FROM targets")) == 0 or not inserted


def test_viewer_cannot_create_findings_and_reviewer_cannot_confirm(client):
    org = register(client)
    create_project(client, org)
    finding = create_finding(client, org)

    viewer = make_client()
    register(viewer, email="viewer@example.com", org="Viewer home")
    reviewer = make_client()
    register(reviewer, email="reviewer@example.com", org="Reviewer home")
    with SessionLocal() as db:
        org_id = db.scalar(select(Organization.id).where(Organization.slug == org))
        for email, role in (
            ("viewer@example.com", Role.VIEWER),
            ("reviewer@example.com", Role.REVIEWER),
        ):
            uid = db.scalar(select(User.id).where(User.email == email))
            db.add(Membership(org_id=org_id, user_id=uid, role=role))
        db.commit()

    base = f"/api/v1/orgs/{org}/projects/juice-shop/findings"
    assert viewer.get(base).status_code == 200
    assert viewer.post(base, json={"title": "x" * 5, "severity": "low"}).status_code == 403
    r = reviewer.post(f"{base}/{finding['public_id']}/transitions", json={"status": "confirmed"})
    assert r.status_code == 403
    # Reviewers may close findings.
    r = reviewer.post(
        f"{base}/{finding['public_id']}/transitions", json={"status": "false_positive"}
    )
    assert r.status_code == 200
    assert r.json()["status"] == "false_positive"


def test_app_role_cannot_bypass_isolation_or_alter_the_schema():
    with engine.connect() as conn:
        assert dbguard.rls_bypass_reason(conn) is None
        with pytest.raises(DBAPIError):
            conn.execute(text("ALTER TABLE audit_events DISABLE TRIGGER audit_events_no_update"))
        conn.rollback()
        with pytest.raises(DBAPIError):
            conn.execute(text("ALTER TABLE findings NO FORCE ROW LEVEL SECURITY"))


def test_startup_guard_refuses_a_superuser_connection_in_production():
    with admin_engine.connect() as conn:
        if dbguard.rls_bypass_reason(conn) is None:
            pytest.skip("test admin connection isn't a superuser")
        with pytest.raises(RuntimeError, match="Row-level security would not apply"):
            dbguard.enforce(conn, production=True)
        dbguard.enforce(conn, production=False)  # development only warns
