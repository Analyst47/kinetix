"""finding ground truth label

Revision ID: a1b2c3d4e5f6
Revises: c0fe6af8dc0f
Create Date: 2026-10-08 19:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'c0fe6af8dc0f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('findings', sa.Column('ground_truth', sa.String(length=16), nullable=True))
    op.add_column('findings', sa.Column('ground_truth_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('findings', 'ground_truth_at')
    op.drop_column('findings', 'ground_truth')
