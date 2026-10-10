"""user plans and AI usage quotas

One row per user: their plan (free / pro / team), subscription status, the AI searches used in
the current period, and the Stripe identifiers billing will fill in later. Rows are isolated per
user with row-level security on app.user_id (bound after the session cookie is verified), and
the restricted application role gets only the access it needs.

Revision ID: 7e3f9b2c4d18
Revises: a1b2c3d4e5f6
Create Date: 2026-10-10 09:00:00

"""

import re
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.config import get_settings

revision: str = "7e3f9b2c4d18"
down_revision: str | Sequence[str] | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_USER_MATCH = "user_id = NULLIF(current_setting('app.user_id', true), '')::uuid"


def _role() -> str:
    role = get_settings().db_app_role
    if not re.fullmatch(r"[a-z_][a-z0-9_]{0,62}", role):
        raise ValueError(f"KINETIX_DB_APP_ROLE {role!r} isn't a plain lowercase role name.")
    return role


def upgrade() -> None:
    op.create_table(
        "user_plans",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("plan", sa.String(length=32), server_default="free", nullable=False),
        sa.Column("status", sa.String(length=32), server_default="active", nullable=False),
        sa.Column("ai_searches_used", sa.Integer(), server_default="0", nullable=False),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("stripe_customer_id", sa.String(length=255), nullable=True),
        sa.Column("stripe_subscription_id", sa.String(length=255), nullable=True),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.CheckConstraint("ai_searches_used >= 0", name=op.f("ck_user_plans_used_nonnegative")),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_user_plans_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_user_plans")),
        sa.UniqueConstraint("stripe_customer_id", name=op.f("uq_user_plans_stripe_customer_id")),
        sa.UniqueConstraint(
            "stripe_subscription_id", name=op.f("uq_user_plans_stripe_subscription_id")
        ),
    )

    # A request only sees and writes the row of the user it authenticated. FORCE applies the
    # policy to the table owner too.
    op.execute("ALTER TABLE user_plans ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE user_plans FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY user_isolation ON user_plans USING ({_USER_MATCH}) "
        f"WITH CHECK ({_USER_MATCH})"
    )

    role = _role()
    op.execute(
        f"""
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role}') THEN
            RAISE NOTICE 'Role {role} does not exist yet; grants skipped. Create it, then re-run.';
            RETURN;
          END IF;
          IF current_user = '{role}' THEN
            RETURN;
          END IF;
          GRANT SELECT, INSERT, UPDATE, DELETE ON user_plans TO {role};
        END
        $$;
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS user_isolation ON user_plans")
    op.drop_table("user_plans")
