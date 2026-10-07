from typing import Literal

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.deps import OrgContext, load_project, parse_uuid, require
from app.errors import ApiError, forbidden, not_found
from app.models import AuditEvent, Evidence, Finding, Membership, Scan, Target
from app.models.enums import FindingSource, FindingStatus, Severity
from app.schemas import (
    AuditEventOut,
    ChainOut,
    CvssOut,
    EvidenceOut,
    EvidenceVerifyOut,
    FindingDetail,
    FindingIn,
    FindingOut,
    FindingPage,
    FindingPatch,
    SourceExcerpt,
    SourceLine,
    TransitionIn,
)
from app.security.permissions import Permission, has_permission
from app.services import audit, storage
from app.services import findings as svc
from app.services.cvss import score_vector

router = APIRouter(prefix="/orgs/{org_slug}/projects/{project_slug}/findings", tags=["findings"])

StatusGroup = Literal["open", "needs_validation", "confirmed", "reported", "closed", "all"]

GROUPS: dict[str, frozenset[FindingStatus]] = {
    "open": svc.OPEN | {FindingStatus.CONFIRMED},
    "needs_validation": frozenset({FindingStatus.NEEDS_VALIDATION}),
    "confirmed": frozenset({FindingStatus.CONFIRMED}),
    "reported": frozenset(
        {
            FindingStatus.REPORTED,
            FindingStatus.VENDOR_ACKNOWLEDGED,
            FindingStatus.FIX_AVAILABLE,
            FindingStatus.PUBLIC_DISCLOSURE,
        }
    ),
    "closed": svc.CLOSED,
}

_SEV_ORDER = case(
    {Severity.CRITICAL: 0, Severity.HIGH: 1, Severity.MEDIUM: 2, Severity.LOW: 3, Severity.INFO: 4},
    value=Finding.severity,
)


def _detail(db: Session, ctx: OrgContext, finding: Finding) -> FindingDetail:
    allowed = [
        s
        for s in sorted(svc.TRANSITIONS[finding.status], key=lambda s: list(FindingStatus).index(s))
        if has_permission(ctx.role, svc.permission_for(s))
    ]
    return FindingDetail(
        **FindingOut.model_validate(finding).model_dump(),
        allowed_transitions=allowed,
        readiness=svc.readiness(db, finding),
        evidence_count=svc.evidence_count(db, finding),
    )


@router.get("")
def list_findings(
    project_slug: str,
    status: StatusGroup = "open",
    severity: list[Severity] = Query(default=[]),
    source: FindingSource | None = None,
    q: str | None = Query(default=None, max_length=200),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    ctx: OrgContext = Depends(require(Permission.PROJECT_READ)),
    db: Session = Depends(get_db),
) -> FindingPage:
    project = load_project(db, ctx, project_slug)
    base = select(Finding).where(Finding.project_id == project.id)
    if source:
        base = base.where(Finding.source == source)
    if q:
        like = f"%{q.replace('%', r'\%').replace('_', r'\_')}%"
        base = base.where(
            or_(Finding.title.ilike(like), Finding.cwe.ilike(like), Finding.file_path.ilike(like))
        )

    status_counts = {
        group: db.scalar(
            select(func.count()).select_from(base.where(Finding.status.in_(members)).subquery())
        )
        or 0
        for group, members in GROUPS.items()
    }
    status_counts["all"] = db.scalar(select(func.count()).select_from(base.subquery())) or 0

    scoped = base if status == "all" else base.where(Finding.status.in_(GROUPS[status]))
    sub = scoped.subquery()
    sev_rows = db.execute(select(sub.c.severity, func.count()).group_by(sub.c.severity)).all()
    severity_counts = {Severity(s).value: n for s, n in sev_rows}

    if severity:
        scoped = scoped.where(Finding.severity.in_(severity))
    total = db.scalar(select(func.count()).select_from(scoped.subquery())) or 0
    rows = db.scalars(
        scoped.order_by(_SEV_ORDER, Finding.updated_at.desc()).limit(limit).offset(offset)
    ).all()
    return FindingPage(
        items=[FindingOut.model_validate(f) for f in rows],
        total=total,
        status_counts=status_counts,
        severity_counts=severity_counts,
    )


@router.post("", status_code=201)
def create_manual_finding(
    project_slug: str,
    body: FindingIn,
    ctx: OrgContext = Depends(require(Permission.FINDING_WRITE)),
    db: Session = Depends(get_db),
) -> FindingDetail:
    project = load_project(db, ctx, project_slug)
    finding = svc.create_finding(
        db,
        project=project,
        actor=ctx.user,
        source=FindingSource.MANUAL,
        **body.model_dump(),
    )
    db.commit()
    return _detail(db, ctx, finding)


