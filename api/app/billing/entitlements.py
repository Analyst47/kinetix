"""The AI quota gate: how many AI searches a user has, and charging one.

Every AI model call costs one "search": an Analyze, Ask or Draft, or one finding reviewed by a
triage pass. ``consume`` is the only way to spend one. It locks the user's plan row for the rest
of the request's transaction, so concurrent requests from the same user can't overspend, and
because the charge lives in that same transaction, a request that fails (provider error, spend
cap) rolls back and the user is not charged.

Stripe drops in through ``apply_subscription`` (called from a webhook) — nothing here needs to
know how a plan was bought.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.billing.plans import Plan, catalog, get_plan
from app.config import get_settings
from app.db import set_user
from app.errors import ApiError
from app.models import UserPlan

# A paid plan grants its quota only while the subscription is in good standing.
ACTIVE_STATUSES = frozenset({"active", "trialing"})


@dataclass(frozen=True)
class Usage:
    plan: Plan
    status: str
    used: int
    resets_at: datetime | None

    @property
    def limit(self) -> int:
        return self.plan.ai_searches

    @property
    def remaining(self) -> int:
        return max(0, self.limit - self.used)

    def audit(self) -> dict:
        """What an AI run records about the charge, for the audit trail."""
        return {"plan": self.plan.key, "searches_used": self.used, "searches_limit": self.limit}


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
    """Read-only view of the user's plan and remaining searches."""
    return _usage(db.get(UserPlan, user_id), datetime.now(UTC))[0]


def limit_reached(u: Usage) -> ApiError:
    if u.plan.ai_period == "lifetime":
        message = (
            f"You've used all {u.limit} free AI searches. Upgrade your plan to keep using AI "
            "assistance."
        )
    else:
        when = u.resets_at.strftime("%b %-d") if u.resets_at else "next period"
        message = (
            f"You've used this period's {u.limit} AI searches on the {u.plan.name} plan. "
            f"They reset on {when}, or you can upgrade for more."
        )
    return ApiError(
        402,
        "ai_limit_reached",
        message,
        {"plan": u.plan.key, "used": u.used, "limit": u.limit},
    )


def consume(db: Session, user_id: uuid.UUID, n: int = 1) -> Usage:
    """Charge ``n`` searches to the user, or raise ``ai_limit_reached`` without charging.

    Commits nothing: the charge is part of the caller's transaction and is rolled back with
    it if the AI call fails."""
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
    if current.used + n > current.limit:
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
