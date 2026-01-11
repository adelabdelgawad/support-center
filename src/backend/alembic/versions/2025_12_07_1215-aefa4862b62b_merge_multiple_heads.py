"""merge_multiple_heads

Revision ID: aefa4862b62b
Revises: 2025_12_07_0100_add_new_statuses_and_due_date, 2025_12_07_0400_add_updated_by, 2025_12_07_1500_add_updated_by_to_business_units
Create Date: 2025-12-07 12:15:49.496183+00:00

"""

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision = "aefa4862b62b"
down_revision = (
    "2025_12_07_0100_add_new_statuses_and_due_date",
    "2025_12_07_0400_add_updated_by",
    "2025_12_07_1500_add_updated_by_to_business_units",
)
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
