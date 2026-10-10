from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.ai import service
from app.ai.providers import Provider, get_provider
from app.billing import entitlements
from app.config import get_settings
from app.db import get_db
from app.deps import OrgContext, load_project, require
from app.errors import ApiError
from app.models import AiRun, Finding
from app.models.enums import Severity
from app.routers.billing import usage_out
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


def _org_allowed(ctx: OrgContext) -> bool:
    """Whether this workspace may use the server's AI key. An empty allowlist means every
    workspace may; a non-empty one restricts it to named slugs."""
    allowed = get_settings().ai_allowed_orgs
    return not allowed or ctx.org.slug in allowed


def _provider(ctx: OrgContext) -> Provider | None:
    """The server's managed provider, when it's configured and allowed for this workspace.
    The key is read server-side only; users never supply one."""
    if not get_settings().ai_managed_enabled or not _org_allowed(ctx):
        return None
    return get_provider()


def _status(ctx: OrgContext, db: Session) -> AiStatusOut:
    from app.ai import budget

    provider = _provider(ctx)
    cap = get_settings().ai_monthly_token_budget
    return AiStatusOut(
        available=ctx.org.ai_enabled and provider is not None,
        enabled=ctx.org.ai_enabled,
        provider=provider.name if provider else None,
        model=provider.model if provider else None,
        data_notice=provider.data_notice if provider else None,
        configured=provider is not None,
        usage=usage_out(entitlements.usage(db, ctx.user.id)),
        monthly_token_budget=cap if provider is not None else None,
        tokens_used_this_month=budget.used() if (cap and provider is not None) else None,
    )


def _resolve(ctx: OrgContext) -> Provider:
    """The provider for this request, or a clear reason AI can't run here."""
    ctx.require(Permission.AI_USE)
    if not ctx.org.ai_enabled:
        raise ApiError(
            403,
            "ai_disabled",
            "AI assistance is off for this workspace. An owner or admin can turn it on.",
        )
    provider = _provider(ctx)
    if provider is None:
        raise ApiError(
            503,
            "ai_not_configured",
            "AI assistance isn't configured on this server yet. An administrator needs to set "
            "the AI provider key.",
        )
    return provider


def _require_ai(ctx: OrgContext, db: Session) -> tuple[Provider, entitlements.Usage]:
    """Resolve the provider, then charge one Agentic Triage run to the user. The charge rolls
    back with the request if the AI call fails, so only completed runs count. Sponsored users
    (owner accounts and their teams) are neither charged nor held to the hourly limit."""
    provider = _resolve(ctx)
    charge = entitlements.consume(db, ctx.user.id)
    if not charge.unlimited:
        _limiter.hit(str(ctx.user.id))
    return provider, charge


_SEV_RANK = case(
    {Severity.CRITICAL: 0, Severity.HIGH: 1, Severity.MEDIUM: 2, Severity.LOW: 3, Severity.INFO: 4},
    value=Finding.severity,
)


@router.get("/orgs/{org_slug}/ai")
def ai_status(
    ctx: OrgContext = Depends(require(Permission.PROJECT_READ)),
    db: Session = Depends(get_db),
) -> AiStatusOut:
    return _status(ctx, db)


@router.patch("/orgs/{org_slug}/ai")
def update_ai_settings(
    body: AiSettingsIn,
    ctx: OrgContext = Depends(require(Permission.MEMBERS_MANAGE)),
    db: Session = Depends(get_db),
) -> AiStatusOut:
    if ctx.org.ai_enabled != body.enabled:
        ctx.org.ai_enabled = body.enabled
        audit.record(
            db,
            org_id=ctx.org.id,
            actor=ctx.user,
            action="ai.settings_changed",
            subject_type="organization",
            subject_id=ctx.org.slug,
            data={"enabled": body.enabled},
        )
        db.commit()
    return _status(ctx, db)


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
    changed. Each finding reviewed costs one Agentic Triage run; the batch is capped at what
    the user has left and stops cleanly at a rate limit, the quota, or the spend cap.
    Sponsored users aren't capped or rate limited."""
    provider = _resolve(ctx)
    project = load_project(db, ctx, project_slug)
    left = entitlements.usage(db, ctx.user.id)
    if not left.unlimited:
        if (left.remaining or 0) < 1:
            raise entitlements.limit_reached(left)
        limit = min(limit, left.remaining or 0)

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
        if not left.unlimited:
            try:
                _limiter.hit(str(ctx.user.id))
            except ApiError:
                stopped = "rate_limited"
                break
        try:
            charge = entitlements.consume(db, ctx.user.id)
            service.analyze(db, provider, project, finding, ctx.user, quota=charge.audit())
            db.commit()
        except ApiError as exc:
            # Undo this finding's charge along with anything it wrote.
            db.rollback()
            # Stop cleanly on conditions that will hit every remaining finding the same way,
            # rather than grinding the whole batch through the same failure.
            _stop = {
                "ai_limit_reached": "limit",
                "ai_quota": "quota",
                "rate_limited": "rate_limited",
                "ai_overloaded": "overloaded",
                "ai_budget_exhausted": "budget",
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
    provider, charge = _require_ai(ctx, db)
    project = load_project(db, ctx, project_slug)
    run = service.analyze(
        db, provider, project, fsvc.get_finding(db, project, public_id), ctx.user,
        quota=charge.audit(),
    )  # fmt: skip
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
    provider, charge = _require_ai(ctx, db)
    project = load_project(db, ctx, project_slug)
    finding = fsvc.get_finding(db, project, public_id)
    run = service.ask(
        db, provider, project, finding, ctx.user, body.question.strip(), quota=charge.audit()
    )
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
    provider, charge = _require_ai(ctx, db)
    project = load_project(db, ctx, project_slug)
    finding = fsvc.get_finding(db, project, public_id)
    run = service.draft(db, provider, project, finding, ctx.user, body.field, quota=charge.audit())
    db.commit()
    return AiRunOut.model_validate(run)
