"""
Scheduler execution tasks.

Queue: celery (default)
Purpose: Execute scheduled jobs dispatched by the scheduler manager
"""

import asyncio
import importlib
import logging
import traceback
from datetime import datetime
from uuid import UUID
from typing import Any, Dict

from celery_app import celery_app
from models.database_models import (
    ScheduledJob,
    ScheduledJobExecution,
    TaskFunction,
)
from services.scheduler_service import scheduler_service
from tasks.base import BaseTask
from tasks.database import get_celery_session

logger = logging.getLogger(__name__)


def run_async(coro):
    """Run async coroutine in sync context."""
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    if loop.is_closed():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


@celery_app.task(
    base=BaseTask,
    name="tasks.scheduler_tasks.execute_scheduled_job",
    queue="celery",
    bind=True,
)
def execute_scheduled_job(
    self,
    job_id: str,
    execution_id: str,
    triggered_by: str = "scheduler",
) -> dict:
    """
    Execute a scheduled job by ID.

    This generic task:
    1. Loads job configuration from database
    2. Updates execution status to "running"
    3. Executes the appropriate handler:
       - celery_task: Apply task and wait for result
       - async_function: Run async function with task_args
    4. Records success/failure result

    Args:
        job_id: Scheduled job ID (UUID string)
        execution_id: Execution record ID (UUID string)
        triggered_by: Trigger source (scheduler/manual/api)

    Returns:
        dict: Execution result with status and details
    """
    logger.info(
        f"[Task {self.request.id}] Executing job {job_id}, "
        f"execution {execution_id}, triggered_by={triggered_by}"
    )

    async def _async_execute() -> dict:
        # Create a single session for the entire task execution
        # to avoid connection pool conflicts
        async with get_celery_session() as db:
            try:
                # Load job with task function
                result = await db.execute(
                    select(ScheduledJob)
                    .join(TaskFunction)
                    .where(ScheduledJob.id == UUID(job_id))
                )
                job = result.scalar_one_or_none()

                if not job:
                    raise ValueError(f"Scheduled job {job_id} not found")

                task_function = job.task_function

                # Update execution to running
                await scheduler_service.record_execution_start(
                    db=db,
                    execution_id=UUID(execution_id),
                    celery_task_id=self.request.id,
                )

                # Execute based on handler type
                started_at = datetime.utcnow()

                if task_function.handler_type == "celery_task":
                    # Execute Celery task
                    result_data = await _execute_celery_task(
                        task_function.handler_path,
                        job.task_args or {},
                    )
                    status = "success"
                    error_message = None

                elif task_function.handler_type == "async_function":
                    # Execute async function with timeout
                    result_data = await _execute_async_function(
                        task_function.handler_path,
                        job.task_args or {},
                        timeout_seconds=600,  # 10 minute default timeout
                    )
                    status = "success"
                    error_message = None

                else:
                    raise ValueError(
                        f"Unknown handler type: {task_function.handler_type}"
                    )

                # Record success
                await scheduler_service.record_execution_complete(
                    db=db,
                    execution_id=UUID(execution_id),
                    status=status,
                    result=result_data,
                    error_message=error_message,
                )

                return {
                    "status": status,
                    "success": True,
                    "job_id": job_id,
                    "execution_id": execution_id,
                    "result": result_data,
                    "triggered_by": triggered_by,
                    "completed_at": datetime.utcnow().isoformat(),
                    "task_id": str(self.request.id),
                }

            except Exception as e:
                logger.error(
                    f"Job execution failed: {job_id}",
                    exc_info=True,
                )

                # Record failure using the same session
                try:
                    await scheduler_service.record_execution_complete(
                        db=db,
                        execution_id=UUID(execution_id),
                        status="failed",
                        error_message=str(e),
                        error_traceback=traceback.format_exc(),
                    )
                except Exception as db_error:
                    logger.error(f"Failed to record execution error: {db_error}")
                    # Re-raise the original exception
                    raise

                return {
                    "status": "failed",
                    "success": False,
                    "job_id": job_id,
                    "execution_id": execution_id,
                    "error": str(e),
                    "triggered_by": triggered_by,
                    "task_id": str(self.request.id),
                }

    # Run the async function synchronously
    return run_async(_async_execute())


