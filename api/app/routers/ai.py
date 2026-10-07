from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai import service
from app.ai.providers import Provider, get_provider
from app.db import get_db
from app.deps import OrgContext, load_project, require
from app.errors import ApiError
from app.models import AiRun
from app.schemas import AiAskIn, AiDraftIn, AiRunOut, AiSettingsIn, AiStatusOut
from app.security.permissions import Permission
from app.security.ratelimit import RateLimiter
from app.services import audit
from app.services import findings as fsvc

router = APIRouter(tags=["ai"])

_limiter = RateLimiter(limit=40, window_seconds=3600)
BASE = "/orgs/{org_slug}/projects/{project_slug}/findings/{public_id}/ai"


def _status(ctx: OrgContext) -> AiStatusOut:
    provider = get_provider()
    return AiStatusOut(
        available=provider is not None,
        enabled=ctx.org.ai_enabled,
        provider=provider.name if provider else None,
        model=provider.model if provider else None,
    )


def _require_ai(ctx: OrgContext) -> Provider:
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
    _limiter.hit(str(ctx.user.id))
    return provider


@router.get("/orgs/{org_slug}/ai")
def ai_status(ctx: OrgContext = Depends(require(Permission.PROJECT_READ))) -> AiStatusOut:
    return _status(ctx)


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
    return _status(ctx)


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
