"""update_schedules_to_scheduler

Revision ID: c95976f7284a
Revises: 680c1ba0c650
Create Date: 2026-01-15 16:02:37.288815

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c95976f7284a'
down_revision = '680c1ba0c650'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Update Page 45 from "Schedules" to "Scheduler" and update path
    op.execute(
        sa.text(
            """
            UPDATE pages
            SET title = 'Scheduler',
                path = 'management/scheduler'
            WHERE id = 45
            """
        )
    )


def downgrade() -> None:
    # Revert Page 45 back to "Schedules"
    op.execute(
        sa.text(
            """
            UPDATE pages
            SET title = 'Schedules',
                path = 'management/schedules'
            WHERE id = 45
            """
        )
    )
