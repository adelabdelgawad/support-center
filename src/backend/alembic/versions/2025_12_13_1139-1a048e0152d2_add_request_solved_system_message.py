"""add_request_solved_system_message

Revision ID: 1a048e0152d2
Revises: 255b75131416
Create Date: 2025-12-13 11:39:33.001231+00:00

"""

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision = "1a048e0152d2"
down_revision = "255b75131416"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add request_solved system message and event."""

    # 1. Insert new system message for request_solved
    op.execute("""
        INSERT INTO system_messages (message_type, template_en, template_ar, is_active)
        VALUES (
            'request_solved',
            'Request has been solved',
            'تم حل الطلب',
            true
        )
    """)

    # 2. Insert new system event linked to the message
    op.execute("""
        INSERT INTO system_events (
            event_key,
            event_name_en,
            event_name_ar,
            description_en,
            description_ar,
            system_message_id,
            is_active,
            trigger_timing
        )
        SELECT
            'request_solved',
            'Request Solved',
            'تم حل الطلب',
            'Triggered when request status changes to solved',
            'يتم تفعيله عندما تتغير حالة الطلب إلى محلول',
            sm.id,
            true,
            'immediate'
        FROM system_messages sm
        WHERE sm.message_type = 'request_solved'
    """)


def downgrade() -> None:
    """Remove request_solved system message and event."""

    # 1. Delete system event first (due to foreign key constraint)
    op.execute("""
        DELETE FROM system_events
        WHERE event_key = 'request_solved'
    """)

    # 2. Delete system message
    op.execute("""
        DELETE FROM system_messages
        WHERE message_type = 'request_solved'
    """)
