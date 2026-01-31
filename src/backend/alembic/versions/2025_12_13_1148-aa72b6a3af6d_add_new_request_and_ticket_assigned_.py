"""add_new_request_and_ticket_assigned_messages

Revision ID: aa72b6a3af6d
Revises: 1a048e0152d2
Create Date: 2025-12-13 11:48:39.553919+00:00

"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "aa72b6a3af6d"
down_revision = "1a048e0152d2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add new_request and ticket_assigned system messages and events."""

    # 1. Insert new_request system message
    op.execute("""
        INSERT INTO system_messages (message_type, template_en, template_ar, is_active)
        VALUES (
            'new_request',
            'New request created',
            'تم إنشاء طلب جديد',
            true
        )
    """)

    # 2. Insert ticket_assigned system message
    op.execute("""
        INSERT INTO system_messages (message_type, template_en, template_ar, is_active)
        VALUES (
            'ticket_assigned',
            'Technician assigned',
            'تم تعيين فني',
            true
        )
    """)

    # 3. Insert new_request system event
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
            'new_request',
            'New Request',
            'طلب جديد',
            'Triggered when a new request is created',
            'يتم تفعيله عندما يتم إنشاء طلب جديد',
            sm.id,
            true,
            'immediate'
        FROM system_messages sm
        WHERE sm.message_type = 'new_request'
    """)

    # 4. Insert ticket_assigned system event
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
            'ticket_assigned',
            'Ticket Assigned',
            'تم تعيين التذكرة',
            'Triggered when a technician is assigned to a request',
            'يتم تفعيله عندما يتم تعيين فني للطلب',
            sm.id,
            true,
            'immediate'
        FROM system_messages sm
        WHERE sm.message_type = 'ticket_assigned'
    """)


def downgrade() -> None:
    """Remove new_request and ticket_assigned system messages and events."""

    # 1. Delete system events first (due to foreign key constraint)
    op.execute("""
        DELETE FROM system_events
        WHERE event_key IN ('new_request', 'ticket_assigned')
    """)

    # 2. Delete system messages
    op.execute("""
        DELETE FROM system_messages
        WHERE message_type IN ('new_request', 'ticket_assigned')
    """)