@router.get("/{public_id}")
def get_finding(
    project_slug: str,
    public_id: str,
    ctx: OrgContext = Depends(require(Permission.PROJECT_READ)),
    db: Session = Depends(get_db),
) -> FindingDetail:
    project = load_project(db, ctx, project_slug)
    return _detail(db, ctx, svc.get_finding(db, project, public_id))


@router.patch("/{public_id}")
def update_finding(
    project_slug: str,
    public_id: str,
    body: FindingPatch,
    ctx: OrgContext = Depends(require(Permission.FINDING_WRITE)),
    db: Session = Depends(get_db),
) -> FindingDetail:
    project = load_project(db, ctx, project_slug)
    finding = svc.get_finding(db, project, public_id)
    if finding.status in svc.CLOSED or finding.status is FindingStatus.PUBLIC_DISCLOSURE:
        raise ApiError(409, "finding_closed", "Reopen this finding before editing it.")
    changes = body.model_dump(exclude_unset=True)
    if "assignee_id" in changes and changes["assignee_id"] is not None:
        member = db.scalar(
            select(Membership.id).where(
                Membership.org_id == ctx.org.id, Membership.user_id == changes["assignee_id"]
            )
        )
        if member is None:
            raise not_found("Assignee")
    if "cvss_vector" in changes:
        vector = changes["cvss_vector"]
        if vector:
            result = score_vector(vector)
            changes["cvss_vector"] = result.vector
            finding.cvss_score = result.score
        else:
            changes["cvss_vector"] = None
            finding.cvss_score = None
    recorded = {}
    for key, value in changes.items():
        if getattr(finding, key) != value:
            recorded[key] = (
                value if key not in ("description", "reproduction") else f"{len(value or '')} chars"
            )
            setattr(finding, key, value)
    if recorded:
        audit.record(
            db,
            org_id=ctx.org.id,
            actor=ctx.user,
            action="finding.updated",
            subject_type="finding",
            subject_id=finding.public_id,
            data=recorded,
        )
    db.commit()
    db.refresh(finding)
    return _detail(db, ctx, finding)


@router.post("/{public_id}/transitions")
def transition_finding(
    project_slug: str,
    public_id: str,
    body: TransitionIn,
    ctx: OrgContext = Depends(require(Permission.PROJECT_READ)),
    db: Session = Depends(get_db),
) -> FindingDetail:
    if not has_permission(ctx.role, svc.permission_for(body.status)):
        raise forbidden("Your role can't move findings to that status.")
    project = load_project(db, ctx, project_slug)
    finding = svc.get_finding(db, project, public_id)
    svc.transition(
        db,
        finding=finding,
        target=body.status,
        actor=ctx.user,
        note=body.note,
        duplicate_of=body.duplicate_of,
    )
    db.commit()
    db.refresh(finding)
    return _detail(db, ctx, finding)


@router.get("/{public_id}/custody")
def custody(
    project_slug: str,
    public_id: str,
    ctx: OrgContext = Depends(require(Permission.PROJECT_READ)),
    db: Session = Depends(get_db),
) -> dict:
    """Every audit event about this finding, plus verification of the organization's chain."""
    project = load_project(db, ctx, project_slug)
    finding = svc.get_finding(db, project, public_id)
    events = db.scalars(
        select(AuditEvent)
        .where(AuditEvent.subject_type == "finding", AuditEvent.subject_id == finding.public_id)
        .order_by(AuditEvent.seq.desc())
    ).all()
    report = audit.verify_chain(db, ctx.org.id)
    return {
        "events": [AuditEventOut.model_validate(e) for e in events],
        "chain": ChainOut(**report.__dict__),
    }


@router.post("/cvss/score")
def preview_cvss(
    body: dict, ctx: OrgContext = Depends(require(Permission.PROJECT_READ))
) -> CvssOut:
    vector = body.get("vector")
    if not isinstance(vector, str) or len(vector) > 200:
        raise ApiError(422, "invalid_cvss", "Provide a CVSS vector string.")
    r = score_vector(vector)
    return CvssOut(version=r.version, vector=r.vector, score=r.score, severity=r.severity)


