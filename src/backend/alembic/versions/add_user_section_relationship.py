"""Add user-section relationship

Revision ID: add_user_section_relationship
Revises: 2026-02-14
Create Date: 2025-02-14 15:38:57
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "add_user_section_relationship"
down_revision: Union[str, None] = "2026_02_14_1534"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add user-section relationship to database."""
    # This migration has been superseded by the existing user_sections table
    # No operation needed as the table already exists
    pass


def downgrade() -> None:
    """Remove user-section relationship from database."""
    # This migration has been superseded
    # No operation needed
    pass
