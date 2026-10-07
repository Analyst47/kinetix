"""Hash-chained audit log.

hash_n = SHA-256( prev_hash || canonical_json(seq, actor, action, subject, data, created_at) )

The chain is per organization. Appends take a row lock on the organization so two
concurrent writers can never fork the chain.
"""

import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditEvent, Organization, User

GENESIS = "0" * 64


def _canonical(
    *,
    seq: int,
    actor_id: uuid.UUID | None,
    actor_label: str,
    action: str,
    subject_type: str,
    subject_id: str,
    data: dict[str, Any],
    created_at: datetime,
) -> bytes:
    payload = {
        "seq": seq,
        "actor_id": str(actor_id) if actor_id else None,
        "actor_label": actor_label,
        "action": action,
        "subject_type": subject_type,
        "subject_id": subject_id,
        "data": data,
        "created_at": created_at.astimezone(UTC).isoformat(timespec="microseconds"),
    }
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def compute_hash(prev_hash: str, canonical: bytes) -> str:
    return hashlib.sha256(prev_hash.encode() + canonical).hexdigest()


def record(
    db: Session,
    *,
    org_id: uuid.UUID,
    actor: User | None,
    action: str,
    subject_type: str,
    subject_id: str,
    data: dict[str, Any] | None = None,
    actor_label: str | None = None,
) -> AuditEvent:
    data = json.loads(json.dumps(data or {}, default=str))
    db.execute(select(Organization.id).where(Organization.id == org_id).with_for_update())
    last = db.execute(
        select(AuditEvent.seq, AuditEvent.hash)
        .where(AuditEvent.org_id == org_id)
        .order_by(AuditEvent.seq.desc())
        .limit(1)
    ).first()
    seq = (last.seq + 1) if last else 1
    prev_hash = last.hash if last else GENESIS
    created_at = datetime.now(UTC)
    label = actor_label or (actor.name if actor else "system")
    canonical = _canonical(
        seq=seq,
        actor_id=actor.id if actor else None,
        actor_label=label,
        action=action,
        subject_type=subject_type,
        subject_id=subject_id,
        data=data,
        created_at=created_at,
    )
    event = AuditEvent(
        org_id=org_id,
        seq=seq,
        actor_id=actor.id if actor else None,
        actor_label=label,
        action=action,
        subject_type=subject_type,
        subject_id=subject_id,
        data=data,
        created_at=created_at,
        prev_hash=prev_hash,
        hash=compute_hash(prev_hash, canonical),
    )
    db.add(event)
    db.flush()
    return event


@dataclass
class ChainReport:
    verified: bool
    entries: int
    first_broken_seq: int | None = None
    reason: str | None = None


def verify_chain(db: Session, org_id: uuid.UUID) -> ChainReport:
    events = db.scalars(
        select(AuditEvent).where(AuditEvent.org_id == org_id).order_by(AuditEvent.seq)
    ).all()
    prev = GENESIS
    for expected_seq, ev in enumerate(events, start=1):
        if ev.seq != expected_seq:
            return ChainReport(False, len(events), ev.seq, "sequence gap")
        if ev.prev_hash != prev:
            return ChainReport(False, len(events), ev.seq, "previous hash mismatch")
        canonical = _canonical(
            seq=ev.seq,
            actor_id=ev.actor_id,
            actor_label=ev.actor_label,
            action=ev.action,
            subject_type=ev.subject_type,
            subject_id=ev.subject_id,
            data=ev.data,
            created_at=ev.created_at,
        )
        if compute_hash(prev, canonical) != ev.hash:
            return ChainReport(False, len(events), ev.seq, "content hash mismatch")
        prev = ev.hash
    return ChainReport(True, len(events))
