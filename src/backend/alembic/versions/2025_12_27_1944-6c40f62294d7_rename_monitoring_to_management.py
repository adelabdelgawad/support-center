"""rename_monitoring_to_management

Revision ID: 6c40f62294d7
Revises: c68d306045ff
Create Date: 2025-12-27 19:44:35.998608+00:00

"""

from alembic import op


# revision identifiers, used by Alembic.
revision = "6c40f62294d7"
down_revision = "c68d306045ff"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Update parent page (id=4): Monitor -> Management
    op.execute(
        """
        UPDATE pages
        SET title = 'Management',
            description = 'System management and active sessions',
            icon = 'settings_applications'
        WHERE id = 4
        """
    )

    # Update child page path (id=41): monitoring/active-sessions -> management/active-sessions
    op.execute(
        """
        UPDATE pages
        SET path = 'management/active-sessions'
        WHERE id = 41
        """
    )


def downgrade() -> None:
    # Revert parent page (id=4): Management -> Monitor
    op.execute(
        """
        UPDATE pages
        SET title = 'Monitor',
            description = 'System monitoring and active sessions',
            icon = 'monitor_heart'
        WHERE id = 4
        """
    )

    # Revert child page path (id=41): management/active-sessions -> monitoring/active-sessions
    op.execute(
        """
        UPDATE pages
        SET path = 'monitoring/active-sessions'
        WHERE id = 41
        """
    )
