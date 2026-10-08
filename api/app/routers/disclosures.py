from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import OrgContext, load_project, require
from app.errors import ApiError, not_found
from app.models import Disclosure, Finding, Scan, Target, User
from app.schemas import (
    DisclosureEventIn,
    DisclosureIn,
    DisclosureOut,
    DisclosurePatch,
    DraftOut,
    SecurityTxtIn,
    SecurityTxtOut,
)
from app.security.permissions import Permission
from app.security.ratelimit import RateLimiter
from app.services import audit, securitytxt
from app.services import disclosure as dsvc
from app.services import findings as fsvc

router = APIRouter(tags=["disclosure"])

_lookup_limiter = RateLimiter("securitytxt", limit=30, window_seconds=3600)

BASE = "/orgs/{org_slug}/projects/{project_slug}"


def _load(db: Session, ctx: OrgContext, project_slug: str, public_id: str):
    project = load_project(db, ctx, project_slug)
    finding = fsvc.get_finding(db, project, public_id)
    disclosure = db.scalar(select(Disclosure).where(Disclosure.finding_id == finding.id))
    return project, finding, disclosure


@router.get(f"{BASE}/disclosures")
def list_disclosures(
    project_slug: str,
    ctx: OrgContext = Depends(require(Permission.PROJECT_READ)),
    db: Session = Depends(get_db),
) -> list[DisclosureOut]:
    project = load_project(db, ctx, project_slug)
    rows = db.execute(
        select(Disclosure, Finding)
        .join(Finding, Finding.id == Disclosure.finding_id)
        .where(Disclosure.project_id == project.id)
    ).all()
    out = [dsvc.to_out(d, f) for d, f in rows]
    order = {"overdue": 0, "due_soon": 1, "on_track": 2, "draft": 3, "complete": 4}
    out.sort(
        key=lambda d: (order[d.health], d.days_remaining if d.days_remaining is not None else 10**6)
    )
    return out


@router.get(f"{BASE}/findings/{{public_id}}/disclosure")
def get_disclosure(
    project_slug: str,
    public_id: str,
    ctx: OrgContext = Depends(require(Permission.PROJECT_READ)),
    db: Session = Depends(get_db),
) -> DisclosureOut:
    _, finding, disclosure = _load(db, ctx, project_slug, public_id)
    if disclosure is None:
        raise not_found("Disclosure")
    return dsvc.to_out(disclosure, finding)


@router.post(f"{BASE}/findings/{{public_id}}/disclosure", status_code=201)
def start_disclosure(
    project_slug: str,
    public_id: str,
    body: DisclosureIn,
    ctx: OrgContext = Depends(require(Permission.FINDING_WRITE)),
    db: Session = Depends(get_db),
) -> DisclosureOut:
    project, finding, existing = _load(db, ctx, project_slug, public_id)
    if existing is not None:
        raise ApiError(409, "disclosure_exists", "This finding already has a disclosure.")
    if finding.status not in dsvc.STARTABLE:
        raise ApiError(
            409,
            "not_confirmed",
            "Confirm the finding before you start disclosing it to the vendor.",
        )
    d = Disclosure(
        org_id=ctx.org.id,
        project_id=project.id,
        finding_id=finding.id,
        stage="draft",
        created_by_id=ctx.user.id,
        **body.model_dump(),
    )
    db.add(d)
    db.flush()
    audit.record(
        db,
        org_id=ctx.org.id,
        actor=ctx.user,
        action="disclosure.started",
        subject_type="finding",
        subject_id=finding.public_id,
        data={
            "vendor": body.vendor_name,
            "contact": body.contact,
            "deadline_days": body.deadline_days,
        },
    )
    db.commit()
    db.refresh(d)
    return dsvc.to_out(d, finding)


@router.patch(f"{BASE}/findings/{{public_id}}/disclosure")
def update_disclosure(
    project_slug: str,
    public_id: str,
    body: DisclosurePatch,
    ctx: OrgContext = Depends(require(Permission.FINDING_WRITE)),
    db: Session = Depends(get_db),
) -> DisclosureOut:
    _, finding, d = _load(db, ctx, project_slug, public_id)
    if d is None:
        raise not_found("Disclosure")
    changes = {k: v for k, v in body.model_dump(exclude_unset=True).items() if getattr(d, k) != v}
    for k, v in changes.items():
        setattr(d, k, v)
    if changes:
        audit.record(
            db,
            org_id=ctx.org.id,
            actor=ctx.user,
            action="disclosure.updated",
            subject_type="finding",
            subject_id=finding.public_id,
            data=changes,
        )
    db.commit()
    db.refresh(d)
    return dsvc.to_out(d, finding)


@router.post(f"{BASE}/findings/{{public_id}}/disclosure/events", status_code=201)
def add_event(
    project_slug: str,
    public_id: str,
    body: DisclosureEventIn,
    ctx: OrgContext = Depends(require(Permission.FINDING_WRITE)),
    db: Session = Depends(get_db),
) -> DisclosureOut:
    _, finding, d = _load(db, ctx, project_slug, public_id)
    if d is None:
        raise not_found("Disclosure")
    dsvc.record_event(db, disclosure=d, finding=finding, body=body, actor=ctx.user)
    db.commit()
    db.refresh(d)
    db.refresh(finding)
    return dsvc.to_out(d, finding)


@router.get(f"{BASE}/findings/{{public_id}}/disclosure/draft")
def draft_notification(
    project_slug: str,
    public_id: str,
    ctx: OrgContext = Depends(require(Permission.PROJECT_READ)),
    db: Session = Depends(get_db),
) -> DraftOut:
    project, finding, d = _load(db, ctx, project_slug, public_id)
    if d is None:
        raise not_found("Disclosure")
    researcher = db.get(User, finding.confirmed_by_id or ctx.user.id) or ctx.user
    version = None
    if finding.scan_id and (scan := db.get(Scan, finding.scan_id)):
        target = db.get(Target, scan.target_id)
        version = target.version if target else None
    subject, body = dsvc.draft_notice(d, finding, project, researcher, version)
    return DraftOut(to=d.contact, subject=subject, body=body)


@router.post("/orgs/{org_slug}/security-txt")
def lookup_security_txt(
    body: SecurityTxtIn,
    ctx: OrgContext = Depends(require(Permission.FINDING_WRITE)),
) -> SecurityTxtOut:
    _lookup_limiter.hit(str(ctx.user.id))
    result = securitytxt.fetch(body.domain)
    return SecurityTxtOut(**result.__dict__)
