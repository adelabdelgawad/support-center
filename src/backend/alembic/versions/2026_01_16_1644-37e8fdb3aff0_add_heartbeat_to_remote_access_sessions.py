"""add_heartbeat_to_remote_access_sessions

Revision ID: 37e8fdb3aff0
Revises: 8497517e9f53
Create Date: 2026-01-16 16:44:53.660194

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '37e8fdb3aff0'
down_revision = '8497517e9f53'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add last_heartbeat column to remote_access_sessions table
    op.add_column('remote_access_sessions',
        sa.Column('last_heartbeat', sa.DateTime(), nullable=True)
    )

    # Create index on last_heartbeat for efficient cleanup queries
    op.create_index('ix_remote_access_sessions_last_heartbeat',
        'remote_access_sessions', ['last_heartbeat']
    )

    # Create composite index on status and last_heartbeat for orphan detection
    op.create_index('ix_remote_access_sessions_status_heartbeat',
        'remote_access_sessions', ['status', 'last_heartbeat']
    )


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_remote_access_sessions_status_heartbeat', 'remote_access_sessions')
    op.drop_index('ix_remote_access_sessions_last_heartbeat', 'remote_access_sessions')

    # Drop column
    op.drop_column('remote_access_sessions', 'last_heartbeat')