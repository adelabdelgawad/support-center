"""add updated_by to business units

Revision ID: 2025_12_07_1500
Revises: 2025_12_07_0300_add_reporting_tables_and_sla_fields
Create Date: 2025-12-07 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '2025_12_07_1500_add_updated_by_to_business_units'
down_revision: Union[str, None] = '2025_12_07_0300_add_reporting_tables_and_sla_fields'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add updated_by column to business_units table
    op.add_column('business_units',
        sa.Column('updated_by', postgresql.UUID(as_uuid=True), nullable=True)
    )

    # Add foreign key constraint
    op.create_foreign_key(
        'fk_business_units_updated_by_users',
        'business_units', 'users',
        ['updated_by'], ['id']
    )


def downgrade() -> None:
    # Drop foreign key constraint
    op.drop_constraint('fk_business_units_updated_by_users', 'business_units', type_='foreignkey')

    # Drop updated_by column
    op.drop_column('business_units', 'updated_by')
