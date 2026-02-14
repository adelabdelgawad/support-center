# Task Pattern Reference

Celery task definition patterns with automatic retries and async support.

## Basic Task Structure

```python
# tasks/mymodule.py
import asyncio
import logging
from celery import shared_task
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

def _run_async(coro):
    """
    Run async code in Celery worker.
    Handles both existing event loops (gevent) and standalone execution.
    """
    try:
        loop = asyncio.get_running_loop()
        # Event loop exists - run in thread
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            return executor.submit(asyncio.run, coro).result()
    except RuntimeError:
        # No event loop - create one
        return asyncio.run(coro)

@shared_task(
    bind=True,                    # Access task instance as self
    max_retries=3,                # Maximum retry attempts
    default_retry_delay=60,       # Seconds between retries
    autoretry_for=(Exception,),   # Auto-retry on any exception
    retry_backoff=True,           # Exponential backoff
    retry_backoff_max=300,        # Max backoff (5 min)
    retry_jitter=True,            # Add randomness to prevent thundering herd
    soft_time_limit=120,          # Soft limit - raises SoftTimeLimitExceeded
    time_limit=180,               # Hard limit - kills worker
)
def my_task(
    self,
    execution_id: str = None,
    param1: str = None,
    param2: int = 10,
) -> dict:
    """
    Example Celery task with best practices.
    
    Args:
        self: Task instance (from bind=True)
        execution_id: Scheduler execution ID for status updates
        param1: Task parameter
        param2: Another parameter
    
    Returns:
        dict with task results
    """
    
    async def _execute():
        from db.database import DatabaseSessionLocal
        from api.repositories.scheduler_repository import SchedulerRepository
        
        scheduler_repo = SchedulerRepository()
        started_at = datetime.now(timezone.utc)
        success = False
        error_message = None
        result_dict = None
        
        async with DatabaseSessionLocal() as session:
            try:
                # ========================================
                # YOUR TASK LOGIC HERE
                # ========================================
                logger.info(f"Starting task with param1={param1}")
                
                # Do the actual work
                result = await do_something(session, param1, param2)
                
                logger.info(f"Task completed successfully: {result}")
                success = True
                result_dict = {"status": "success", "result": result}
                
            except Exception as e:
                logger.error(f"Task failed: {e}", exc_info=True)
                error_message = str(e)
                
                # Rollback on error
                await session.rollback()
                raise  # Re-raise for Celery retry
                
            finally:
                # Update execution status
                if execution_id:
                    completed_at = datetime.now(timezone.utc)
                    duration_ms = int((completed_at - started_at).total_seconds() * 1000)
                    
                    status_code = "success" if success else "failed"
                    status_obj = await scheduler_repo.get_execution_status_by_code(
                        session, status_code
                    )
                    
                    if status_obj:
                        await scheduler_repo.update_execution(
                            session,
                            execution_id,
                            {
                                "completed_at": completed_at,
                                "duration_ms": duration_ms,
                                "status_id": status_obj.id,
                                "result_summary": str(result_dict) if success else None,
                                "error_message": error_message,
                            },
                        )
                        await session.commit()
        
        return result_dict
    
    logger.info(f"Starting Celery task (execution_id: {execution_id})")
    return _run_async(_execute())
```

## Task Decorator Options

```python
@shared_task(
    # Task binding
    bind=True,                    # Access self for retries, request info
    
    # Retry configuration
    max_retries=3,                # Max retry count
    default_retry_delay=60,       # Base delay between retries (seconds)
    autoretry_for=(Exception,),   # Exception types to auto-retry
    retry_backoff=True,           # Enable exponential backoff
    retry_backoff_max=300,        # Maximum backoff time
    retry_jitter=True,            # Add randomness to backoff
    
    # Time limits
    soft_time_limit=120,          # Soft limit (raises exception)
    time_limit=180,               # Hard limit (kills worker)
    
    # Queue routing
    queue='default',              # Queue name
    
    # Rate limiting
    rate_limit='10/m',            # Max 10 per minute
    
    # Acknowledgment
    acks_late=True,               # Ack after completion (reliable)
    reject_on_worker_lost=True,   # Requeue if worker dies
    
    # Tracking
    track_started=True,           # Track when task starts
    
    # Expiration
    expires=3600,                 # Task expires after 1 hour
)
def my_task(self, ...):
    pass
```

