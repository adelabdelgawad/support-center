"""remove_chat_attachment_approval_table

Revision ID: 1cf4dd885635
Revises: 55e01689ab91
Create Date: 2025-12-05 21:41:04.472512+00:00

"""

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision = "1cf4dd885635"
down_revision = "55e01689ab91"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop chat_attachment_approvals table
    op.drop_table("chat_attachment_approvals")


def downgrade() -> None:
    # Recreate chat_attachment_approvals table if needed (for rollback)
    op.create_table(
        "chat_attachment_approvals",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("request_id", sa.UUID(), nullable=False),
        sa.Column("total_attachments", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("approval_status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("approved_by", sa.UUID(), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["request_id"], ["service_requests.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["approved_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
