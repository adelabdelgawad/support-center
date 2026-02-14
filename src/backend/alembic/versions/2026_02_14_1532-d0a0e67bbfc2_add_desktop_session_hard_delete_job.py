"""add_desktop_session_hard_delete_job

Revision ID: d0a0e67bbfc2
Revises: 3c7dc8b049a4
Create Date: 2026-02-14 15:32:47.176650

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd0a0e67bbfc2'
down_revision = '3c7dc8b049a4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Insert task function for deleting old desktop sessions
    op.execute(
        sa.text(
            """
            INSERT INTO task_functions (
                name, display_name, description, handler_path, handler_type,
                queue, default_timeout_seconds, is_active, is_system
            )
            VALUES
                (
                    'delete_old_desktop_sessions',
                    'Delete Old Desktop Sessions',
                    'Permanently delete desktop sessions older than 90 days (hard delete)',
                    'tasks.maintenance_tasks.delete_old_desktop_sessions_task',
                    'async_function',
                    NULL,
                    120,
                    true,
                    true
                )
            ON CONFLICT (name) DO NOTHING
            """
        )
    )

    # Insert scheduled job for daily 3AM execution
    op.execute(
        sa.text(
            """
            INSERT INTO scheduled_jobs (
                id, name, description, task_function_id, job_type_id,
                schedule_config, task_args, max_instances, timeout_seconds,
                retry_count, retry_delay_seconds, is_enabled, is_paused
            )
            VALUES
                (
                    '550e8400-e29b-41d4-a716-446655440109'::uuid,
                    'Delete Old Desktop Sessions (Daily 3AM)',
                    'Permanently delete desktop sessions older than 90 days daily at 3AM',
                    (SELECT id FROM task_functions WHERE name = 'delete_old_desktop_sessions'),
                    1,
                    '{"hours": 24, "minutes": 0, "seconds": 0}'::jsonb,
                    '{"retention_days": 90}'::jsonb,
                    1,
                    120,
                    3,
                    60,
                    true,
                    false
                )
            ON CONFLICT DO NOTHING
            """
        )
    )


def downgrade() -> None:
    # Delete scheduled job
    op.execute(
        sa.text(
            """
            DELETE FROM scheduled_jobs WHERE id = '550e8400-e29b-41d4-a716-446655440109'::uuid
            """
        )
    )

    # Delete task function
    op.execute(
        sa.text(
            """
            DELETE FROM task_functions WHERE name = 'delete_old_desktop_sessions'
            """
        )
    )