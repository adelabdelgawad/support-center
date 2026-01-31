"""make_business_unit_region_id_optional

Revision ID: 255b75131416
Revises: a459c70c9b47
Create Date: 2025-12-10 14:34:46.587120+00:00

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "255b75131416"
down_revision = "a459c70c9b47"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Make business_unit_region_id nullable in business_units table
    op.alter_column(
        "business_units",
        "business_unit_region_id",
        existing_type=sa.Integer(),
        nullable=True,
    )


def downgrade() -> None:
    # Revert business_unit_region_id to NOT NULL
    op.alter_column(
        "business_units",
        "business_unit_region_id",
        existing_type=sa.Integer(),
        nullable=False,
    )
