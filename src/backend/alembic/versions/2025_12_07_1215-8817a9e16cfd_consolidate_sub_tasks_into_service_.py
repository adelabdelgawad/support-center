"""consolidate_sub_tasks_into_service_requests

Revision ID: 8817a9e16cfd
Revises: aefa4862b62b
Create Date: 2025-12-07 12:15:57.044978+00:00

This migration consolidates the separate sub_tasks, sub_task_notes, and sub_task_attachments
tables into the main service_requests table using a self-referential parent_task_id field.

NOTE: Data migration must be performed manually before dropping old tables.
This migration only handles schema changes.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "8817a9e16cfd"
down_revision = "aefa4862b62b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ============================================================================
    # STEP 1: Add new columns to service_requests table
    # ============================================================================

    # Self-referential hierarchy
    op.add_column(
        "service_requests",
        sa.Column(
            "parent_task_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("service_requests.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )

    # Assignment tracking
    op.add_column(
        "service_requests",
        sa.Column(
            "assigned_to_section_id",
            sa.Integer(),
            sa.ForeignKey("service_sections.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "service_requests",
        sa.Column(
            "assigned_to_technician_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    # Task ordering and blocking
    op.add_column(
        "service_requests", sa.Column("order", sa.Integer(), nullable=True)
    )
    op.add_column(
        "service_requests",
        sa.Column(
            "is_blocked", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )
    op.add_column(
        "service_requests", sa.Column("blocked_reason", sa.Text(), nullable=True)
    )

    # Time tracking
    op.add_column(
        "service_requests",
        sa.Column("estimated_hours", sa.Float(), nullable=True),
    )
    op.add_column(
        "service_requests", sa.Column("actual_hours", sa.Float(), nullable=True)
    )

    # Completion tracking
    op.add_column(
        "service_requests",
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Soft delete and active status
    op.add_column(
        "service_requests",
        sa.Column(
            "is_active", sa.Boolean(), nullable=False, server_default=sa.true()
        ),
    )
    op.add_column(
        "service_requests",
        sa.Column(
            "is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )

    # Audit fields
    op.add_column(
        "service_requests",
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "service_requests",
        sa.Column(
            "updated_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )

    # ============================================================================
    # STEP 2: Create indexes on service_requests table
    # ============================================================================

    op.create_index(
        "ix_requests_parent_task_id",
        "service_requests",
        ["parent_task_id"],
        unique=False,
    )
    op.create_index(
        "ix_requests_assigned_section",
        "service_requests",
        ["assigned_to_section_id"],
        unique=False,
    )
    op.create_index(
        "ix_requests_assigned_technician",
        "service_requests",
        ["assigned_to_technician_id"],
        unique=False,
    )
    op.create_index(
        "ix_requests_parent_status",
        "service_requests",
        ["parent_task_id", "status_id"],
        unique=False,
    )
    op.create_index(
        "ix_requests_is_deleted", "service_requests", ["is_deleted"], unique=False
    )
    op.create_index(
        "ix_requests_is_active", "service_requests", ["is_active"], unique=False
    )
    op.create_index(
        "ix_requests_created_by", "service_requests", ["created_by"], unique=False
    )
    op.create_index(
        "ix_requests_completed_at",
        "service_requests",
        ["completed_at"],
        unique=False,
    )
    op.create_index(
        "ix_requests_parent_order",
        "service_requests",
        ["parent_task_id", "order"],
        unique=False,
    )

    # ============================================================================
    # STEP 3: Create request_screenshot_links junction table
    # ============================================================================

    op.create_table(
        "request_screenshot_links",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "request_id", postgresql.UUID(as_uuid=True), nullable=False
        ),
        sa.Column("screenshot_id", sa.Integer(), nullable=False),
        sa.Column(
            "linked_by", postgresql.UUID(as_uuid=True), nullable=True
        ),
        sa.Column(
            "linked_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["request_id"], ["service_requests.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["screenshot_id"], ["screenshots.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["linked_by"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "request_id", "screenshot_id", name="uq_request_screenshot_link"
        ),
    )

    # Create indexes on junction table
    op.create_index(
        "ix_screenshot_links_request_id",
        "request_screenshot_links",
        ["request_id"],
        unique=False,
    )
    op.create_index(
        "ix_screenshot_links_screenshot_id",
        "request_screenshot_links",
        ["screenshot_id"],
        unique=False,
    )
    op.create_index(
        "ix_screenshot_links_linked_by",
        "request_screenshot_links",
        ["linked_by"],
        unique=False,
    )

    # ============================================================================
    # STEP 4: Data Migration Placeholder
    # ============================================================================
    # NOTE: Data migration from sub_tasks, sub_task_notes, and sub_task_attachments
    # must be performed manually by the user before proceeding to drop tables.
    #
    # Migration steps (to be done manually):
    # 1. Migrate sub_tasks → service_requests (set parent_task_id = sub_task.request_id)
    # 2. Migrate sub_task_notes → request_notes (link to new service_request IDs)
    # 3. Handle sub_task_attachments (drop or migrate to screenshots if needed)
    # 4. Verify all data has been migrated successfully
    # 5. Then run: DROP TABLE sub_task_attachments, sub_task_notes, sub_tasks;

    # ============================================================================
    # STEP 5: Drop old tables (commented out - uncomment after manual migration)
    # ============================================================================
    # IMPORTANT: Only uncomment these lines AFTER manual data migration is complete!
    #
    # op.drop_table("sub_task_attachments")
    # op.drop_table("sub_task_notes")
    # op.drop_table("sub_tasks")


def downgrade() -> None:
    """Reverse the migration.

    NOTE: This downgrade assumes you have backups of the original sub_tasks tables.
    It will recreate the tables but NOT restore the data.
    """

    # Recreate sub_tasks table (structure only, no data)
    # NOTE: This is a simplified recreation - adjust if needed
    op.create_table(
        "sub_tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "request_id", postgresql.UUID(as_uuid=True), nullable=False
        ),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status_id", sa.Integer(), nullable=False),
        sa.Column("priority_id", sa.Integer(), nullable=False),
        sa.Column("assigned_to_section_id", sa.Integer(), nullable=True),
        sa.Column(
            "assigned_to_technician_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("estimated_hours", sa.Float(), nullable=True),
        sa.Column("actual_hours", sa.Float(), nullable=True),
        sa.Column("order", sa.Integer(), nullable=True),
        sa.Column(
            "is_blocked", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("blocked_reason", sa.Text(), nullable=True),
        sa.Column(
            "created_by", postgresql.UUID(as_uuid=True), nullable=False
        ),
        sa.Column(
            "updated_by", postgresql.UUID(as_uuid=True), nullable=True
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "is_active", sa.Boolean(), nullable=False, server_default=sa.true()
        ),
        sa.Column(
            "is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.ForeignKeyConstraint(
            ["request_id"], ["service_requests.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["status_id"], ["request_statuses.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["priority_id"], ["priorities.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["assigned_to_section_id"],
            ["service_sections.id"],
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["assigned_to_technician_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["updated_by"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # Recreate sub_task_notes table
    op.create_table(
        "sub_task_notes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "sub_task_id", postgresql.UUID(as_uuid=True), nullable=False
        ),
        sa.Column(
            "created_by", postgresql.UUID(as_uuid=True), nullable=False
        ),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column(
            "is_internal",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["sub_task_id"], ["sub_tasks.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # Recreate sub_task_attachments table
    op.create_table(
        "sub_task_attachments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "sub_task_id", postgresql.UUID(as_uuid=True), nullable=False
        ),
        sa.Column(
            "uploaded_by", postgresql.UUID(as_uuid=True), nullable=False
        ),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("file_hash", sa.String(64), nullable=True),
        sa.Column("minio_object_key", sa.String(500), nullable=True),
        sa.Column("bucket_name", sa.String(100), nullable=True),
        sa.Column("celery_task_id", sa.String(255), nullable=True),
        sa.Column(
            "upload_status",
            sa.String(20),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("temp_local_path", sa.String(500), nullable=True),
        sa.Column(
            "is_corrupted",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["sub_task_id"], ["sub_tasks.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["uploaded_by"], ["users.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # Drop request_screenshot_links table
    op.drop_index(
        "ix_screenshot_links_linked_by", table_name="request_screenshot_links"
    )
    op.drop_index(
        "ix_screenshot_links_screenshot_id",
        table_name="request_screenshot_links",
    )
    op.drop_index(
        "ix_screenshot_links_request_id", table_name="request_screenshot_links"
    )
    op.drop_table("request_screenshot_links")

    # Drop indexes from service_requests
    op.drop_index("ix_requests_parent_order", table_name="service_requests")
    op.drop_index("ix_requests_completed_at", table_name="service_requests")
    op.drop_index("ix_requests_created_by", table_name="service_requests")
    op.drop_index("ix_requests_is_active", table_name="service_requests")
    op.drop_index("ix_requests_is_deleted", table_name="service_requests")
    op.drop_index("ix_requests_parent_status", table_name="service_requests")
    op.drop_index("ix_requests_assigned_technician", table_name="service_requests")
    op.drop_index("ix_requests_assigned_section", table_name="service_requests")
    op.drop_index("ix_requests_parent_task_id", table_name="service_requests")

    # Drop columns from service_requests
    op.drop_column("service_requests", "updated_by")
    op.drop_column("service_requests", "created_by")
    op.drop_column("service_requests", "is_deleted")
    op.drop_column("service_requests", "is_active")
    op.drop_column("service_requests", "completed_at")
    op.drop_column("service_requests", "actual_hours")
    op.drop_column("service_requests", "estimated_hours")
    op.drop_column("service_requests", "blocked_reason")
    op.drop_column("service_requests", "is_blocked")
    op.drop_column("service_requests", "order")
    op.drop_column("service_requests", "assigned_to_technician_id")
    op.drop_column("service_requests", "assigned_to_section_id")
    op.drop_column("service_requests", "parent_task_id")
