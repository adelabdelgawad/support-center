"""remove_obsolete_system_messages_types

Remove obsolete system message types that were replaced by the event-driven system:
- status_change (replaced by status_changed event)
- assignment_change (replaced by ticket_assigned event)
- resolution_added (no longer used)

These message types were part of the old notification system and are no longer
referenced in the codebase. All notifications now use the system_events table.

Revision ID: 56000e485d2c
Revises: 6cdac353fc41
Create Date: 2025-12-13 12:17:45.084011+00:00

"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "56000e485d2c"
down_revision = "6cdac353fc41"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Remove obsolete system message types."""

    # Delete the three obsolete system messages
    # These are not referenced by any system_events, so safe to delete
    op.execute("""
        DELETE FROM system_messages
        WHERE message_type IN (
            'status_change',
            'assignment_change',
            'resolution_added'
        )
    """)


def downgrade() -> None:
    """Restore obsolete system message types (for rollback purposes only)."""

    # Re-insert the old system messages if needed for rollback
    op.execute("""
        INSERT INTO system_messages (message_type, template_en, template_ar, is_active)
        VALUES
            ('status_change',
             'Request status changed from ''{old_status}'' to ''{new_status}''',
             'تم تغيير حالة الطلب من ''{old_status}'' إلى ''{new_status}''',
             true),
            ('assignment_change',
             'Request assigned to {technician_name}',
             'تم تعيين الطلب إلى {technician_name}',
             true),
            ('resolution_added',
             'Resolution added',
             'تمت إضافة الحل',
             true)
        ON CONFLICT (message_type) DO NOTHING
    """)
