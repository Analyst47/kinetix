"""The AI quota gate: how many Agentic Triage runs a user has, and charging one.

Every AI model call costs one run: an Analyze, Ask or Draft, or one finding reviewed by a
triage pass. ``consume`` is the only way to spend one. It locks the user's plan row for the rest
of the request's transaction, so concurrent requests from the same user can't overspend, and
because the charge lives in that same transaction, a request that fails (provider error, spend
cap) rolls back and the user is not charged.

Stripe drops in through ``apply_subscription`` (called from a webhook) — nothing here needs to
know how a plan was bought.

Owner accounts (``KINETIX_OWNER_EMAILS``) run this server on their own key, so they — and every
member of a workspace one of them owns — are sponsored: no quota and no hourly limit. Their runs
are still audited, and the server-wide monthly token budget still applies.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import Connection, and_, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, aliased

from app.billing.plans import Plan, catalog, get_plan
from app.config import get_settings
from app.db import set_user
from app.errors import ApiError
from app.models import Membership, Organization, User, UserPlan
from app.models.enums import Role

# A paid plan grants its quota only while the subscription is in good standing.
ACTIVE_STATUSES = frozenset({"active", "trialing"})

# Not for sale: what sponsored users see in place of a plan.
SPONSORED_PLANS = {
    "owner": Plan(
        key="owner",
        name="Owner",
        tagline="Your server, your key: unlimited Agentic Triage.",
        price_monthly_usd=None,
        price_yearly_usd=None,
        ai_searches=0,
        ai_period="unlimited",
        self_serve=False,
    ),
    "team": Plan(
        key="owner_team",
        name="Owner's team",
        tagline="Unlimited Agentic Triage, sponsored by your workspace owner.",
        price_monthly_usd=None,
        price_yearly_usd=None,
        ai_searches=0,
        ai_period="unlimited",
        self_serve=False,
    ),
}


@dataclass(frozen=True)
class Usage:
    plan: Plan
    status: str
    used: int
    resets_at: datetime | None
    # "owner" or "team" when the user is sponsored (unlimited); None on a metered plan.
    sponsor: str | None = None

    @property
    def unlimited(self) -> bool:
        return self.sponsor is not None

    @property
    def limit(self) -> int | None:
        return None if self.unlimited else self.plan.ai_searches

    @property
    def remaining(self) -> int | None:
        return None if self.unlimited else max(0, self.plan.ai_searches - self.used)

    def audit(self) -> dict:
        """What an AI run records about the charge, for the audit trail."""
        if self.unlimited:
            return {"plan": self.plan.key, "unlimited": True, "sponsor": self.sponsor}
        return {"plan": self.plan.key, "searches_used": self.used, "searches_limit": self.limit}


def sponsor_of(db: Session, user_id: uuid.UUID) -> str | None:
    """ "owner" if this user is an owner account, "team" if they belong to a workspace an owner
    account created and still owns, else None. Owner accounts are configured by email
    (KINETIX_OWNER_EMAILS). Only the workspace's creator counts: the owner role alone isn't
    enough, because any owner of someone else's workspace could grant it to an owner account."""
    owners = get_settings().owner_emails
    if not owners:
        return None
    email = db.scalar(select(User.email).where(User.id == user_id))
    if email and email.lower() in owners:
        return "owner"
    creator = aliased(Membership)
    sponsored = db.scalar(
        select(Membership.org_id)
        .join(Organization, Organization.id == Membership.org_id)
        .join(User, User.id == Organization.created_by_id)
        .join(
            creator,
            and_(
                creator.org_id == Organization.id,
                creator.user_id == Organization.created_by_id,
                creator.role == Role.OWNER,
            ),
        )
        .where(Membership.user_id == user_id, func.lower(User.email).in_(owners))
        .limit(1)
    )
    return "team" if sponsored is not None else None


def unclaimed_owner_emails(db: Session | Connection) -> list[str]:
    """Owner emails that no account has registered yet. Registration doesn't verify addresses,
    so whoever registers one of these first becomes an owner account: register them promptly."""
    owners = get_settings().owner_emails
    if not owners:
        return []
    found = set(
        db.scalars(select(func.lower(User.email)).where(func.lower(User.email).in_(owners)))
    )
    return [email for email in owners if email not in found]


def _sponsored(sponsor: str) -> Usage:
    return Usage(
        plan=SPONSORED_PLANS[sponsor], status="active", used=0, resets_at=None, sponsor=sponsor
    )


def _effective_plan(row: UserPlan | None) -> Plan:
    if row is None or row.plan == "free":
        return get_plan("free")
    if row.status not in ACTIVE_STATUSES or row.plan not in catalog():
        return get_plan("free")
    return get_plan(row.plan)


