"""seed_scheduler_data

Revision ID: ef0a6699ff3a
Revises: c95976f7284a
Create Date: 2026-01-15 16:46:39.188169

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'ef0a6699ff3a'
down_revision = 'c95976f7284a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Insert job types
    op.execute(
        sa.text(
            """
            INSERT INTO scheduler_job_types (id, name, display_name, description, is_active)
            VALUES
                (1, 'interval', 'Interval', 'Runs at regular time intervals (every N seconds/minutes/hours)', true),
                (2, 'cron', 'Cron', 'Runs on a schedule using cron-like expressions', true)
            ON CONFLICT (name) DO NOTHING
            """
        )
    )

    # Insert task functions
    op.execute(
        sa.text(
            """
            INSERT INTO task_functions (
                name, display_name, description, handler_path, handler_type,
                queue, default_timeout_seconds, is_active, is_system
            )
            VALUES
                (
                    'sync_domain_users',
                    'Sync Domain Users',
                    'Synchronize domain users from Active Directory',
                    'tasks.ad_sync_tasks.sync_domain_users_task',
                    'celery_task',
                    'ad_queue',
                    300,
                    true,
                    true
                ),
                (
                    'cleanup_expired_tokens',
                    'Cleanup Expired Tokens',
                    'Clean up expired authentication tokens and sessions',
                    'tasks.maintenance_tasks.cleanup_expired_sessions_task',
                    'async_function',
                    NULL,
                    60,
                    true,
                    true
                ),
                (
                    'cleanup_stale_desktop_sessions',
                    'Cleanup Stale Desktop Sessions',
                    'Mark stale desktop sessions as inactive',
                    'tasks.maintenance_tasks.cleanup_stale_desktop_sessions_task',
                    'async_function',
                    NULL,
                    60,
                    true,
                    true
                ),
                (
                    'cleanup_stale_deployment_jobs',
                    'Cleanup Stale Deployment Jobs',
                    'Clean up stale deployment jobs',
                    'tasks.maintenance_tasks.cleanup_stale_deployment_jobs_task',
                    'async_function',
                    NULL,
                    60,
                    true,
                    true
                )
            ON CONFLICT (name) DO NOTHING
            """
        )
    )

    # Insert default scheduled jobs
    # Note: We use direct SQL with parameterized values to avoid SQL injection
    # and properly escape JSON
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
                    '550e8400-e29b-41d4-a716-446655440001'::uuid,
                    'Domain User Sync (Hourly)',
                    'Synchronize domain users from Active Directory every hour',
                    (SELECT id FROM task_functions WHERE name = 'sync_domain_users'),
                    1,
                    '{"hours": 1, "minutes": 0, "seconds": 0}'::jsonb,
                    NULL,
                    1,
                    300,
                    3,
                    60,
                    true,
                    false
                ),
                (
                    '550e8400-e29b-41d4-a716-446655440002'::uuid,
                    'Token Cleanup (Daily)',
                    'Clean up expired authentication tokens and sessions daily',
                    (SELECT id FROM task_functions WHERE name = 'cleanup_expired_tokens'),
                    1,
                    '{"hours": 24, "minutes": 0, "seconds": 0}'::jsonb,
                    '{"retention_days": 7}'::jsonb,
                    1,
                    60,
                    3,
                    60,
                    true,
                    false
                ),
                (
                    '550e8400-e29b-41d4-a716-446655440003'::uuid,
                    'Desktop Session Cleanup (Every Minute)',
                    'Mark stale desktop sessions as inactive',
                    (SELECT id FROM task_functions WHERE name = 'cleanup_stale_desktop_sessions'),
                    1,
                    '{"hours": 0, "minutes": 1, "seconds": 0}'::jsonb,
                    '{"timeout_minutes": 2}'::jsonb,
                    1,
                    60,
                    3,
                    60,
                    true,
                    false
                ),
                (
                    '550e8400-e29b-41d4-a716-446655440004'::uuid,
                    'Deployment Job Cleanup (30s)',
                    'Clean up stale deployment jobs',
                    (SELECT id FROM task_functions WHERE name = 'cleanup_stale_deployment_jobs'),
                    1,
                    '{"hours": 0, "minutes": 0, "seconds": 30}'::jsonb,
                    NULL,
                    1,
                    60,
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
    # Delete scheduled jobs in reverse order
    op.execute(
        sa.text(
            """
            DELETE FROM scheduled_jobs WHERE id IN (
                '550e8400-e29b-41d4-a716-446655440004'::uuid,
                '550e8400-e29b-41d4-a716-446655440003'::uuid,
                '550e8400-e29b-41d4-a716-446655440002'::uuid,
                '550e8400-e29b-41d4-a716-446655440001'::uuid
            )
            """
        )
    )

    # Delete task functions
    op.execute(
        sa.text(
            """
            DELETE FROM task_functions WHERE name IN (
                'sync_domain_users',
                'cleanup_expired_tokens',
                'cleanup_stale_desktop_sessions',
                'cleanup_stale_deployment_jobs'
            )
            """
        )
    )

    # Delete job types
    op.execute(
        sa.text(
            """
            DELETE FROM scheduler_job_types WHERE id IN (1, 2)
            """
        )
    )
