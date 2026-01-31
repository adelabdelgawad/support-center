"""simplify_remote_access_session_to_minimal_fields

Revision ID: 197b5205b6df
Revises: 50b1e04ee3f7
Create Date: 2025-12-26 07:26:52.786043+00:00

ABSOLUTE MINIMUM: Removes all remote access complexity for ephemeral sessions.

DROPS ENTIRELY:
- remote_access_events table (no audit trail)

SIMPLIFIES remote_access_sessions to 5 fields:
- id (UUID primary key)
- request_id (FK to service_requests)
- agent_id (FK to users)
- requester_id (FK to users)
- created_at (session creation time)

REMOVES from remote_access_sessions:
- status field (purely ephemeral WebSocket state)
- All timestamp fields except created_at
- All counters (clipboard_sync_count, uac_prompt_count, mouse_click_count, key_press_count)
- All metadata fields (duration_seconds, control_enabled, clipboard_enabled, end_reason, quality_preset, ice_connection_state)
- updated_at field
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "197b5205b6df"
down_revision = "50b1e04ee3f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    ABSOLUTE MINIMUM: Drop events table, simplify sessions to 5 fields.
    All session state is ephemeral (WebSocket only).
    """
    # Step 1: Drop remote_access_events table entirely (no audit trail)
    op.drop_table('remote_access_events')

    # Step 2: Drop indexes from remote_access_sessions
    op.drop_index('ix_remote_sessions_status', table_name='remote_access_sessions')

    # Step 3: Drop columns from remote_access_sessions (17 total)
    columns_to_drop = [
        'status',
        'requested_at',
        'approved_at',
        'started_at',
        'ended_at',
        'expires_at',
        'duration_seconds',
        'control_enabled',
        'clipboard_enabled',
        'clipboard_sync_count',
        'uac_prompt_count',
        'mouse_click_count',
        'key_press_count',
        'end_reason',
        'quality_preset',
        'ice_connection_state',
        'updated_at',
    ]

    for col in columns_to_drop:
        op.drop_column('remote_access_sessions', col)


def downgrade() -> None:
    """
    Restore original table structure including events table.
    Note: All event and session state data will be lost.
    """
    # Step 1: Re-create remote_access_events table
    op.create_table(
        'remote_access_events',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('session_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('event_type', sa.String(50), nullable=False),
        sa.Column('event_data', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('actor_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('actor_type', sa.String(20), nullable=True),
        sa.Column('timestamp', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.ForeignKeyConstraint(['actor_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['session_id'], ['remote_access_sessions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_remote_events_session_id', 'remote_access_events', ['session_id'])
    op.create_index('ix_remote_events_type', 'remote_access_events', ['event_type'])
    op.create_index('ix_remote_events_timestamp', 'remote_access_events', ['timestamp'])

    # Step 2: Re-add all dropped columns to remote_access_sessions
    op.add_column('remote_access_sessions',
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'))

    op.add_column('remote_access_sessions',
        sa.Column('requested_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')))

    op.add_column('remote_access_sessions',
        sa.Column('approved_at', sa.DateTime(), nullable=True))

    op.add_column('remote_access_sessions',
        sa.Column('started_at', sa.DateTime(), nullable=True))

    op.add_column('remote_access_sessions',
        sa.Column('ended_at', sa.DateTime(), nullable=True))

    op.add_column('remote_access_sessions',
        sa.Column('expires_at', sa.DateTime(), nullable=True))

    op.add_column('remote_access_sessions',
        sa.Column('duration_seconds', sa.Integer(), nullable=True))

    op.add_column('remote_access_sessions',
        sa.Column('control_enabled', sa.Boolean(), nullable=False, server_default='false'))

    op.add_column('remote_access_sessions',
        sa.Column('clipboard_enabled', sa.Boolean(), nullable=False, server_default='false'))

    op.add_column('remote_access_sessions',
        sa.Column('clipboard_sync_count', sa.Integer(), nullable=False, server_default='0'))

    op.add_column('remote_access_sessions',
        sa.Column('uac_prompt_count', sa.Integer(), nullable=False, server_default='0'))

    op.add_column('remote_access_sessions',
        sa.Column('mouse_click_count', sa.Integer(), nullable=False, server_default='0'))

    op.add_column('remote_access_sessions',
        sa.Column('key_press_count', sa.Integer(), nullable=False, server_default='0'))

    op.add_column('remote_access_sessions',
        sa.Column('end_reason', sa.String(50), nullable=True))

    op.add_column('remote_access_sessions',
        sa.Column('quality_preset', sa.String(20), nullable=False, server_default='medium'))

    op.add_column('remote_access_sessions',
        sa.Column('ice_connection_state', sa.String(50), nullable=True))

    op.add_column('remote_access_sessions',
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')))

    # Step 3: Re-create status index
    op.create_index('ix_remote_sessions_status', 'remote_access_sessions', ['status'])
