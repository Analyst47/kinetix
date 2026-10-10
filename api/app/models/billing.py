import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, Timestamped


class UserPlan(Timestamped, Base):
    """A user's plan and AI usage. One row per user, created on first AI use.

    Isolated by row-level security on ``app.user_id``: a request only ever sees the row of the
    user whose session it verified. The Stripe columns are empty until billing is wired in; a
    subscription webhook fills them and moves ``plan`` / ``status`` / the period.
    """

    __tablename__ = "user_plans"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    # Plan key from app.billing.plans.PLANS ("free", "pro", "team").
    plan: Mapped[str] = mapped_column(String(32), default="free", server_default="free")
    # Subscription state, mirroring Stripe's: active, trialing, past_due, canceled, ...
    # A paid plan only grants its quota while active or trialing.
    status: Mapped[str] = mapped_column(String(32), default="active", server_default="active")
    # AI searches used in the current period (or ever, on the one-time free allowance).
    ai_searches_used: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # The metering window for paid plans. Without a period_end (no Stripe yet), monthly plans
    # reset on calendar months starting from period_start.
    period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    stripe_customer_id: Mapped[str | None] = mapped_column(String(255), unique=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(255), unique=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (CheckConstraint("ai_searches_used >= 0", name="used_nonnegative"),)
