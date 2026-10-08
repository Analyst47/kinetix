from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.ai import service
from app.ai.providers import Provider, get_provider
from app.db import get_db
from app.deps import OrgContext, load_project, require
from app.errors import ApiError
from app.models import AiRun, Finding
from app.models.enums import Severity
from app.schemas import (
    AiAskIn,
    AiDraftIn,
    AiRunOut,
    AiSettingsIn,
    AiStatusOut,
    AiTriageOut,
)
from app.security.permissions import Permission
from app.security.ratelimit import RateLimiter
from app.services import audit
from app.services import findings as fsvc

router = APIRouter(tags=["ai"])

_limiter = RateLimiter("ai", limit=40, window_seconds=3600)
BASE = "/orgs/{org_slug}/projects/{project_slug}/findings/{public_id}/ai"


def _status(ctx: OrgContext) -> AiStatusOut:
    provider = get_provider()
    return AiStatusOut(
        available=provider is not None,
        enabled=ctx.org.ai_enabled,
        provider=provider.name if provider else None,
        model=provider.model if provider else None,
        data_notice=provider.data_notice if provider else None,
    )


def _ai_provider(ctx: OrgContext) -> Provider:
    """Permission, configuration and workspace checks, without spending rate budget."""
    ctx.require(Permission.AI_USE)
    provider = get_provider()
    if provider is None:
        raise ApiError(503, "ai_not_configured", "AI assistance isn't configured on this server.")
    if not ctx.org.ai_enabled:
        raise ApiError(
            403,
            "ai_disabled",
            "AI assistance is off for this workspace. An owner or admin can turn it on.",
        )
    return provider


def _require_ai(ctx: OrgContext) -> Provider:
    provider = _ai_provider(ctx)
    _limiter.hit(str(ctx.user.id))
    return provider


_SEV_RANK = case(
    {Severity.CRITICAL: 0, Severity.HIGH: 1, Severity.MEDIUM: 2, Severity.LOW: 3, Severity.INFO: 4},
    value=Finding.severity,
)


@router.get("/orgs/{org_slug}/ai")
def ai_status(ctx: OrgContext = Depends(require(Permission.PROJECT_READ))) -> AiStatusOut:
    return _status(ctx)


@router.patch("/orgs/{org_slug}/ai")
def update_ai_settings(
    body: AiSettingsIn,
    ctx: OrgContext = Depends(require(Permission.MEMBERS_MANAGE)),
    db: Session = Depends(get_db),
) -> AiStatusOut:
    provider = get_provider()
    notice = provider.data_notice if provider else None
    if body.enabled and not ctx.org.ai_enabled and notice and not body.acknowledge_data_notice:
        raise ApiError(
            409,
            "acknowledge_data_notice",
            "This provider may keep what it's sent. Confirm the notice before turning AI on.",
        )
    if ctx.org.ai_enabled != body.enabled:
        ctx.org.ai_enabled = body.enabled
        audit.record(
            db,
            org_id=ctx.org.id,
            actor=ctx.user,
            action="ai.settings_changed",
            subject_type="organization",
            subject_id=ctx.org.slug,
            data={
                "enabled": body.enabled,
                "provider": provider.name if provider else None,
                "data_notice_acknowledged": bool(body.enabled and notice),
            },
        )
        db.commit()
    return _status(ctx)


