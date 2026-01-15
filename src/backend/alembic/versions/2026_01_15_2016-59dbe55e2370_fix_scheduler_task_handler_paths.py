"""fix_scheduler_task_handler_paths

Fixes handler paths for scheduled task functions to use wrapper functions
instead of service methods that require 'self' and 'db' dependency injection.

This resolves TypeError when scheduler tries to call service instance methods
directly. Now all async_function handlers point to standalone wrapper functions
in tasks/maintenance_tasks.py that handle DI properly.

Revision ID: 59dbe55e2370
Revises: ef0a6699ff3a
Create Date: 2026-01-15 20:16:59.165163

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '59dbe55e2370'
down_revision = 'ef0a6699ff3a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Update task function handler paths to use wrapper functions."""

    # Update cleanup_expired_tokens (was AuthenticationService.cleanup_all_expired_sessions)
    op.execute(
        sa.text(
            """
            UPDATE task_functions
            SET handler_path = 'tasks.maintenance_tasks.cleanup_expired_sessions_task'
            WHERE name = 'cleanup_expired_tokens'
            AND handler_path = 'services.auth_service.AuthenticationService.cleanup_all_expired_sessions'
            """
        )
    )

    # Update cleanup_stale_desktop_sessions (was DesktopSessionService.cleanup_stale_sessions)
    op.execute(
        sa.text(
            """
            UPDATE task_functions
            SET handler_path = 'tasks.maintenance_tasks.cleanup_stale_desktop_sessions_task'
            WHERE name = 'cleanup_stale_desktop_sessions'
            AND handler_path = 'services.desktop_session_service.DesktopSessionService.cleanup_stale_sessions'
            """
        )
    )

    # Update cleanup_stale_deployment_jobs (was DeploymentJobService.cleanup_stale_jobs)
    op.execute(
        sa.text(
            """
            UPDATE task_functions
            SET handler_path = 'tasks.maintenance_tasks.cleanup_stale_deployment_jobs_task'
            WHERE name = 'cleanup_stale_deployment_jobs'
            AND handler_path = 'services.deployment_job_service.DeploymentJobService.cleanup_stale_jobs'
            """
        )
    )

    # Update cleanup_old_executions (was SchedulerService.cleanup_old_executions)
    op.execute(
        sa.text(
            """
            UPDATE task_functions
            SET handler_path = 'tasks.maintenance_tasks.cleanup_old_job_executions_task'
            WHERE name = 'cleanup_old_executions'
            AND handler_path = 'services.scheduler_service.SchedulerService.cleanup_old_executions'
            """
        )
    )


def downgrade() -> None:
    """Revert task function handler paths to original service methods."""

    # Revert cleanup_expired_tokens
    op.execute(
        sa.text(
            """
            UPDATE task_functions
            SET handler_path = 'services.auth_service.AuthenticationService.cleanup_all_expired_sessions'
            WHERE name = 'cleanup_expired_tokens'
            AND handler_path = 'tasks.maintenance_tasks.cleanup_expired_sessions_task'
            """
        )
    )

    # Revert cleanup_stale_desktop_sessions
    op.execute(
        sa.text(
            """
            UPDATE task_functions
            SET handler_path = 'services.desktop_session_service.DesktopSessionService.cleanup_stale_sessions'
            WHERE name = 'cleanup_stale_desktop_sessions'
            AND handler_path = 'tasks.maintenance_tasks.cleanup_stale_desktop_sessions_task'
            """
        )
    )

    # Revert cleanup_stale_deployment_jobs
    op.execute(
        sa.text(
            """
            UPDATE task_functions
            SET handler_path = 'services.deployment_job_service.DeploymentJobService.cleanup_stale_jobs'
            WHERE name = 'cleanup_stale_deployment_jobs'
            AND handler_path = 'tasks.maintenance_tasks.cleanup_stale_deployment_jobs_task'
            """
        )
    )

    # Revert cleanup_old_executions
    op.execute(
        sa.text(
            """
            UPDATE task_functions
            SET handler_path = 'services.scheduler_service.SchedulerService.cleanup_old_executions'
            WHERE name = 'cleanup_old_executions'
            AND handler_path = 'tasks.maintenance_tasks.cleanup_old_job_executions_task'
            """
        )
    )