@router.get("/{public_id}/source")
def source_excerpt(
    project_slug: str,
    public_id: str,
    context: int = Query(default=6, ge=0, le=40),
    ctx: OrgContext = Depends(require(Permission.PROJECT_READ)),
    db: Session = Depends(get_db),
) -> SourceExcerpt:
    """The lines around a finding's location, read from the analyzed source snapshot."""
    project = load_project(db, ctx, project_slug)
    finding = svc.get_finding(db, project, public_id)
    if not finding.file_path or not finding.line:
        raise not_found("Source location")
    targets = db.scalars(
        select(Target).where(Target.project_id == project.id).order_by(Target.created_at.desc())
    ).all()
    if finding.scan_id:
        scan = db.get(Scan, finding.scan_id)
        targets.sort(key=lambda t: t.id != (scan.target_id if scan else None))
    for target in targets:
        root = (get_settings().storage_dir / "sources" / str(target.id)).resolve()
        candidate = (root / finding.file_path).resolve()
        if root not in candidate.parents or not candidate.is_file() or candidate.is_symlink():
            continue
        if candidate.stat().st_size > 2 * 1024 * 1024:
            raise ApiError(413, "too_large", "That file is too large to preview.")
        lines = candidate.read_text(encoding="utf-8", errors="replace").splitlines()
        start = max(1, finding.line - context)
        end = min(len(lines), finding.line + context)
        return SourceExcerpt(
            path=finding.file_path,
            commit=target.commit,
            highlight=finding.line,
            lines=[SourceLine(n=n, text=lines[n - 1]) for n in range(start, end + 1)],
        )
    raise not_found("Source snapshot")


# ── Evidence ──────────────────────────────────────────────────────────────────


@router.get("/{public_id}/evidence")
def list_evidence(
    project_slug: str,
    public_id: str,
    ctx: OrgContext = Depends(require(Permission.PROJECT_READ)),
    db: Session = Depends(get_db),
) -> list[EvidenceOut]:
    finding = svc.get_finding(db, load_project(db, ctx, project_slug), public_id)
    rows = db.scalars(
        select(Evidence).where(Evidence.finding_id == finding.id).order_by(Evidence.created_at)
    ).all()
    return [EvidenceOut.model_validate(e) for e in rows]


@router.post("/{public_id}/evidence", status_code=201)
def upload_evidence(
    project_slug: str,
    public_id: str,
    file: UploadFile = File(...),
    note: str = Form(default="", max_length=2000),
    ctx: OrgContext = Depends(require(Permission.EVIDENCE_WRITE)),
    db: Session = Depends(get_db),
) -> EvidenceOut:
    finding = svc.get_finding(db, load_project(db, ctx, project_slug), public_id)
    blob = storage.put("evidence", file.file, get_settings().evidence_max_bytes)
    filename = storage.safe_filename(file.filename)
    content_type = (file.content_type or "application/octet-stream")[:120]
    evidence = Evidence(
        org_id=ctx.org.id,
        finding_id=finding.id,
        filename=filename,
        content_type=content_type,
        size=blob.size,
        sha256=blob.sha256,
        note=note,
        uploaded_by_id=ctx.user.id,
    )
    db.add(evidence)
    db.flush()
    audit.record(
        db,
        org_id=ctx.org.id,
        actor=ctx.user,
        action="evidence.attached",
        subject_type="finding",
        subject_id=finding.public_id,
        data={
            "evidence_id": str(evidence.id),
            "filename": filename,
            "sha256": blob.sha256,
            "size": blob.size,
        },
    )
    db.commit()
    db.refresh(evidence)
    return EvidenceOut.model_validate(evidence)


def _evidence(
    db: Session, ctx: OrgContext, project_slug: str, public_id: str, evidence_id: str
) -> Evidence:
    finding = svc.get_finding(db, load_project(db, ctx, project_slug), public_id)
    ev = db.scalar(
        select(Evidence).where(
            Evidence.id == parse_uuid(evidence_id, "Evidence"), Evidence.finding_id == finding.id
        )
    )
    if ev is None:
        raise not_found("Evidence")
    return ev


@router.get("/{public_id}/evidence/{evidence_id}/download")
def download_evidence(
    project_slug: str,
    public_id: str,
    evidence_id: str,
    ctx: OrgContext = Depends(require(Permission.PROJECT_READ)),
    db: Session = Depends(get_db),
) -> FileResponse:
    ev = _evidence(db, ctx, project_slug, public_id, evidence_id)
    # Always served as a download with a neutral type: evidence is attacker-influenced content.
    return FileResponse(
        storage.blob_path("evidence", ev.sha256),
        media_type="application/octet-stream",
        filename=ev.filename,
        headers={"X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox"},
    )


@router.post("/{public_id}/evidence/{evidence_id}/verify")
def verify_evidence(
    project_slug: str,
    public_id: str,
    evidence_id: str,
    ctx: OrgContext = Depends(require(Permission.PROJECT_READ)),
    db: Session = Depends(get_db),
) -> EvidenceVerifyOut:
    ev = _evidence(db, ctx, project_slug, public_id, evidence_id)
    return EvidenceVerifyOut(
        id=ev.id, sha256=ev.sha256, verified=storage.verify("evidence", ev.sha256)
    )
