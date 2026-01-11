"""update_ticket_assigned_template_format

Revision ID: update_ticket_assigned_template_format
Revises: 5acf4bd0aa7c
Create Date: 2026-01-06 10:00:00.000000+00:00

Updates the ticket_assigned system message template to use a new format:
- EN: "{technician_name} has been assigned to your request"
- AR: "تم تعيين {technician_name} لحل مشكلتكم"

This is a safe, idempotent migration that preserves historical data.
Existing messages already sent are stored with resolved content, not templates.
"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "update_ticket_assigned_template_format"
down_revision = "5acf4bd0aa7c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Update ticket_assigned message template to new format with technician name."""
    op.execute("""
        UPDATE system_messages
        SET
            template_en = '{technician_name} has been assigned to your request',
            template_ar = 'تم تعيين {technician_name} لحل مشكلتكم'
        WHERE message_type = 'ticket_assigned'
    """)


def downgrade() -> None:
    """Revert ticket_assigned message template to previous format."""
    op.execute("""
        UPDATE system_messages
        SET
            template_en = 'Your request has been assigned to {technician_name}',
            template_ar = 'تم تعيين طلبك إلى {technician_name}'
        WHERE message_type = 'ticket_assigned'
    """)
