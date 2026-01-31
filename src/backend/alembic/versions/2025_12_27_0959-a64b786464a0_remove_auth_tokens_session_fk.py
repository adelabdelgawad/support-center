"""remove_auth_tokens_session_fk

Revision ID: a64b786464a0
Revises: 0cce66bbe2cb
Create Date: 2025-12-27 09:59:18.086740+00:00

"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "a64b786464a0"
down_revision = "0cce66bbe2cb"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Remove foreign key constraint from auth_tokens.session_id to user_sessions.

    This is required because we split user_sessions into desktop_sessions and web_sessions.
    The auth_tokens table can't have a FK to a table that no longer contains all sessions.
    """
    # Drop the foreign key constraint
    op.drop_constraint(
        "auth_tokens_session_id_fkey", "auth_tokens", type_="foreignkey"
    )

    # Drop the index on session_id (will be recreated if needed)
    op.drop_index("idx_auth_tokens_session_id", table_name="auth_tokens")

    # Recreate the index without FK constraint
    op.create_index(
        "idx_auth_tokens_session_id", "auth_tokens", ["session_id"], unique=False
    )


def downgrade() -> None:
    """Restore the foreign key constraint (for rollback)."""
    # Drop the index
    op.drop_index("idx_auth_tokens_session_id", table_name="auth_tokens")

    # Recreate the foreign key constraint
    op.create_foreign_key(
        "auth_tokens_session_id_fkey",
        "auth_tokens",
        "user_sessions",
        ["session_id"],
        ["id"],
    )

    # Recreate the index
    op.create_index(
        "idx_auth_tokens_session_id", "auth_tokens", ["session_id"], unique=False
    )