def _add_month(dt: datetime) -> datetime:
    year, month = (dt.year + 1, 1) if dt.month == 12 else (dt.year, dt.month + 1)
    day = min(dt.day, 28)  # keep the anchor valid in every month
    return dt.replace(year=year, month=month, day=day)


def _window(row: UserPlan, now: datetime) -> tuple[datetime, datetime]:
    """The current monthly metering window for a paid plan. Follows the billing period when
    Stripe has set one, rolling forward if a renewal webhook is late; otherwise counts calendar
    months from when the plan started."""
    start = row.period_start or now
    end = row.period_end or _add_month(start)
    while end <= now:
        start, end = end, _add_month(end)
    return start, end


def _usage(row: UserPlan | None, now: datetime) -> tuple[Usage, datetime | None]:
    """The user's usage as of now, and the window start it belongs to (None for lifetime)."""
    plan = _effective_plan(row)
    status = row.status if row is not None else "active"
    used = row.ai_searches_used if row is not None else 0
    if row is None or plan.ai_period != "month":
        return Usage(plan=plan, status=status, used=used, resets_at=None), None
    start, end = _window(row, now)
    if row.period_start is None or start != row.period_start:
        used = 0  # a new period has begun; the stored count belongs to the previous one
    return Usage(plan=plan, status=status, used=used, resets_at=end), start


def usage(db: Session, user_id: uuid.UUID) -> Usage:
    """Read-only view of the user's plan and remaining Agentic Triage runs."""
    sponsor = sponsor_of(db, user_id)
    if sponsor:
        return _sponsored(sponsor)
    return _usage(db.get(UserPlan, user_id), datetime.now(UTC))[0]


def limit_reached(u: Usage) -> ApiError:
    if u.plan.ai_period == "lifetime":
        message = (
            f"You've used all {u.limit} free Agentic Triage runs. Upgrade your plan to keep "
            "using AI assistance."
        )
    else:
        when = u.resets_at.strftime("%b %-d") if u.resets_at else "next period"
        message = (
            f"You've used this period's {u.limit} Agentic Triage runs on the {u.plan.name} "
            f"plan. They reset on {when}, or you can upgrade for more."
        )
    return ApiError(
        402,
        "ai_limit_reached",
        message,
        {"plan": u.plan.key, "used": u.used, "limit": u.limit},
    )


def consume(db: Session, user_id: uuid.UUID, n: int = 1) -> Usage:
    """Charge ``n`` runs to the user, or raise ``ai_limit_reached`` without charging.
    Sponsored (owner / owner's team) users are never charged or limited.

    Commits nothing: the charge is part of the caller's transaction and is rolled back with
    it if the AI call fails."""
    sponsor = sponsor_of(db, user_id)
    if sponsor:
        return _sponsored(sponsor)
    now = datetime.now(UTC)
    db.execute(
        insert(UserPlan)
        .values(user_id=user_id, period_start=now)
        .on_conflict_do_nothing(index_elements=[UserPlan.user_id])
    )
    row = db.scalars(
        select(UserPlan)
        .where(UserPlan.user_id == user_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).one()
    current, start = _usage(row, now)
    if start is not None and start != row.period_start:
        row.period_start = start
        if row.period_end is not None:
            row.period_end = current.resets_at
        row.ai_searches_used = 0
    if current.used + n > current.plan.ai_searches:
        raise limit_reached(current)
    row.ai_searches_used = current.used + n
    db.flush()
    return Usage(
        plan=current.plan, status=current.status, used=row.ai_searches_used,
        resets_at=current.resets_at,
    )  # fmt: skip


def apply_subscription(
    db: Session,
    user_id: uuid.UUID,
    *,
    plan: str,
    status: str,
    period_start: datetime | None,
    period_end: datetime | None,
    stripe_customer_id: str | None = None,
    stripe_subscription_id: str | None = None,
) -> UserPlan:
    """Record a subscription change (from a verified Stripe webhook). A new billing period, or
    a new plan, starts the usage count over. The caller commits."""
    if plan not in catalog():
        raise ValueError(f"Unknown plan {plan!r}")
    set_user(db, user_id)
    row = db.get(UserPlan, user_id)
    if row is None:
        row = UserPlan(user_id=user_id, ai_searches_used=0)
        db.add(row)
    if row.plan != plan or row.period_start != period_start:
        row.ai_searches_used = 0
    row.plan, row.status = plan, status
    row.period_start, row.period_end = period_start, period_end
    if stripe_customer_id:
        row.stripe_customer_id = stripe_customer_id
    if stripe_subscription_id:
        row.stripe_subscription_id = stripe_subscription_id
    db.flush()
    return row


def billing_enabled() -> bool:
    return get_settings().billing_enabled
