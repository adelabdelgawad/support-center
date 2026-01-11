"""update_ticket_assigned_message_template

Revision ID: 6cdac353fc41
Revises: aa72b6a3af6d
Create Date: 2025-12-13 12:16:32.883327+00:00

"""

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision = "6cdac353fc41"
down_revision = "aa72b6a3af6d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Update ticket_assigned message template to include technician name."""

    op.execute("""
        UPDATE system_messages
        SET
            template_en = 'Your request has been assigned to {technician_name}',
            template_ar = 'تم تعيين طلبك إلى {technician_name}'
        WHERE message_type = 'ticket_assigned'
    """)


def downgrade() -> None:
    """Revert ticket_assigned message template to original."""

    op.execute("""
        UPDATE system_messages
        SET
            template_en = 'Technician assigned',
            template_ar = 'تم تعيين فني'
        WHERE message_type = 'ticket_assigned'
    """)
