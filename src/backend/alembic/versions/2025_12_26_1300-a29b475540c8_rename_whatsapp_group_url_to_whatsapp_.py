"""rename whatsapp_group_url to whatsapp_group_id

Revision ID: a29b475540c8
Revises: 1271b6c45133
Create Date: 2025-12-26 13:00:32.781345+00:00

"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "a29b475540c8"
down_revision = "1271b6c45133"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Rename column to preserve data
    op.alter_column(
        "business_units",
        "whatsapp_group_url",
        new_column_name="whatsapp_group_id",
    )


def downgrade() -> None:
    # Rename column back
    op.alter_column(
        "business_units",
        "whatsapp_group_id",
        new_column_name="whatsapp_group_url",
    )
