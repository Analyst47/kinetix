"""grant table access to the restricted application role

Postgres superusers and roles with BYPASSRLS skip row-level security even when it is
forced, so the API must not connect as one. Migrations run as the schema owner; this
grants the application role only the data access it needs, for current and future tables.
Creating the role itself (with its password) is an operator step; see docs/SECURITY.md.

Revision ID: 5b1e0c7d9a42
Revises: c29da954df1c
Create Date: 2026-10-08 07:40:00

"""

import re
from collections.abc import Sequence

from alembic import op

from app.config import get_settings

revision: str = "5b1e0c7d9a42"
down_revision: str | Sequence[str] | None = "c29da954df1c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _role() -> str:
    role = get_settings().db_app_role
    if not re.fullmatch(r"[a-z_][a-z0-9_]{0,62}", role):
        raise ValueError(f"KINETIX_DB_APP_ROLE {role!r} isn't a plain lowercase role name.")
    return role


def upgrade() -> None:
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
          GRANT USAGE ON SCHEMA public TO {role};
          GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {role};
          GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO {role};
          ALTER DEFAULT PRIVILEGES IN SCHEMA public
            GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {role};
          ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO {role};
          -- The app never rewrites migration history.
          REVOKE INSERT, UPDATE, DELETE ON alembic_version FROM {role};
        END
        $$;
        """
    )


def downgrade() -> None:
    role = _role()
    op.execute(
        f"""
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role}')
             AND current_user <> '{role}' THEN
            ALTER DEFAULT PRIVILEGES IN SCHEMA public
              REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM {role};
            ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE, SELECT ON SEQUENCES FROM {role};
            REVOKE ALL ON ALL TABLES IN SCHEMA public FROM {role};
            REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM {role};
            REVOKE USAGE ON SCHEMA public FROM {role};
          END IF;
        END
        $$;
        """
    )
