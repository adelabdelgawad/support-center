"""add_performance_indexes

Revision ID: 2b0dd6f1c67b
Revises: 37e8fdb3aff0
Create Date: 2026-01-30 20:38:28.934022

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision = '2b0dd6f1c67b'
down_revision = '37e8fdb3aff0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Add performance indexes for frequently queried fields.

    These indexes optimize:
    1. Business unit counts queries (business_unit_id + is_deleted + status_id)
    2. Request assignee lookups (request_id + assignee_id)
    3. Parent/subtask queries (parent_task_id + is_deleted + status_id)
    """

    # Use raw SQL with IF NOT EXISTS to avoid errors if indexes already exist
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_service_requests_business_unit_view
        ON service_requests (business_unit_id, is_deleted, status_id);
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_request_assignees_lookup
        ON request_assignees (request_id, assignee_id);
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_service_requests_parent_task
        ON service_requests (parent_task_id, is_deleted, status_id);
    """)


def downgrade() -> None:
    """
    Remove performance indexes added in upgrade.
    """
    op.execute("DROP INDEX IF EXISTS idx_service_requests_parent_task;")
    op.execute("DROP INDEX IF EXISTS idx_request_assignees_lookup;")
    op.execute("DROP INDEX IF EXISTS idx_service_requests_business_unit_view;")