async def _execute_celery_task(
    handler_path: str,
    task_args: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Execute a Celery task and wait for result.

    Args:
        handler_path: Full module path to Celery task (e.g., "tasks.ad_sync_tasks.sync_domain_users_task")
        task_args: Arguments to pass to task

    Returns:
        Task result data
    """
    # Import the task module
    module_path, task_name = handler_path.rsplit(".", 1)
    module = importlib.import_module(module_path)
    task = getattr(module, task_name)

    # Apply task with arguments
    result = task.apply_async(kwargs=task_args)

    # Wait for result (with timeout)
    from celery.result import TimeoutError as CeleryTimeout

    try:
        # Use task's timeout or default to 600 seconds (10 minutes)
        task_result = result.get(timeout=600)
        return task_result if isinstance(task_result, dict) else {"result": task_result}
    except CeleryTimeout:
        raise TimeoutError(f"Task {handler_path} timed out after 600 seconds")
    except Exception as e:
        raise RuntimeError(f"Task {handler_path} failed: {str(e)}") from e


async def _execute_async_function(
    handler_path: str,
    task_args: Dict[str, Any],
    timeout_seconds: int = 600,
) -> Dict[str, Any]:
    """
    Execute an async function with proper timeout handling.

    IMPORTANT CONTRACT FOR ASYNC_FUNCTION HANDLERS:
    ================================================
    The scheduler can ONLY call standalone async functions that:
    1. Accept arguments via **kwargs (from task_args only)
    2. Do NOT require instance context (no 'self')
    3. Do NOT require dependency injection (no 'db' session parameter)

    For service layer methods that need 'self' and 'db':
    - Create wrapper functions in tasks/maintenance_tasks.py
    - The wrapper obtains db session via get_celery_session()
    - The wrapper instantiates the service class
    - The wrapper calls the service method with proper DI
    - Point handler_path to the wrapper function

    Example:
        # ❌ WRONG - Service method requiring self and db
        handler_path = "services.auth_service.AuthenticationService.cleanup_all_expired_sessions"

        # ✅ CORRECT - Wrapper function
        handler_path = "tasks.maintenance_tasks.cleanup_expired_sessions_task"

    Args:
        handler_path: Full path to async function
                       Format: "module.path.function_name" (standalone function)
        task_args: Arguments to pass to function as **kwargs
        timeout_seconds: Maximum execution time in seconds (default: 600)

    Returns:
        Function result data (dict preferred)

    Raises:
        ImportError: If module/function cannot be imported
        TypeError: If function signature doesn't match task_args or requires instance context
        asyncio.TimeoutError: If function execution exceeds timeout_seconds
        RuntimeError: If function execution fails
    """
    import asyncio
    import inspect

    logger.debug(f"Resolving handler path: {handler_path}")

    parts = handler_path.split(".")

    # Find the module path by trying to import progressively
    module = None
    module_parts_count = 0

    for i in range(len(parts), 0, -1):
        test_path = ".".join(parts[:i])
        try:
            module = importlib.import_module(test_path)
            module_parts_count = i
            logger.debug(f"Successfully imported module: {test_path}")
            break
        except (ImportError, ModuleNotFoundError) as e:
            logger.debug(f"Failed to import {test_path}: {e}")
            continue

    if module is None:
        raise ImportError(f"Could not find module for handler path: {handler_path}")

    # Navigate to the function through remaining parts
    obj = module
    remaining_parts = parts[module_parts_count:]
    for part in remaining_parts:
        if not hasattr(obj, part):
            raise AttributeError(
                f"Attribute '{part}' not found in {obj.__name__ if hasattr(obj, '__name__') else obj}. "
                f"Full handler path: {handler_path}"
            )
        obj = getattr(obj, part)

    func = obj

    # Validate callable type BEFORE execution
    if not callable(func):
        raise TypeError(f"Handler '{handler_path}' resolved to non-callable: {type(func)}")

    if not asyncio.iscoroutinefunction(func):
        raise TypeError(
            f"Handler '{handler_path}' is not an async function. "
            f"Got: {type(func).__name__}. "
            f"Only standalone async functions are supported."
        )

    # Validate function signature - reject forbidden parameters
    sig = inspect.signature(func)
    params = list(sig.parameters.keys())
    forbidden_params = ['self', 'cls', 'db', 'session', 'request']

    for param in params:
        if param in forbidden_params:
            raise TypeError(
                f"Handler '{handler_path}' has forbidden parameter '{param}'. "
                f"Async function handlers must be standalone wrappers that handle their own DI. "
                f"Create a wrapper function in tasks/maintenance_tasks.py instead."
            )

    # Log execution details
    logger.info(
        f"Executing async function: {handler_path} | "
        f"params={params} | task_args={list(task_args.keys())} | timeout={timeout_seconds}s"
    )

    # Attempt to execute with task_args and timeout
    try:
        result = await asyncio.wait_for(
            func(**task_args),
            timeout=timeout_seconds
        )
        logger.debug(f"Handler {handler_path} completed successfully")
        return result if isinstance(result, dict) else {"result": result}
    except asyncio.TimeoutError:
        logger.error(f"Handler {handler_path} timed out after {timeout_seconds} seconds")
        raise TimeoutError(f"Handler '{handler_path}' timed out after {timeout_seconds} seconds")
    except TypeError as e:
        # Check if this is a method requiring 'self' (common mistake)
        error_msg = str(e)
        if "missing" in error_msg.lower() and ("self" in error_msg or "positional argument" in error_msg):
            raise TypeError(
                f"Handler '{handler_path}' appears to be an instance method requiring 'self'. "
                f"Service methods cannot be called directly by the scheduler. "
                f"Create a wrapper function in tasks/maintenance_tasks.py that:\n"
                f"  1. Obtains db session via get_celery_session()\n"
                f"  2. Instantiates the service class\n"
                f"  3. Calls the service method with proper dependency injection\n"
                f"Original error: {error_msg}"
            ) from e
        else:
            # Re-raise with context
            raise TypeError(
                f"Failed to call '{handler_path}' with task_args {task_args}: {error_msg}"
            ) from e


# Import select for the execute_scheduled_job function
from sqlalchemy import select
