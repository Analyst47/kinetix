"""record who created each workspace

Owner-account sponsorship (KINETIX_OWNER_EMAILS) covers the members of workspaces an owner
account created. The owner role alone can't be the test, because any owner of a workspace can
grant it to another member. Existing workspaces are backfilled with their earliest owner, which
is the account that registered them: workspaces are only created at registration (and by the
demo seed), together with that first owner membership.

Revision ID: 4d8a6c2e9f15
Revises: 7e3f9b2c4d18
Create Date: 2026-10-10 14:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "4d8a6c2e9f15"
down_revision: str | Sequence[str] | None = "7e3f9b2c4d18"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("organizations", sa.Column("created_by_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        op.f("fk_organizations_created_by_id_users"),
        "organizations",
        "users",
        ["created_by_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.execute(
        """
        UPDATE organizations AS o
           SET created_by_id = first_owner.user_id
          FROM (
                SELECT DISTINCT ON (org_id) org_id, user_id
                  FROM memberships
                 WHERE role = 'owner'
                 ORDER BY org_id, created_at, id
               ) AS first_owner
         WHERE first_owner.org_id = o.id
        """
    )
    # organizations has no row-level security and the application role's table grants
    # (migration 5b1e0c7d9a42) already cover every column, so there is nothing else to grant.


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_organizations_created_by_id_users"), "organizations", type_="foreignkey"
    )
    op.drop_column("organizations", "created_by_id")
