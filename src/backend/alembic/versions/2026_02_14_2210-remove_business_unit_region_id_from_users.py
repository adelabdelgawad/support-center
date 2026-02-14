"""remove business_unit_region_id from users

Revision ID: 2026_02_14_2210
Revises: add_user_section_relationship
Create Date: 2026-02-14 22:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2026_02_14_2210'
down_revision: Union[str, None] = 'add_user_section_relationship'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Remove business_unit_region_id from users table."""
    # Drop the foreign key constraint first
    op.drop_constraint('users_business_unit_region_id_fkey', 'users', type_='foreignkey')

    # Drop the column
    op.drop_column('users', 'business_unit_region_id')


def downgrade() -> None:
    """Add business_unit_region_id back to users table."""
    # Add the column back
    op.add_column('users', sa.Column('business_unit_region_id', sa.Integer(), nullable=True))

    # Add the foreign key constraint back
    op.create_foreign_key(
        'users_business_unit_region_id_fkey',
        'users',
        'business_unit_regions',
        ['business_unit_region_id'],
        ['id']
    )
