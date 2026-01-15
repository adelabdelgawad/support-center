"""add_missing_cleanup_old_executions_task

Add the missing cleanup_old_executions task function and scheduled job.
This task was referenced in the fix_scheduler_task_handler_paths migration
but was never seeded in the original seed_scheduler_data migration.

Revision ID: ad32fa032125
Revises: 59dbe55e2370
Create Date: 2026-01-15 20:33:20.745976

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'ad32fa032125'
down_revision = '59dbe55e2370'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Insert the missing task function for cleanup_old_executions
    op.execute(
        sa.text(
            """
            INSERT INTO task_functions (
                name, display_name, description, handler_path, handler_type,
                queue, default_timeout_seconds, is_active, is_system
            )
            VALUES (
                'cleanup_old_executions',
                'Cleanup Old Executions',
                'Clean up old scheduler job execution records to prevent database growth',
                'tasks.maintenance_tasks.cleanup_old_job_executions_task',
                'async_function',
                NULL,
                120,
                true,
                true
            )
            ON CONFLICT (name) DO UPDATE SET
                handler_path = EXCLUDED.handler_path,
                display_name = EXCLUDED.display_name,
                description = EXCLUDED.description
            """
        )
    )

    # Insert the scheduled job for cleanup_old_executions (weekly)
    op.execute(
        sa.text(
            """
            INSERT INTO scheduled_jobs (
                id, name, description, task_function_id, job_type_id,
                schedule_config, task_args, max_instances, timeout_seconds,
                retry_count, retry_delay_seconds, is_enabled, is_paused
            )
            VALUES (
                '550e8400-e29b-41d4-a716-446655440005'::uuid,
                'Execution History Cleanup (Weekly)',
                'Clean up old scheduler job execution records weekly (retain 90 days)',
                (SELECT id FROM task_functions WHERE name = 'cleanup_old_executions'),
                1,
                '{"hours": 168, "minutes": 0, "seconds": 0}'::jsonb,
                '{"retention_days": 90}'::jsonb,
                1,
                120,
                3,
                60,
                true,
                false
            )
            ON CONFLICT (id) DO NOTHING
            """
        )
    )


def downgrade() -> None:
    # Delete the scheduled job
    op.execute(
        sa.text(
            """
            DELETE FROM scheduled_jobs
            WHERE id = '550e8400-e29b-41d4-a716-446655440005'::uuid
            """
        )
    )

    # Delete the task function
    op.execute(
        sa.text(
            """
            DELETE FROM task_functions
            WHERE name = 'cleanup_old_executions'
            """
        )
    )
