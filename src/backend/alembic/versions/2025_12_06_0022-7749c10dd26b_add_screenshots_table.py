"""add_screenshots_table

Revision ID: 7749c10dd26b
Revises: cbc75afe58dc
Create Date: 2025-12-06 00:22:15.856663+00:00

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID as PostgreSQL_UUID


# revision identifiers, used by Alembic.
revision = "7749c10dd26b"
down_revision = "cbc75afe58dc"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create screenshots table"""
    op.create_table(
        "screenshots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "request_id",
            PostgreSQL_UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "uploaded_by",
            PostgreSQL_UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("file_hash", sa.String(length=64), nullable=True),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column(
            "mime_type",
            sa.String(length=100),
            nullable=False,
            server_default="image/png",
        ),
        sa.Column("minio_object_key", sa.String(length=500), nullable=True),
        sa.Column("minio_thumbnail_key", sa.String(length=500), nullable=True),
        sa.Column(
            "bucket_name",
            sa.String(length=100),
            nullable=True,
            server_default="servicecatalog-screenshots",
        ),
        sa.Column("celery_task_id", sa.String(length=255), nullable=True),
        sa.Column(
            "upload_status",
            sa.String(length=20),
            nullable=False,
            server_default="'pending'",
        ),
        sa.Column("temp_local_path", sa.String(length=500), nullable=True),
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
    )

    # Create indexes for foreign keys
    op.create_index(
        "ix_screenshots_request_id",
        "screenshots",
        ["request_id"],
    )
    op.create_index(
        "ix_screenshots_uploaded_by",
        "screenshots",
        ["uploaded_by"],
    )
    # Index for filename lookup (used in /by-filename/{filename} endpoint)
    op.create_index(
        "ix_screenshots_filename",
        "screenshots",
        ["filename"],
    )


def downgrade() -> None:
    """Drop screenshots table"""
    op.drop_index("ix_screenshots_filename", table_name="screenshots")
    op.drop_index("ix_screenshots_uploaded_by", table_name="screenshots")
    op.drop_index("ix_screenshots_request_id", table_name="screenshots")
    op.drop_table("screenshots")
