"""reduce_desktop_session_cleanup_timeout_to_20_minutes

Revision ID: 2d68cad934c2
Revises: 2c583e0c38e6
Create Date: 2026-02-14 15:27:24.723630

Task 1.1: Reduce DB cleanup timeout to 20 minutes

Updates the "Desktop Session Cleanup (Every Minute)" scheduled job
to use a 20-minute timeout instead of the previous 1440 minutes (24 hours).
"""
from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision = '2d68cad934c2'
down_revision = '2c583e0c38e6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """
    Update the scheduled job's task_args to use 20-minute timeout.

    Changes timeout_minutes from 1440 to 20 in the scheduled_jobs table.
    """
    op.execute(
        "UPDATE scheduled_jobs SET task_args = '{\"timeout_minutes\": 20}'::jsonb "
        "WHERE name = 'Desktop Session Cleanup (Every Minute)'"
    )


def downgrade() -> None:
    """
    Revert the scheduled job's task_args back to 1440-minute timeout.

    Changes timeout_minutes from 20 back to 1440 in the scheduled_jobs table.
    """
    op.execute(
        "UPDATE scheduled_jobs SET task_args = '{\"timeout_minutes\": 1440}'::jsonb "
        "WHERE name = 'Desktop Session Cleanup (Every Minute)'"
    )