## Manual Retry

```python
@shared_task(bind=True, max_retries=3)
def task_with_manual_retry(self, data):
    try:
        result = process(data)
        return result
    except TemporaryError as e:
        # Retry with custom delay
        raise self.retry(exc=e, countdown=30)
    except PermanentError as e:
        # Don't retry
        logger.error(f"Permanent error: {e}")
        raise
```

## Task with Progress Updates

```python
@shared_task(bind=True)
def long_running_task(self, items):
    total = len(items)
    
    for i, item in enumerate(items):
        process(item)
        
        # Update progress
        self.update_state(
            state='PROGRESS',
            meta={'current': i + 1, 'total': total}
        )
    
    return {'status': 'complete', 'processed': total}
```

## Queue-Specific Tasks

```python
# High priority queue
@shared_task(queue='high_priority')
def urgent_task(data):
    pass

# File processing queue
@shared_task(queue='file_queue')
def process_file(file_id):
    pass

# Long-running queue
@shared_task(queue='long_running', soft_time_limit=3600)
def batch_job(batch_id):
    pass
```

## Chained Tasks

```python
from celery import chain, group, chord

# Sequential execution
chain(
    task1.s(arg1),
    task2.s(),  # Receives result from task1
    task3.s(),
)()

# Parallel execution
group(
    task1.s(item1),
    task1.s(item2),
    task1.s(item3),
)()

# Parallel then aggregate
chord(
    group(task1.s(i) for i in items),
    aggregate_results.s()
)()
```

## Error Handling Patterns

```python
@shared_task(bind=True, max_retries=3)
def robust_task(self, data):
    try:
        # Validate input
        if not data:
            raise ValueError("Data is required")
        
        # Process
        result = process(data)
        return {"status": "success", "result": result}
        
    except (ConnectionError, TimeoutError) as e:
        # Temporary errors - retry
        logger.warning(f"Temporary error, retrying: {e}")
        raise self.retry(exc=e)
        
    except ValueError as e:
        # Validation errors - don't retry
        logger.error(f"Validation error: {e}")
        return {"status": "error", "message": str(e)}
        
    except Exception as e:
        # Unexpected errors
        logger.exception(f"Unexpected error: {e}")
        if self.request.retries < self.max_retries:
            raise self.retry(exc=e)
        return {"status": "error", "message": "Max retries exceeded"}
```

## Testing Tasks

```python
# tests/test_tasks.py
import pytest
from tasks.mymodule import my_task

def test_task_sync():
    """Test task synchronously."""
    result = my_task.apply(args=[None, "test", 5]).get()
    assert result["status"] == "success"

@pytest.mark.asyncio
async def test_task_logic():
    """Test task logic directly."""
    from tasks.mymodule import _execute_logic
    result = await _execute_logic("test", 5)
    assert result is not None

def test_task_retry(mocker):
    """Test retry behavior."""
    mocker.patch('tasks.mymodule.process', side_effect=ConnectionError)
    with pytest.raises(ConnectionError):
        my_task.apply(args=[None, "test"]).get()
```

## Key Patterns

1. **Always use bind=True** - Access self for retries
2. **Set time limits** - Prevent hung tasks
3. **Use autoretry_for** - Automatic retry on exceptions
4. **Enable backoff** - Prevent thundering herd
5. **Update execution status** - Track in database
6. **Handle async properly** - Use _run_async helper
7. **Clean up resources** - Dispose engines in finally
