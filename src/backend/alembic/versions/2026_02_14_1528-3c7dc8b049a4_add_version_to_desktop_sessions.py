"""add_version_to_desktop_sessions

Revision ID: 3c7dc8b049a4
Revises: 2d68cad934c2
Create Date: 2026-02-14 15:28:07.567671

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision = '3c7dc8b049a4'
down_revision = '2d68cad934c2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add version column for optimistic locking
    op.execute("ALTER TABLE desktop_sessions ADD COLUMN version INTEGER NOT NULL DEFAULT 1")
    # Create index on version column for query performance
    op.execute("CREATE INDEX ix_desktop_sessions_version ON desktop_sessions(version)")


def downgrade() -> None:
    # Drop the version index and column
    op.execute("DROP INDEX IF EXISTS ix_desktop_sessions_version")
    op.execute("ALTER TABLE desktop_sessions DROP COLUMN IF EXISTS version")