"""Add updated_by field to business_unit_regions table.

Revision ID: 2025_12_07_0400_add_updated_by
Revises: 2025_12_07_0300_add_reporting_tables_and_sla_fields
Create Date: 2025-12-07 04:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '2025_12_07_0400_add_updated_by'
down_revision = '2025_12_07_0300_add_reporting_tables_and_sla_fields'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add updated_by column to business_unit_regions table
    op.add_column(
        'business_unit_regions',
        sa.Column(
            'updated_by',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('users.id'),
            nullable=True,
            comment='User who last updated this region'
        )
    )

    # Create index for updated_by for query performance
    op.create_index(
        'ix_business_unit_regions_updated_by',
        'business_unit_regions',
        ['updated_by'],
        unique=False
    )


def downgrade() -> None:
    # Drop index
    op.drop_index('ix_business_unit_regions_updated_by', table_name='business_unit_regions')

    # Drop column
    op.drop_column('business_unit_regions', 'updated_by')
