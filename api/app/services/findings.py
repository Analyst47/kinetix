"""Finding lifecycle: a finding earns 'confirmed' via evidence, reproduction and scoring."""

import hashlib
import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.errors import ApiError, forbidden, not_found
from app.models import Evidence, Finding, Organization, Project, User
from app.models.enums import FindingSource, FindingStatus, Severity
from app.schemas import ReadinessItem
from app.security.permissions import Permission
from app.services import audit

S = FindingStatus

CLOSED = frozenset({S.FALSE_POSITIVE, S.DUPLICATE, S.NOT_A_SECURITY_ISSUE, S.OUT_OF_SCOPE})
OPEN = frozenset({S.DISCOVERED, S.TRIAGE, S.NEEDS_VALIDATION})
# Statuses reached only by recording disclosure timeline events.
DISCLOSURE_DRIVEN = frozenset(
    {S.REPORTED, S.VENDOR_ACKNOWLEDGED, S.FIX_AVAILABLE, S.PUBLIC_DISCLOSURE}
)

TRANSITIONS: dict[FindingStatus, frozenset[FindingStatus]] = {
    S.DISCOVERED: frozenset({S.TRIAGE, S.NEEDS_VALIDATION}) | CLOSED,
    S.TRIAGE: frozenset({S.NEEDS_VALIDATION}) | CLOSED,
    S.NEEDS_VALIDATION: frozenset({S.CONFIRMED, S.TRIAGE}) | CLOSED,
    S.CONFIRMED: frozenset({S.REPORTED, S.NEEDS_VALIDATION}),
    # Public disclosure can follow a fix, or an expired deadline with no fix.
    S.REPORTED: frozenset({S.VENDOR_ACKNOWLEDGED, S.FIX_AVAILABLE, S.PUBLIC_DISCLOSURE}),
    S.VENDOR_ACKNOWLEDGED: frozenset({S.FIX_AVAILABLE, S.PUBLIC_DISCLOSURE}),
    S.FIX_AVAILABLE: frozenset({S.PUBLIC_DISCLOSURE}),
    S.PUBLIC_DISCLOSURE: frozenset(),
    **{closed: frozenset({S.TRIAGE}) for closed in CLOSED},
}


def permission_for(target: FindingStatus) -> Permission:
    if target is S.CONFIRMED:
        return Permission.FINDING_CONFIRM
    if target in CLOSED:
        return Permission.FINDING_CLOSE
    return Permission.FINDING_WRITE


def fingerprint(*parts: str | int | None) -> str:
    return hashlib.sha256(
        "\x1f".join("" if p is None else str(p) for p in parts).encode()
    ).hexdigest()


def next_number(db: Session, org_id: uuid.UUID) -> int:
    org = db.scalar(select(Organization).where(Organization.id == org_id).with_for_update())
    assert org is not None
    org.finding_seq += 1
    return org.finding_seq


def create_finding(
    db: Session,
    *,
    project: Project,
    actor: User | None,
    title: str,
    severity: Severity,
    source: FindingSource,
    description: str = "",
    cwe: str | None = None,
    file_path: str | None = None,
    line: int | None = None,
    rule_id: str | None = None,
    reference: str | None = None,
    scan_id: uuid.UUID | None = None,
    actor_label: str | None = None,
) -> Finding:
    finding = Finding(
        org_id=project.org_id,
        project_id=project.id,
        scan_id=scan_id,
        number=next_number(db, project.org_id),
        title=title,
        description=description,
        severity=severity,
        status=S.DISCOVERED,
        source=source,
        cwe=cwe,
        file_path=file_path,
        line=line,
        rule_id=rule_id,
        reference=reference,
        fingerprint=fingerprint(project.id, source, rule_id or reference or title, file_path, line),
        assignee_id=actor.id if actor else None,
        created_by_id=actor.id if actor else None,
    )
    db.add(finding)
    db.flush()
    audit.record(
        db,
        org_id=project.org_id,
        actor=actor,
        actor_label=actor_label,
        action="finding.created",
        subject_type="finding",
        subject_id=finding.public_id,
        data={"title": title, "severity": severity.value, "source": source.value},
    )
    return finding


def evidence_count(db: Session, finding: Finding) -> int:
    return db.scalar(select(func.count()).where(Evidence.finding_id == finding.id)) or 0


def readiness(db: Session, finding: Finding) -> list[ReadinessItem]:
    n = evidence_count(db, finding)
    return [
        ReadinessItem(
            key="evidence",
            label="Evidence attached",
            done=n > 0,
            detail=f"{n} file{'s' if n != 1 else ''}" if n else None,
        ),
        ReadinessItem(
            key="reproduction",
            label="Reproduction steps written",
            done=bool(finding.reproduction.strip()),
        ),
        ReadinessItem(
            key="cvss",
            label="CVSS assessed",
            done=finding.cvss_vector is not None,
            detail=str(finding.cvss_score) if finding.cvss_score is not None else None,
        ),
    ]


def transition(
    db: Session,
    *,
    finding: Finding,
    target: FindingStatus,
    actor: User,
    note: str = "",
    duplicate_of: str | None = None,
) -> Finding:
    current = finding.status
    if target not in TRANSITIONS[current]:
        raise ApiError(
            409,
            "invalid_transition",
            f"A finding in '{current.value}' can't move to '{target.value}'.",
            {"allowed": sorted(s.value for s in TRANSITIONS[current])},
        )
    if target is S.CONFIRMED:
        missing = [item.label for item in readiness(db, finding) if not item.done]
        if missing:
            raise ApiError(
                409,
                "not_ready",
                "This finding can't be confirmed yet. Complete: " + ", ".join(missing) + ".",
                {"missing": missing},
            )
        finding.confirmed_at = datetime.now(UTC)
        finding.confirmed_by_id = actor.id
    if target is S.DUPLICATE:
        if not duplicate_of:
            raise ApiError(422, "duplicate_of_required", "Name the finding this one duplicates.")
        original = db.scalar(
            select(Finding).where(
                Finding.org_id == finding.org_id, Finding.number == int(duplicate_of[4:])
            )
        )
        if original is None or original.id == finding.id:
            raise not_found("Original finding")
        finding.duplicate_of_id = original.id
    if current is S.CONFIRMED and target is S.NEEDS_VALIDATION:
        finding.confirmed_at = None
        finding.confirmed_by_id = None
    finding.status = target
    audit.record(
        db,
        org_id=finding.org_id,
        actor=actor,
        action="finding.status_changed",
        subject_type="finding",
        subject_id=finding.public_id,
        data={
            "from": current.value,
            "to": target.value,
            "note": note,
            "duplicate_of": duplicate_of,
        },
    )
    return finding


def get_finding(db: Session, project: Project, public_id: str) -> Finding:
    if not (public_id.startswith("FND-") and public_id[4:].isdigit()):
        raise not_found("Finding")
    finding = db.scalar(
        select(Finding).where(
            Finding.project_id == project.id, Finding.number == int(public_id[4:])
        )
    )
    if finding is None:
        raise not_found("Finding")
    return finding


def ensure_can_transition(role_check, target: FindingStatus) -> None:  # pragma: no cover - thin
    try:
        role_check(permission_for(target))
    except ApiError as exc:
        raise forbidden("Your role can't move findings to that status.") from exc
