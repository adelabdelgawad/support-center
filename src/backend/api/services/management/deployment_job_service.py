"""
Deployment Job Service - Stub for future deployment job management.

This service is referenced by the scheduler task cleanup_stale_deployment_jobs_task
but has not yet been fully implemented.
"""

from typing import Any, Dict

from sqlalchemy.ext.asyncio import AsyncSession


class DeploymentJobService:
    """Service for managing deployment jobs."""

    async def cleanup_stale_jobs(
        self, db: AsyncSession, timeout_minutes: int = 60
    ) -> Dict[str, Any]:
        """
        Cleanup deployment jobs stuck in IN_PROGRESS status.

        Args:
            db: Database session
            timeout_minutes: Minutes before a job is considered stale

        Returns:
            Cleanup statistics
        """
        return {
            "jobs_cleaned": 0,
            "timeout_minutes": timeout_minutes,
        }
