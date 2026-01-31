"""Remove assign_type_id column from request_assignees table.

Revision ID: 2025_12_06_2600_remove_assign_type_id
Revises: 2025_12_06_2500_rename_tables
Create Date: 2025-12-06 26:00:00.000000

This migration removes the assign_type_id column and the assign_type enum
that was used to distinguish between technicians and CC recipients.

The CC functionality has been completely removed from the system.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '2025_12_06_2600_remove_assign_type_id'
down_revision = '2025_12_06_2500_rename_tables'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop the unique constraint that includes assign_type_id
    op.execute('DROP INDEX IF EXISTS ix_request_assignees_unique')

    # Drop the index on assign_type_id
    op.execute('DROP INDEX IF EXISTS ix_request_assignees_assign_type_id')

    # Drop the assign_type_id column
    op.drop_column('request_assignees', 'assign_type_id')

    # Create new unique constraint without assign_type_id
    op.create_index(
        'ix_request_assignees_unique',
        'request_assignees',
        ['request_id', 'assignee_id'],
        unique=True
    )


def downgrade() -> None:
    # Drop the new unique constraint
    op.execute('DROP INDEX IF EXISTS ix_request_assignees_unique')

    # Re-add the assign_type_id column
    op.add_column(
        'request_assignees',
        sa.Column('assign_type_id', sa.Integer(), nullable=False, server_default='1')
    )

    # Re-create the assign_type_id index
    op.create_index(
        'ix_request_assignees_assign_type_id',
        'request_assignees',
        ['assign_type_id']
    )

    # Re-create the unique constraint with assign_type_id
    op.create_index(
        'ix_request_assignees_unique',
        'request_assignees',
        ['request_id', 'assignee_id', 'assign_type_id'],
        unique=True
    )