@router.post("/orgs/{org_slug}/projects/{project_slug}/ai/triage")
def triage_findings(
    project_slug: str,
    limit: int = Query(default=8, ge=1, le=25),
    recheck: bool = False,
    ctx: OrgContext = Depends(require(Permission.PROJECT_READ)),
    db: Session = Depends(get_db),
) -> AiTriageOut:
    """Run AI analysis across a batch of open findings and record each verdict on the finding,
    so the researcher gets a vetted, ranked shortlist. Advisory only: nothing is confirmed or
    changed. Stops cleanly when the rate limit or the provider quota is reached."""
    provider = _ai_provider(ctx)
    project = load_project(db, ctx, project_slug)

    def _open():
        q = select(Finding).where(Finding.project_id == project.id, Finding.status.in_(fsvc.OPEN))
        if not recheck:
            q = q.where(Finding.ai_reviewed_at.is_(None))
        return q

    batch = db.scalars(
        _open()
        .order_by(Finding.ai_reviewed_at.asc().nulls_first(), _SEV_RANK, Finding.created_at)
        .limit(limit)
    ).all()

    verdicts = {"likely_vulnerable": 0, "likely_false_positive": 0, "needs_more_context": 0}
    reviewed = 0
    stopped: str | None = None
    for finding in batch:
        try:
            _limiter.hit(str(ctx.user.id))
        except ApiError:
            stopped = "rate_limited"
            break
        try:
            service.analyze(db, provider, project, finding, ctx.user)
            db.commit()
        except ApiError as exc:
            db.rollback()
            # Stop cleanly on conditions that will hit every remaining finding the same way,
            # rather than grinding the whole batch through the same failure.
            _stop = {
                "ai_quota": "quota",
                "rate_limited": "rate_limited",
                "ai_overloaded": "overloaded",
            }
            if exc.code in _stop:
                stopped = _stop[exc.code]
                break
            continue  # a transient provider hiccup on one finding shouldn't sink the batch
        verdicts[finding.ai_verdict] = verdicts.get(finding.ai_verdict, 0) + 1
        reviewed += 1

    remaining = db.scalar(select(func.count()).select_from(_open().subquery())) or 0
    audit.record(
        db,
        org_id=ctx.org.id,
        actor=ctx.user,
        action="ai.triage",
        subject_type="project",
        subject_id=project.slug,
        data={"reviewed": reviewed, "remaining": remaining, "stopped": stopped, **verdicts},
    )
    db.commit()
    return AiTriageOut(reviewed=reviewed, remaining=remaining, stopped=stopped, verdicts=verdicts)


@router.get(BASE)
def list_runs(
    project_slug: str,
    public_id: str,
    ctx: OrgContext = Depends(require(Permission.PROJECT_READ)),
    db: Session = Depends(get_db),
) -> list[AiRunOut]:
    finding = fsvc.get_finding(db, load_project(db, ctx, project_slug), public_id)
    rows = db.scalars(
        select(AiRun)
        .where(AiRun.finding_id == finding.id)
        .order_by(AiRun.created_at.desc())
        .limit(20)
    ).all()
    return [AiRunOut.model_validate(r) for r in rows]


@router.post(f"{BASE}/analyze", status_code=201)
def analyze(
    project_slug: str,
    public_id: str,
    ctx: OrgContext = Depends(require(Permission.PROJECT_READ)),
    db: Session = Depends(get_db),
) -> AiRunOut:
    provider = _require_ai(ctx)
    project = load_project(db, ctx, project_slug)
    run = service.analyze(db, provider, project, fsvc.get_finding(db, project, public_id), ctx.user)
    db.commit()
    return AiRunOut.model_validate(run)


@router.post(f"{BASE}/ask", status_code=201)
def ask(
    project_slug: str,
    public_id: str,
    body: AiAskIn,
    ctx: OrgContext = Depends(require(Permission.PROJECT_READ)),
    db: Session = Depends(get_db),
) -> AiRunOut:
    provider = _require_ai(ctx)
    project = load_project(db, ctx, project_slug)
    finding = fsvc.get_finding(db, project, public_id)
    run = service.ask(db, provider, project, finding, ctx.user, body.question.strip())
    db.commit()
    return AiRunOut.model_validate(run)


@router.post(f"{BASE}/draft", status_code=201)
def draft(
    project_slug: str,
    public_id: str,
    body: AiDraftIn,
    ctx: OrgContext = Depends(require(Permission.PROJECT_READ)),
    db: Session = Depends(get_db),
) -> AiRunOut:
    provider = _require_ai(ctx)
    project = load_project(db, ctx, project_slug)
    finding = fsvc.get_finding(db, project, public_id)
    run = service.draft(db, provider, project, finding, ctx.user, body.field)
    db.commit()
    return AiRunOut.model_validate(run)
