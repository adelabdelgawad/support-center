"""add_user_preferences_columns

Revision ID: cfa42ee823ae
Revises: 56000e485d2c
Create Date: 2025-12-13 13:56:03.029598+00:00

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "cfa42ee823ae"
down_revision = "56000e485d2c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add preference columns to users table
    op.add_column(
        "users",
        sa.Column("language", sa.String(length=10), nullable=True, server_default="ar"),
    )
    op.add_column(
        "users",
        sa.Column("theme", sa.String(length=10), nullable=True, server_default="system"),
    )
    op.add_column(
        "users",
        sa.Column("notifications_enabled", sa.Boolean(), nullable=True, server_default=sa.text("true")),
    )
    op.add_column(
        "users",
        sa.Column("sound_enabled", sa.Boolean(), nullable=True, server_default=sa.text("true")),
    )
    op.add_column(
        "users",
        sa.Column("sound_volume", sa.Float(), nullable=True, server_default=sa.text("0.5")),
    )


def downgrade() -> None:
    # Remove preference columns from users table
    op.drop_column("users", "sound_volume")
    op.drop_column("users", "sound_enabled")
    op.drop_column("users", "notifications_enabled")
    op.drop_column("users", "theme")
    op.drop_column("users", "language")
