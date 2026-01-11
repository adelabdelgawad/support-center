"""Remove cache_services and message_read_states tables

Revision ID: remove_cache_msg_read
Revises: add_is_active_is_deleted_to_business_
Create Date: 2025-12-06 00:00:00.000000

Rationale:
- cache_services: Metadata table for Redis cache management. All caches are now configured in code (core/config.py) instead of in the database. Removes tight coupling between DB and cache logic.
- message_read_states: Per-user message read tracking. Unused in current application. Removed to simplify schema and reduce database complexity.

These removals have no impact on core functionality:
- Read state tracking was implemented but not used in frontend
- Cache services metadata was only used by the removed /api/v1/cache-admin endpoints
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'remove_cache_msg_read'
down_revision = '64541d8224bf'  # Last migration (add_is_active_is_deleted_to_business_)
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Remove cache_services and message_read_states tables"""

    # Drop message_read_states table
    # This table has FK relationships to chat_messages and users
    op.drop_table('message_read_states')

    # Drop cache_services table
    op.drop_table('cache_services')


def downgrade() -> None:
    """Restore cache_services and message_read_states tables"""

    # Restore cache_services table
    op.create_table(
        'cache_services',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False, index=True),
        sa.Column('key', sa.String(length=100), nullable=False, unique=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('cache_type', sa.String(length=50), nullable=False, index=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('is_enabled', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('refresh_endpoint', sa.String(length=200), nullable=True),
        sa.Column('read_endpoint', sa.String(length=200), nullable=True),
        sa.Column('invalidate_endpoint', sa.String(length=200), nullable=True),
        sa.Column('display_order', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id')
    )

    # Restore message_read_states table
    op.create_table(
        'message_read_states',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('message_id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('read_at', sa.DateTime(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.ForeignKeyConstraint(['message_id'], ['chat_messages.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('message_id', 'user_id', name='uq_message_user_read')
    )

    # Restore indexes
    op.create_index('idx_message_read_states_user_message', 'message_read_states', ['user_id', 'message_id'])
    op.create_index('idx_message_read_states_message_read_at', 'message_read_states', ['message_id', 'read_at'])
    op.create_index('idx_message_read_states_user_read_at', 'message_read_states', ['user_id', 'read_at'])
