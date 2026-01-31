"""add_timeout_stale_executions_task

Add the timeout_stale_executions task function and scheduled job
to check for job executions that have exceeded their timeout.

Revision ID: a1b2c3d4e5f7
Revises: a1b2c3d4e5f6
Create Date: 2026-01-31 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from datetime import datetime
import uuid


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Get current timestamp for created_at/updated_at
    now = datetime.utcnow().isoformat()
    # Generate UUID for the scheduled job
    job_id = str(uuid.uuid4())

    # Get connection for queries
    connection = op.get_bind()

    # Check if task function already exists
    existing_task = connection.execute(
        sa.text("SELECT id FROM task_functions WHERE name = 'timeout_stale_executions' LIMIT 1")
    ).scalar()

    if not existing_task:
        # Insert the timeout_stale_executions task function
        op.execute(sa.text(f"""
            INSERT INTO task_functions (
                name, display_name, description, handler_path, handler_type,
                queue, default_timeout_seconds, is_active, is_system,
                created_at, updated_at
            )
            VALUES (
                'timeout_stale_executions',
                'Timeout Stale Job Executions',
                'Mark stuck job executions as timed out (uses job-level timeout_seconds, default 5 minutes)',
                'tasks.maintenance_tasks.timeout_stale_job_executions_task',
                'async_function',
                NULL,
                300,
                true,
                true,
                '{now}',
                '{now}'
            )
        """))

    # Get the interval job type and timeout task function IDs
    interval_type_result = connection.execute(
        sa.text("SELECT id FROM scheduler_job_types WHERE name = 'interval' LIMIT 1")
    )
    interval_type_id = interval_type_result.scalar()

    # Get the timeout task function ID
    timeout_task_result = connection.execute(
        sa.text("SELECT id FROM task_functions WHERE name = 'timeout_stale_executions' LIMIT 1")
    )
    timeout_task_id = timeout_task_result.scalar()

    # Check if scheduled job already exists
    existing_job = connection.execute(
        sa.text("SELECT id FROM scheduled_jobs WHERE name = 'timeout_stale_executions_check' LIMIT 1")
    ).scalar()

    # Create scheduled job for timeout check (every 1 minute)
    if interval_type_id and timeout_task_id and not existing_job:
        op.execute(sa.text(f"""
            INSERT INTO scheduled_jobs (
                id, name, description, task_function_id, job_type_id,
                schedule_config, task_args, max_instances, timeout_seconds,
                retry_count, retry_delay_seconds, is_enabled, is_paused,
                next_run_time, last_run_time, last_status,
                created_at, updated_at
            )
            VALUES (
                '{job_id}',
                'timeout_stale_executions_check',
                'Check every 1 minute for job executions that have exceeded their timeout (default 5 minutes)',
                '{timeout_task_id}',
                '{interval_type_id}',
                '{{"hours": 0, "minutes": 1, "seconds": 0}}',
                NULL,
                1,
                300,
                1,
                30,
                true,
                false,
                NULL,
                NULL,
                NULL,
                '{now}',
                '{now}'
            )
        """))


def downgrade() -> None:
    # Delete the scheduled job
    op.execute(sa.text("""
        DELETE FROM scheduled_jobs WHERE name = 'timeout_stale_executions_check'
    """))

    # Delete the task function
    op.execute(sa.text("""
        DELETE FROM task_functions WHERE name = 'timeout_stale_executions'
    """))
