from itertools import pairwise

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError

from app.db import SessionLocal, set_tenant
from app.models import Organization
from app.services import audit
from tests.conftest import admin_engine, create_finding, create_project, register


def _org_id(slug: str):
    with SessionLocal() as db:
        return db.scalar(select(Organization.id).where(Organization.slug == slug))


def test_chain_links_each_event_to_the_previous(client):
    org = register(client)
    create_project(client, org)
    create_finding(client, org)
    events = client.get(f"/api/v1/orgs/{org}/audit").json()
    events.reverse()
    assert events[0]["prev_hash"] == audit.GENESIS
    for prev, cur in pairwise(events):
        assert cur["prev_hash"] == prev["hash"]
        assert cur["seq"] == prev["seq"] + 1
    assert client.get(f"/api/v1/orgs/{org}/audit/verify").json()["verified"] is True


def test_database_rejects_updates_and_deletes(client):
    org = register(client)
    create_project(client, org)
    org_id = _org_id(org)
    with SessionLocal() as db:
        set_tenant(db, org_id)
        with pytest.raises(DBAPIError, match="append-only"):
            db.execute(text("UPDATE audit_events SET action = 'tampered'"))
        db.rollback()
        set_tenant(db, org_id)
        with pytest.raises(DBAPIError, match="append-only"):
            db.execute(text("DELETE FROM audit_events"))


def test_tampering_with_history_is_detected(client):
    org = register(client)
    create_project(client, org)
    create_finding(client, org)
    org_id = _org_id(org)
    # Simulate an attacker with database owner rights who disables the trigger.
    with admin_engine.begin() as conn:
        conn.execute(text("SELECT set_config('app.org_id', :o, true)"), {"o": str(org_id)})
        conn.execute(text("ALTER TABLE audit_events DISABLE TRIGGER audit_events_no_update"))
        conn.execute(text('UPDATE audit_events SET data = \'{"title": "edited"}\' WHERE seq = 2'))
        conn.execute(text("ALTER TABLE audit_events ENABLE TRIGGER audit_events_no_update"))
    report = client.get(f"/api/v1/orgs/{org}/audit/verify").json()
    assert report == {
        "verified": False,
        "entries": 2,
        "first_broken_seq": 2,
        "reason": "content hash mismatch",
    }


def test_only_permitted_roles_read_audit_log(client):
    org = register(client)
    assert client.get(f"/api/v1/orgs/{org}/audit").status_code == 200
