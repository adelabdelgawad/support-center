"""add_chat_files_table

Revision ID: add_chat_files_table
Revises: update_ticket_assigned_template_format
Create Date: 2026-01-06 15:00:00.000000+00:00

Creates the chat_files table for storing file attachment metadata
and adds file attachment columns to chat_messages table.

chat_files table supports:
- File uploads with MinIO storage
- Async uploads via Celery
- File integrity verification via SHA256 hash
- File corruption tracking

chat_messages additions:
- file_id FK to chat_files for linking attachments
- file_name, file_size, file_mime_type for quick access without join
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "add_chat_files_table"
down_revision = "update_ticket_assigned_template_format"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create chat_files table
    op.create_table(
        "chat_files",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("request_id", sa.UUID(), nullable=False),
        sa.Column("uploaded_by", sa.UUID(), nullable=False),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("stored_filename", sa.String(length=255), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("mime_type", sa.String(length=100), nullable=False),
        sa.Column("file_hash", sa.String(length=64), nullable=True),
        sa.Column("minio_object_key", sa.String(length=500), nullable=True),
        sa.Column(
            "bucket_name",
            sa.String(length=100),
            nullable=False,
            server_default=sa.text("'servicecatalog-files'"),
        ),
        sa.Column(
            "upload_status",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'pending'"),
        ),
        sa.Column("temp_local_path", sa.String(length=500), nullable=True),
        sa.Column("celery_task_id", sa.String(length=255), nullable=True),
        sa.Column(
            "is_corrupted",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(
            ["request_id"],
            ["service_requests.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["uploaded_by"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("stored_filename"),
    )

    # Create indexes on chat_files
    op.create_index(
        "ix_chat_files_request_id",
        "chat_files",
        ["request_id"],
        unique=False,
    )
    op.create_index(
        "ix_chat_files_uploaded_by",
        "chat_files",
        ["uploaded_by"],
        unique=False,
    )
    op.create_index(
        "ix_chat_files_stored_filename",
        "chat_files",
        ["stored_filename"],
        unique=False,
    )
    op.create_index(
        "ix_chat_files_upload_status",
        "chat_files",
        ["upload_status"],
        unique=False,
    )
    op.create_index(
        "ix_chat_files_created_at",
        "chat_files",
        ["created_at"],
        unique=False,
    )

    # Add file attachment columns to chat_messages
    op.add_column(
        "chat_messages",
        sa.Column("file_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "chat_messages",
        sa.Column("file_name", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "chat_messages",
        sa.Column("file_size", sa.Integer(), nullable=True),
    )
    op.add_column(
        "chat_messages",
        sa.Column("file_mime_type", sa.String(length=100), nullable=True),
    )

    # Add foreign key constraint for file_id
    op.create_foreign_key(
        "fk_chat_messages_file_id",
        "chat_messages",
        "chat_files",
        ["file_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    # Remove foreign key constraint first
    op.drop_constraint(
        "fk_chat_messages_file_id",
        "chat_messages",
        type_="foreignkey",
    )

    # Remove file attachment columns from chat_messages
    op.drop_column("chat_messages", "file_mime_type")
    op.drop_column("chat_messages", "file_size")
    op.drop_column("chat_messages", "file_name")
    op.drop_column("chat_messages", "file_id")

    # Drop indexes on chat_files
    op.drop_index("ix_chat_files_created_at", table_name="chat_files")
    op.drop_index("ix_chat_files_upload_status", table_name="chat_files")
    op.drop_index("ix_chat_files_stored_filename", table_name="chat_files")
    op.drop_index("ix_chat_files_uploaded_by", table_name="chat_files")
    op.drop_index("ix_chat_files_request_id", table_name="chat_files")

    # Drop chat_files table
    op.drop_table("chat_files")
