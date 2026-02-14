"""drop_orphan_tag_id_from_service_requests

Revision ID: 975b29dbdfa5
Revises: i9j8k7l6m5n4
Create Date: 2026-02-13 23:04:18.974608

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '975b29dbdfa5'
down_revision = 'i9j8k7l6m5n4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("service_requests", "tag_id")


def downgrade() -> None:
    op.add_column(
        "service_requests",
        sa.Column("tag_id", sa.Integer(), nullable=True),
    )