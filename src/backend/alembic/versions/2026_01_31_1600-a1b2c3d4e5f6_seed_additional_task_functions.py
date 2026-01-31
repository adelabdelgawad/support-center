"""seed_additional_task_functions

Revision ID: a1b2c3d4e5f6
Revises: 9700ff164cc0
Create Date: 2026-01-31 16:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '9700ff164cc0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Insert 4 missing task functions
    op.execute(
        sa.text(
            """
            INSERT INTO task_functions (
                name, display_name, description, handler_path, handler_type,
                queue, default_timeout_seconds, is_active, is_system
            )
            VALUES
                (
                    'timeout_stale_job_executions',
                    'Timeout Stale Job Executions',
                    'Mark long-running job executions as timed out',
                    'tasks.maintenance_tasks.timeout_stale_job_executions_task',
                    'async_function',
                    NULL,
                    60,
                    true,
                    true
                ),
                (
                    'cleanup_orphaned_remote_sessions',
                    'Cleanup Orphaned Remote Sessions',
                    'Clean up remote access sessions with no heartbeat',
                    'tasks.remote_access_tasks.cleanup_orphaned_remote_sessions',
                    'celery_task',
                    'celery',
                    60,
                    true,
                    true
                ),
                (
                    'cleanup_expired_files',
                    'Cleanup Expired Files',
                    'Remove expired temporary files from MinIO storage',
                    'tasks.minio_file_tasks.cleanup_expired_files',
                    'celery_task',
                    'celery',
                    120,
                    true,
                    true
                ),
                (
                    'retry_pending_uploads',
                    'Retry Pending Uploads',
                    'Retry file uploads that are stuck in pending state',
                    'tasks.minio_file_tasks.retry_pending_uploads',
                    'celery_task',
                    'celery',
                    120,
                    true,
                    true
                )
            ON CONFLICT (name) DO NOTHING
            """
        )
    )

    # Insert default scheduled jobs for the new task functions
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
                    '550e8400-e29b-41d4-a716-446655440005'::uuid,
                    'Timeout Stale Executions (10m)',
                    'Mark long-running job executions as timed out every 10 minutes',
                    (SELECT id FROM task_functions WHERE name = 'timeout_stale_job_executions'),
                    1,
                    '{"hours": 0, "minutes": 10, "seconds": 0}'::jsonb,
                    NULL,
                    1,
                    60,
                    3,
                    60,
                    true,
                    false
                ),
                (
                    '550e8400-e29b-41d4-a716-446655440006'::uuid,
                    'Cleanup Orphaned Remote Sessions (1m)',
                    'Clean up remote access sessions with no heartbeat every minute',
                    (SELECT id FROM task_functions WHERE name = 'cleanup_orphaned_remote_sessions'),
                    1,
                    '{"hours": 0, "minutes": 1, "seconds": 0}'::jsonb,
                    NULL,
                    1,
                    60,
                    3,
                    60,
                    true,
                    false
                ),
                (
                    '550e8400-e29b-41d4-a716-446655440007'::uuid,
                    'Cleanup Expired Files (1h)',
                    'Remove expired temporary files from MinIO storage every hour',
                    (SELECT id FROM task_functions WHERE name = 'cleanup_expired_files'),
                    1,
                    '{"hours": 1, "minutes": 0, "seconds": 0}'::jsonb,
                    NULL,
                    1,
                    120,
                    3,
                    60,
                    true,
                    false
                ),
                (
                    '550e8400-e29b-41d4-a716-446655440008'::uuid,
                    'Retry Pending Uploads (15m)',
                    'Retry file uploads stuck in pending state every 15 minutes',
                    (SELECT id FROM task_functions WHERE name = 'retry_pending_uploads'),
                    1,
                    '{"hours": 0, "minutes": 15, "seconds": 0}'::jsonb,
                    NULL,
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
    op.execute(
        sa.text(
            """
            DELETE FROM scheduled_jobs WHERE id IN (
                '550e8400-e29b-41d4-a716-446655440005'::uuid,
                '550e8400-e29b-41d4-a716-446655440006'::uuid,
                '550e8400-e29b-41d4-a716-446655440007'::uuid,
                '550e8400-e29b-41d4-a716-446655440008'::uuid
            )
            """
        )
    )

    op.execute(
        sa.text(
            """
            DELETE FROM task_functions WHERE name IN (
                'timeout_stale_job_executions',
                'cleanup_orphaned_remote_sessions',
                'cleanup_expired_files',
                'retry_pending_uploads'
            )
            """
        )
    )
