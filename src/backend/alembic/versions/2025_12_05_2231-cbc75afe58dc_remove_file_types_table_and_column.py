"""remove_file_types_table_and_column

Revision ID: cbc75afe58dc
Revises: 7c34e98b5a03
Create Date: 2025-12-05 22:31:03.701476+00:00

"""

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision = "cbc75afe58dc"
down_revision = "7c34e98b5a03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop indexes on file_type_id
    op.drop_index("ix_attachments_file_type_id", table_name="attachments")
    op.drop_index("ix_attachments_request_type", table_name="attachments")

    # Drop the file_type_id foreign key constraint
    op.drop_constraint("attachments_file_type_id_fkey", "attachments", type_="foreignkey")

    # Drop the file_type_id column from attachments
    op.drop_column("attachments", "file_type_id")

    # Drop the file_types table
    op.drop_table("file_types")


def downgrade() -> None:
    # Recreate file_types table
    op.create_table(
        "file_types",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("extension", sa.String(length=10), nullable=False),
        sa.Column("created_by", sa.UUID(), nullable=True),
        sa.Column("updated_by", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("extension"),
    )

    # Recreate indexes on file_types
    op.create_index("ix_file_types_extension", "file_types", ["extension"], unique=True)
    op.create_index("ix_file_types_is_active", "file_types", ["is_active"])
    op.create_index("ix_file_types_is_deleted", "file_types", ["is_deleted"])

    # Add file_type_id column back to attachments
    op.add_column("attachments", sa.Column("file_type_id", sa.Integer(), nullable=True))

    # Add foreign key constraint
    op.create_foreign_key("attachments_file_type_id_fkey", "attachments", "file_types", ["file_type_id"], ["id"])

    # Recreate indexes on attachments
    op.create_index("ix_attachments_file_type_id", "attachments", ["file_type_id"])
    op.create_index("ix_attachments_request_type", "attachments", ["request_id", "file_type_id"])
