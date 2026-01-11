"""
Base task class with common functionality.

Provides error handling, logging, and retry logic for all tasks.
"""

from celery import Task
from celery.utils.log import get_task_logger

logger = get_task_logger(__name__)


class BaseTask(Task):
    """
    Base class for all Celery tasks with enhanced error handling.

    Features:
    - Automatic retry on failure
    - Structured logging
    - Exception tracking
    """

    # Retry settings
    autoretry_for = (Exception,)
    retry_kwargs = {"max_retries": 3}
    retry_backoff = True
    retry_backoff_max = 600  # 10 minutes
    retry_jitter = True

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """
        Called when task fails after all retries.

        Args:
            exc: Exception raised
            task_id: Unique task ID
            args: Task positional arguments
            kwargs: Task keyword arguments
            einfo: Exception info
        """
        logger.error(
            f"Task {self.name}[{task_id}] failed permanently: {exc}\n"
            f"Args: {args}\n"
            f"Kwargs: {kwargs}\n"
            f"Exception info: {einfo}"
        )
        super().on_failure(exc, task_id, args, kwargs, einfo)

    def on_retry(self, exc, task_id, args, kwargs, einfo):
        """
        Called when task is retried.

        Args:
            exc: Exception that triggered retry
            task_id: Unique task ID
            args: Task positional arguments
            kwargs: Task keyword arguments
            einfo: Exception info
        """
        logger.warning(
            f"Task {self.name}[{task_id}] retrying due to: {exc}\n"
            f"Retry {self.request.retries}/{self.max_retries}"
        )
        super().on_retry(exc, task_id, args, kwargs, einfo)

    def on_success(self, retval, task_id, args, kwargs):
        """
        Called when task succeeds.

        Args:
            retval: Return value of task
            task_id: Unique task ID
            args: Task positional arguments
            kwargs: Task keyword arguments
        """
        logger.info(f"Task {self.name}[{task_id}] succeeded")
        super().on_success(retval, task_id, args, kwargs)
