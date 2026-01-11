"""Add composite indexes for query performance optimization.

Revision ID: 2025_12_06_2700_add_composite_indexes
Revises: 2025_12_06_2600_remove_assign_type_id
Create Date: 2025-12-06 27:00:00.000000

This migration adds composite indexes to improve query performance:
1. ServiceRequest: technician views filtering (status_id, business_unit_id, created_at)
2. ServiceRequest: requester views (requester_id, status_id, created_at)
3. ChatMessage: last message queries with DESC order (request_id, created_at DESC)
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '2025_12_06_2700_add_composite_indexes'
down_revision = '2025_12_06_2600_remove_assign_type_id'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ServiceRequest: Composite index for technician views filtering
    # Optimizes queries that filter by status and business unit, ordered by creation time
    op.create_index(
        'ix_requests_status_bu_created',
        'service_requests',
        ['status_id', 'business_unit_id', 'created_at'],
        unique=False
    )

    # ServiceRequest: Composite index for requester views
    # Optimizes queries that show user's own requests, filtered by status, ordered by creation time
    op.create_index(
        'ix_requests_requester_status_created',
        'service_requests',
        ['requester_id', 'status_id', 'created_at'],
        unique=False
    )

    # ChatMessage: Index for last message queries (DESC order for recent messages)
    # Optimizes queries that fetch recent messages for a request
    op.execute(
        'CREATE INDEX ix_messages_request_created_desc ON chat_messages (request_id, created_at DESC)'
    )


def downgrade() -> None:
    # Drop the indexes in reverse order
    op.drop_index('ix_messages_request_created_desc', table_name='chat_messages')
    op.drop_index('ix_requests_requester_status_created', table_name='service_requests')
    op.drop_index('ix_requests_status_bu_created', table_name='service_requests')
