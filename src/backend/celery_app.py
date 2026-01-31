"""
Celery application configuration for background task processing.

This module provides a shared Celery instance configured with Redis broker,
task routing, and monitoring settings for the Service Catalog application.
"""

import logging
from celery import Celery
from celery.signals import task_failure, task_postrun, task_prerun, worker_process_init
from kombu import Exchange, Queue

from core.config import settings

# Create Celery instance
celery_app = Celery(
    "service_catalog",
    broker=settings.celery.broker_url,
    backend=settings.celery.result_backend,
)

# ============================================================================
# CELERY CONFIGURATION
# ============================================================================

celery_app.conf.update(
    # Timezone Settings
    timezone=settings.celery.timezone,
    enable_utc=settings.celery.enable_utc,

    # Task Serialization
    task_serializer=settings.celery.task_serializer,
    accept_content=settings.celery.accept_content,
    result_serializer=settings.celery.result_serializer,

    # Result Backend Settings
    result_expires=3600,  # Results expire after 1 hour
    result_persistent=True,  # Persist results to Redis

    # Task Execution Settings
    task_acks_late=True,  # Acknowledge after task completion
    task_reject_on_worker_lost=True,  # Reject tasks if worker crashes
    task_track_started=settings.celery.task_track_started,
    task_time_limit=settings.celery.task_time_limit,
    task_soft_time_limit=settings.celery.task_soft_time_limit,

    # Worker Settings
    worker_prefetch_multiplier=settings.celery.worker_prefetch_multiplier,
    worker_max_tasks_per_child=settings.celery.worker_max_tasks_per_child,
    worker_disable_rate_limits=False,

    # Broker Settings
    broker_connection_retry_on_startup=True,
    broker_connection_retry=True,
    broker_connection_max_retries=10,

    # Monitoring & Events
    task_send_sent_event=True,
    worker_send_task_events=True,
    task_ignore_result=False,

    # Task Routing
    task_routes={
        "tasks.minio_file_tasks.*": {"queue": "file_queue"},
        "tasks.ad_sync_tasks.*": {"queue": "ad_queue"},
    },

    # Queue Definitions
    task_queues=(
        Queue(
            "file_queue",
            Exchange("file_queue"),
            routing_key="file_queue",
            queue_arguments={"x-max-priority": 5},
        ),
        Queue(
            "ad_queue",
            Exchange("ad_queue"),
            routing_key="ad_queue",
            queue_arguments={"x-max-priority": 5},
        ),
        Queue(
            "celery",  # Default queue
            Exchange("celery"),
            routing_key="celery",
        ),
    ),
)

# ============================================================================
# TASK AUTODISCOVERY
# ============================================================================

# Auto-discover tasks from tasks/ modules
# celery_app.autodiscover_tasks(["tasks"])  # This doesn't work as expected

# Manual import of task modules to register them
# Note: This is done at the end of the file to avoid circular imports during module initialization
# The actual imports happen after all Celery configuration is complete

# ============================================================================
# SIGNAL HANDLERS
# ============================================================================

logger = logging.getLogger(__name__)


@task_prerun.connect
def task_prerun_handler(task_id, task, args, kwargs, **extra):
    """Log when task starts."""
    logger.info(f"Task {task.name}[{task_id}] started")


@task_postrun.connect
def task_postrun_handler(task_id, task, args, kwargs, retval, **extra):
    """Log when task completes."""
    logger.info(f"Task {task.name}[{task_id}] completed successfully")


@task_failure.connect
def task_failure_handler(task_id, exception, args, kwargs, traceback, einfo, **extra):
    """Log when task fails."""
    logger.error(
        f"Task {task_id} failed with exception: {exception}\n"
        f"Traceback: {traceback}"
    )


@worker_process_init.connect
def on_worker_process_init(**kwargs):
    """
    Reset database connections after worker process is forked.

    This is critical for async database operations in Celery workers.
    SQLAlchemy's async engine is not fork-safe, so we dispose of the engine
    in each forked worker to force creation of new connections.
    """
    import asyncio
    from db.database import engine

    logger.info("Worker process initialized, disposing database engine for fork safety")

    # Dispose the engine to force new connections in this forked process
    # This must be done synchronously
    try:
        # Create a new event loop for this worker process
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        # Dispose of the engine asynchronously
        loop.run_until_complete(engine.dispose())
        logger.info("Database engine disposed successfully in worker process")
    except Exception as e:
        logger.error(f"Failed to dispose database engine in worker process: {e}")


# ============================================================================
# MANUAL TASK IMPORTS (to register tasks with Celery)
# ============================================================================
# Import task modules at the end to avoid circular imports during initialization
# This ensures all Celery configuration is complete before tasks are registered
from tasks import minio_file_tasks  # noqa: F401, E402
from tasks import ad_sync_tasks  # noqa: F401, E402
from tasks import whatsapp_tasks  # noqa: F401, E402
from tasks import deployment_tasks  # noqa: F401, E402
from tasks import scheduler_tasks  # noqa: F401, E402
from tasks import remote_access_tasks  # noqa: F401, E402
