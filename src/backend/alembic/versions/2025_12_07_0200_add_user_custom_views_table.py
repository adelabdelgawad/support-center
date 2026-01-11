"""Add user_custom_views table - ONE view per user controlling visible tabs.

Revision ID: user_custom_views_001
Revises:
Create Date: 2025-12-07

This table stores which predefined view tabs are visible for each user.
Each user can have only ONE custom view configuration.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSON

# revision identifiers, used by Alembic.
revision: str = "user_custom_views_001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create user_custom_views table for managing visible tabs per user."""
    op.create_table(
        "user_custom_views",
        sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
        sa.Column(
            "user_id",
            sa.UUID(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,  # ONE view per user
        ),
        # List of visible tab IDs
        sa.Column(
            "visible_tabs",
            JSON,
            nullable=False,
            server_default='["unassigned", "all_unsolved", "my_unsolved", "recently_updated", "recently_solved"]',
        ),
        # Default tab to show when user opens tickets page
        sa.Column(
            "default_tab",
            sa.String(length=50),
            nullable=False,
            server_default="unassigned",
        ),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", name="uq_user_custom_views_user_id"),
    )

    # Create index on is_active only (user_id is already unique)
    op.create_index(
        "ix_user_custom_views_is_active",
        "user_custom_views",
        ["is_active"],
    )


def downgrade() -> None:
    """Drop user_custom_views table."""
    op.drop_index("ix_user_custom_views_is_active", table_name="user_custom_views")
    op.drop_table("user_custom_views")
