"""remove_resolution_type_and_update_request_statuses

Revision ID: cbefea7c6997
Revises: 64541d8224bf
Create Date: 2025-12-05 22:16:11.699047+00:00

"""

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision = "cbefea7c6997"
down_revision = "64541d8224bf"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    1. Drop resolution_types table if exists
    2. Remove resolution_type_id from resolutions table
    3. Update request statuses to new 5-status system
    4. Map existing service requests to new status IDs
    5. Clear resolution field from all service requests
    """
    # 1. Drop resolution_types table if it exists
    op.execute("DROP TABLE IF EXISTS resolution_types CASCADE")

    # 2. Remove resolution_type_id column from resolutions table if exists
    op.execute(
        "ALTER TABLE IF EXISTS resolutions DROP COLUMN IF EXISTS resolution_type_id CASCADE"
    )

    # 3. First update existing service_requests to use temporary status_id
    # This is necessary because we can't delete statuses while they're referenced
    # Map all status_ids to temporary values (100+)
    op.execute("UPDATE service_requests SET status_id = 101 WHERE status_id = 1")  # pending
    op.execute("UPDATE service_requests SET status_id = 102 WHERE status_id = 2")  # open
    op.execute("UPDATE service_requests SET status_id = 103 WHERE status_id = 3")  # on-progress
    op.execute("UPDATE service_requests SET status_id = 104 WHERE status_id = 4")  # hold
    op.execute("UPDATE service_requests SET status_id = 105 WHERE status_id = 5")  # rejected
    op.execute("UPDATE service_requests SET status_id = 106 WHERE status_id = 6")  # closed
    op.execute("UPDATE service_requests SET status_id = 107 WHERE status_id = 7")  # archived
    op.execute("UPDATE service_requests SET status_id = 108 WHERE status_id = 8")  # solved

    # 4. Delete all existing request statuses (they're no longer referenced)
    op.execute("DELETE FROM request_statuses")

    # 5. Insert new 5 statuses
    op.execute(
        """
        INSERT INTO request_statuses (id, name, description, color, readonly, is_active, count_as_solved, created_at, updated_at)
        VALUES
        (1, 'Open', 'Request is open and being worked on', 'blue', true, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        (2, 'Hold', 'Request is on hold waiting for something', 'yellow', true, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        (3, 'Solved', 'Request has been resolved', 'green', true, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        (4, 'Archived', 'Request is archived', 'gray', true, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        (5, 'Canceled', 'Request is canceled', 'red', true, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
    )

    # 6. Update service_requests from temporary to new status_id mapping
    # Old status 1 (pending) → New status 1 (Open)
    op.execute("UPDATE service_requests SET status_id = 1 WHERE status_id = 101")

    # Old status 2 (open) → New status 1 (Open)
    op.execute("UPDATE service_requests SET status_id = 1 WHERE status_id = 102")

    # Old status 3 (on-progress) → New status 1 (Open)
    op.execute("UPDATE service_requests SET status_id = 1 WHERE status_id = 103")

    # Old status 4 (hold) → New status 2 (Hold)
    op.execute("UPDATE service_requests SET status_id = 2 WHERE status_id = 104")

    # Old status 5 (rejected) → New status 5 (Canceled)
    op.execute("UPDATE service_requests SET status_id = 5 WHERE status_id = 105")

    # Old status 6 (closed) → New status 3 (Solved)
    op.execute("UPDATE service_requests SET status_id = 3 WHERE status_id = 106")

    # Old status 7 (archived) → New status 4 (Archived)
    op.execute("UPDATE service_requests SET status_id = 4 WHERE status_id = 107")

    # Old status 8 (solved) → New status 3 (Solved)
    op.execute("UPDATE service_requests SET status_id = 3 WHERE status_id = 108")

    # 7. Clear resolution field from all service_requests (user confirmed - start fresh)
    op.execute("UPDATE service_requests SET resolution = NULL")

    # Reset the sequence for request_statuses to start from 6
    op.execute("SELECT setval('request_statuses_id_seq', 5, true)")


def downgrade() -> None:
    """
    Rollback to original 8 statuses and recreate resolution_types table
    """
    # 1. Recreate resolution_types table
    op.create_table(
        'resolution_types',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=50), nullable=False),
        sa.Column('description', sa.String(length=200), nullable=True),
        sa.Column('created_by', sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('updated_by', sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('is_deleted', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.ForeignKeyConstraint(['updated_by'], ['users.id']),
        sa.UniqueConstraint('name')
    )
    op.create_index('ix_resolution_types_name', 'resolution_types', ['name'], unique=True)
    op.create_index('ix_resolution_types_is_active', 'resolution_types', ['is_active'])
    op.create_index('ix_resolution_types_is_deleted', 'resolution_types', ['is_deleted'])

    # 2. Add resolution_type_id back to resolutions table
    op.add_column('resolutions', sa.Column('resolution_type_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_resolutions_resolution_type_id', 'resolutions', 'resolution_types', ['resolution_type_id'], ['id'])
    op.create_index('ix_resolutions_resolution_type_id', 'resolutions', ['resolution_type_id'])

    # 3. Delete new 5 statuses
    op.execute("DELETE FROM request_statuses")

    # 4. Restore original 8 statuses
    op.execute(
        """
        INSERT INTO request_statuses (id, name, description, color, readonly, is_active, count_as_solved, created_at, updated_at)
        VALUES
        (1, 'pending', 'Request pending review', 'yellow', true, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        (2, 'open', 'Request newly created', 'blue', true, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        (3, 'on-progress', 'Work in progress', 'orange', true, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        (4, 'hold', 'Request on hold', 'purple', true, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        (5, 'rejected', 'Request rejected', 'red', true, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        (6, 'closed', 'Request closed', 'gray', true, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        (7, 'archived', 'Request archived', 'slate', true, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        (8, 'solved', 'Request resolved', 'green', true, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """
    )

    # Note: We cannot perfectly reverse the status mapping as multiple old statuses mapped to single new ones
    # All requests with new status 1 (Open) will become old status 2 (open) as a reasonable default
    op.execute("UPDATE service_requests SET status_id = 2 WHERE status_id = 1")
    op.execute("UPDATE service_requests SET status_id = 4 WHERE status_id = 2")
    op.execute("UPDATE service_requests SET status_id = 8 WHERE status_id = 3")
    op.execute("UPDATE service_requests SET status_id = 7 WHERE status_id = 4")
    op.execute("UPDATE service_requests SET status_id = 5 WHERE status_id = 5")

    # Reset sequence
    op.execute("SELECT setval('request_statuses_id_seq', 8, true)")
