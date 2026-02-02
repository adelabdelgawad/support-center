"""remove desired_ous from ad config

Revision ID: a2b3c4d5e6f8
Revises: cf35d6a83683
Create Date: 2026-02-02 00:01:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a2b3c4d5e6f8"
down_revision: Union[str, None] = "cf35d6a83683"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("active_directory_configs", "desired_ous")


def downgrade() -> None:
    op.add_column(
        "active_directory_configs",
        sa.Column("desired_ous", sa.JSON(), nullable=True),
    )
