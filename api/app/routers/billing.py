"""Plans and AI usage. Read-only until Stripe is wired in.

To add Stripe later (see docs/BILLING.md): a checkout endpoint here that creates a Checkout
Session for the plan's Stripe Price with client_reference_id = user id, and a webhook endpoint
that verifies the Stripe signature and calls entitlements.apply_subscription.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.billing import entitlements
from app.billing.plans import Plan, catalog
from app.db import get_db
from app.deps import Principal, current_principal
from app.schemas import BillingOut, PlanOut, UsageOut

router = APIRouter(prefix="/billing", tags=["billing"])


def plan_out(p: Plan) -> PlanOut:
    return PlanOut(
        key=p.key,
        name=p.name,
        tagline=p.tagline,
        price_monthly_usd=p.price_monthly_usd,
        price_yearly_usd=p.price_yearly_usd,
        ai_searches=p.ai_searches,
        ai_period=p.ai_period,
        self_serve=p.self_serve,
    )


def usage_out(u: entitlements.Usage) -> UsageOut:
    return UsageOut(
        plan=u.plan.key,
        plan_name=u.plan.name,
        status=u.status,
        ai_period=u.plan.ai_period,
        searches_used=u.used,
        searches_limit=u.limit,
        searches_remaining=u.remaining,
        unlimited=u.unlimited,
        sponsor=u.sponsor,
        resets_at=u.resets_at,
        billing_enabled=entitlements.billing_enabled(),
    )


@router.get("/plans")
def list_plans() -> list[PlanOut]:
    """The public plan catalog, for the pricing page."""
    return [plan_out(p) for p in catalog().values()]


@router.get("")
def my_billing(
    principal: Principal = Depends(current_principal), db: Session = Depends(get_db)
) -> BillingOut:
    """The signed-in user's plan, remaining Agentic Triage runs, and the plans they could move
    to. Owner accounts and their teams see an unlimited sponsored plan."""
    return BillingOut(
        usage=usage_out(entitlements.usage(db, principal.user.id)),
        plans=[plan_out(p) for p in catalog().values()],
    )
