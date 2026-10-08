from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.ai import service, session_keys
from app.ai.providers import GEMINI_FREE_NOTICE, Provider, build_provider, get_provider
from app.config import get_settings
from app.db import get_db
from app.deps import OrgContext, Principal, current_principal, load_project, require
from app.errors import ApiError
from app.models import AiRun, Finding
from app.models.enums import Severity
from app.schemas import (
    AiAskIn,
    AiDraftIn,
    AiKeyIn,
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
    """Whether this workspace may use the server's managed AI key. An empty allowlist means
    every workspace may; a non-empty one restricts it to named slugs."""
    allowed = get_settings().ai_allowed_orgs
    return not allowed or ctx.org.slug in allowed


def _managed_provider(ctx: OrgContext) -> Provider | None:
    """The built-in (operator-billed) provider, only when it's switched on for this server and
    allowed for this workspace. It stays off until the operator enables billing."""
    s = get_settings()
    if not s.ai_managed_enabled or not _org_allowed(ctx):
        return None
    return get_provider()


def _byok_provider(principal: Principal) -> Provider | None:
    """A provider built from the key this user supplied for their current session, if any."""
    key = session_keys.get_key(principal.session.id)
    if not key:
        return None
    return build_provider(key["provider"], key["api_key"], key.get("model"))


def _status(ctx: OrgContext, principal: Principal) -> AiStatusOut:
    from app.ai import budget

    key = session_keys.get_key(principal.session.id)
    managed = _managed_provider(ctx)
    cap = get_settings().ai_monthly_token_budget
    # The data notice to show the user: their own key's (free Gemini) or the managed provider's.
    notice = None
    if key and key["provider"] == "gemini":
        notice = GEMINI_FREE_NOTICE
    elif managed is not None:
        notice = managed.data_notice
    key_model = None
    if key:
        built = _byok_provider(principal)
        key_model = built.model if built else key.get("model")
    return AiStatusOut(
        available=ctx.org.ai_enabled and (key is not None or managed is not None),
        enabled=ctx.org.ai_enabled,
        provider=key["provider"] if key else (managed.name if managed else None),
        model=key_model if key else (managed.model if managed else None),
        data_notice=notice,
        byok_providers=list(session_keys.BYOK_PROVIDERS),
        key_set=key is not None,
        key_provider=key["provider"] if key else None,
        key_model=key_model,
        managed_available=managed is not None,
        monthly_token_budget=cap if managed is not None else None,
        tokens_used_this_month=budget.used() if (cap and managed is not None) else None,
    )


def _resolve(ctx: OrgContext, principal: Principal) -> tuple[Provider, bool]:
    """Pick the provider for this request: the user's own session key first, then the managed
    provider if it's switched on. Returns (provider, metered) where metered means the operator
    pays and the monthly budget applies. Raises if neither is usable."""
    ctx.require(Permission.AI_USE)
    if not ctx.org.ai_enabled:
        raise ApiError(
            403,
            "ai_disabled",
            "AI assistance is off for this workspace. An owner or admin can turn it on.",
        )
    byok = _byok_provider(principal)
    if byok is not None:
        return byok, False
    managed = _managed_provider(ctx)
    if managed is not None:
        return managed, True
    raise ApiError(
        400,
        "ai_no_key",
        "Add your own provider API key under AI assistance to use AI features. Built-in AI is "
        "coming soon.",
    )


def _require_ai(ctx: OrgContext, principal: Principal) -> tuple[Provider, bool]:
    resolved = _resolve(ctx, principal)
    _limiter.hit(str(ctx.user.id))
    return resolved


_SEV_RANK = case(
    {Severity.CRITICAL: 0, Severity.HIGH: 1, Severity.MEDIUM: 2, Severity.LOW: 3, Severity.INFO: 4},
    value=Finding.severity,
)


@router.get("/orgs/{org_slug}/ai")
def ai_status(
    ctx: OrgContext = Depends(require(Permission.PROJECT_READ)),
    principal: Principal = Depends(current_principal),
) -> AiStatusOut:
    return _status(ctx, principal)


@router.patch("/orgs/{org_slug}/ai")
def update_ai_settings(
    body: AiSettingsIn,
    ctx: OrgContext = Depends(require(Permission.MEMBERS_MANAGE)),
    principal: Principal = Depends(current_principal),
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
    return _status(ctx, principal)


@router.put("/orgs/{org_slug}/ai/key")
def set_ai_key(
    body: AiKeyIn,
    ctx: OrgContext = Depends(require(Permission.AI_USE)),
    principal: Principal = Depends(current_principal),
    db: Session = Depends(get_db),
) -> AiStatusOut:
    """Store the caller's own provider key for their current session only. It is encrypted,
    held in the session store (never the database), never returned, and cleared on logout."""
    if body.provider not in session_keys.BYOK_PROVIDERS:
        raise ApiError(
            400, "ai_bad_provider", f"Choose one of: {', '.join(session_keys.BYOK_PROVIDERS)}."
        )
    # Confirm the key actually builds a usable provider before accepting it.
    if (
        build_provider(body.provider, body.api_key.strip(), (body.model or "").strip() or None)
        is None
    ):
        raise ApiError(400, "ai_bad_key", "That doesn't look like a usable key for that provider.")
    session_keys.set_key(
        principal.session.id,
        body.provider,
        body.api_key.strip(),
        (body.model or "").strip() or None,
    )
    # Record that a key was set — never the key itself.
    audit.record(
        db,
        org_id=ctx.org.id,
        actor=ctx.user,
        action="ai.key_set",
        subject_type="session",
        subject_id=str(principal.session.id),
        data={"provider": body.provider, "scope": "session"},
    )
    db.commit()
    return _status(ctx, principal)


@router.delete("/orgs/{org_slug}/ai/key")
def clear_ai_key(
    ctx: OrgContext = Depends(require(Permission.AI_USE)),
    principal: Principal = Depends(current_principal),
    db: Session = Depends(get_db),
) -> AiStatusOut:
    session_keys.clear_key(principal.session.id)
    audit.record(
        db,
        org_id=ctx.org.id,
        actor=ctx.user,
        action="ai.key_cleared",
        subject_type="session",
        subject_id=str(principal.session.id),
        data={},
    )
    db.commit()
    return _status(ctx, principal)


@router.post("/orgs/{org_slug}/projects/{project_slug}/ai/triage")
def triage_findings(
    project_slug: str,
    limit: int = Query(default=8, ge=1, le=25),
    recheck: bool = False,
    ctx: OrgContext = Depends(require(Permission.PROJECT_READ)),
    principal: Principal = Depends(current_principal),
    db: Session = Depends(get_db),
) -> AiTriageOut:
    """Run AI analysis across a batch of open findings and record each verdict on the finding,
    so the researcher gets a vetted, ranked shortlist. Advisory only: nothing is confirmed or
    changed. Stops cleanly when the rate limit or the provider quota is reached."""
    provider, metered = _resolve(ctx, principal)
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
            service.analyze(db, provider, project, finding, ctx.user, meter=metered)
            db.commit()
        except ApiError as exc:
            db.rollback()
            # Stop cleanly on conditions that will hit every remaining finding the same way,
            # rather than grinding the whole batch through the same failure.
            _stop = {
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
    principal: Principal = Depends(current_principal),
    db: Session = Depends(get_db),
) -> AiRunOut:
    provider, metered = _require_ai(ctx, principal)
    project = load_project(db, ctx, project_slug)
    run = service.analyze(
        db, provider, project, fsvc.get_finding(db, project, public_id), ctx.user, meter=metered
    )
    db.commit()
    return AiRunOut.model_validate(run)


@router.post(f"{BASE}/ask", status_code=201)
def ask(
    project_slug: str,
    public_id: str,
    body: AiAskIn,
    ctx: OrgContext = Depends(require(Permission.PROJECT_READ)),
    principal: Principal = Depends(current_principal),
    db: Session = Depends(get_db),
) -> AiRunOut:
    provider, metered = _require_ai(ctx, principal)
    project = load_project(db, ctx, project_slug)
    finding = fsvc.get_finding(db, project, public_id)
    run = service.ask(
        db, provider, project, finding, ctx.user, body.question.strip(), meter=metered
    )
    db.commit()
    return AiRunOut.model_validate(run)


@router.post(f"{BASE}/draft", status_code=201)
def draft(
    project_slug: str,
    public_id: str,
    body: AiDraftIn,
    ctx: OrgContext = Depends(require(Permission.PROJECT_READ)),
    principal: Principal = Depends(current_principal),
    db: Session = Depends(get_db),
) -> AiRunOut:
    provider, metered = _require_ai(ctx, principal)
    project = load_project(db, ctx, project_slug)
    finding = fsvc.get_finding(db, project, public_id)
    run = service.draft(db, provider, project, finding, ctx.user, body.field, meter=metered)
    db.commit()
    return AiRunOut.model_validate(run)
