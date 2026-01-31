# Celery Task Definition Reference

Patterns for defining Celery tasks with async support and proper error handling.

## Basic Task Pattern

```python
from celery import shared_task

@shared_task
def simple_task(arg1, arg2):
    """Simple synchronous task."""
    return arg1 + arg2
```

## Production Task Pattern

```python
import asyncio
import logging
from celery import shared_task
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

def _run_async(coro):
    """
    Run async coroutine in Celery worker.
    
    Handles both:
    - Existing event loop (gevent/eventlet)
    - No event loop (prefork)
    """
    try:
        # Check if event loop is running (gevent/eventlet)
        loop = asyncio.get_running_loop()
        # Run in separate thread to avoid blocking
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(asyncio.run, coro)
            return future.result()
    except RuntimeError:
        # No running loop - create one
        try:
            loop = asyncio.get_event_loop()
            if loop.is_closed():
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        
        return loop.run_until_complete(coro)


@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
    retry_jitter=True,
    soft_time_limit=120,
    time_limit=180,
)
def my_async_task(
    self,
    execution_id: str = None,
    param1: str = None,
    param2: int = 10,
) -> dict:
    """
    Production-ready async task.
    
    Args:
        self: Task instance (from bind=True)
        execution_id: Scheduler execution ID for status updates
        param1: Your parameter
        param2: Another parameter
    
    Returns:
        dict with task results
    """
    
    async def _execute():
        from db.database import DatabaseSessionLocal, database_engine
        
        started_at = datetime.now(timezone.utc)
        success = False
        error_message = None
        result = None
        
        try:
            async with DatabaseSessionLocal() as session:
                try:
                    # ==========================================
                    # YOUR ASYNC TASK LOGIC HERE
                    # ==========================================
                    logger.info(f"Processing with param1={param1}, param2={param2}")
                    
                    # Example: Call async service
                    # result = await my_service.process(session, param1, param2)
                    
                    await session.commit()
                    success = True
                    result = {"status": "success", "processed": True}
                    
                except Exception as e:
                    logger.error(f"Task failed: {e}", exc_info=True)
                    error_message = str(e)
                    await session.rollback()
                    raise
                    
                finally:
                    # Update scheduler execution status
                    if execution_id:
                        await _update_execution_status(
                            session, execution_id, success, 
                            started_at, error_message, result
                        )
                        
        finally:
            # IMPORTANT: Dispose database engine before event loop closes
            try:
                await database_engine.dispose()
            except Exception as e:
                logger.warning(f"Failed to dispose engine: {e}")
        
        return result
    
    logger.info(f"Starting task (execution_id: {execution_id})")
    return _run_async(_execute())


async def _update_execution_status(
    session, execution_id, success, started_at, error_message, result
):
    """Update scheduler execution record."""
    from api.repositories.scheduler_repository import SchedulerRepository
    
    repo = SchedulerRepository()
    completed_at = datetime.now(timezone.utc)
    duration_ms = int((completed_at - started_at).total_seconds() * 1000)
    
    status_code = "success" if success else "failed"
    status_obj = await repo.get_execution_status_by_code(session, status_code)
    
    if status_obj:
        await repo.update_execution(
            session,
            execution_id,
            {
                "completed_at": completed_at,
                "duration_ms": duration_ms,
                "status_id": status_obj.id,
                "result_summary": str(result) if success else None,
                "error_message": error_message,
            },
        )
        await session.commit()
```

## Task Decorator Options

```python
@shared_task(
    # Identity
    name='tasks.email.send_notification',  # Custom name
    
    # Binding
    bind=True,                    # Access self for retries, request info
    
    # Retry Configuration
    max_retries=3,                # Max retry attempts
    default_retry_delay=60,       # Base delay (seconds)
    autoretry_for=(Exception,),   # Auto-retry exceptions
    dont_autoretry_for=(ValueError,),  # Don't retry these
    retry_backoff=True,           # Exponential backoff
    retry_backoff_max=300,        # Max backoff (5 min)
    retry_jitter=True,            # Randomize delay
    
    # Time Limits
    soft_time_limit=120,          # Soft limit - raises exception
    time_limit=180,               # Hard limit - kills worker
    
    # Queue
    queue='email',                # Target queue
    
    # Rate Limiting
    rate_limit='10/m',            # 10 per minute
    
    # Acknowledgment
    acks_late=True,               # Ack after completion
    reject_on_worker_lost=True,   # Requeue if worker dies
    
    # Tracking
    track_started=True,           # Track STARTED state
    
    # Expiration
    expires=3600,                 # Expire after 1 hour
    
    # Compression
    compression='gzip',           # Compress task
    
    # Serializer
    serializer='json',            # JSON serialization
)
def my_task(self, data):
    pass
```

## Manual Retry Pattern

```python
@shared_task(bind=True, max_retries=5)
def task_with_manual_retry(self, data):
    try:
        result = external_api_call(data)
        return result
        
    except TemporaryError as e:
        # Retry with custom countdown
        logger.warning(f"Temporary error, retrying: {e}")
        raise self.retry(exc=e, countdown=30)
        
    except RateLimitError as e:
        # Retry after rate limit window
        retry_after = e.retry_after or 60
        raise self.retry(exc=e, countdown=retry_after)
        
    except PermanentError as e:
        # Don't retry - log and return error
        logger.error(f"Permanent error: {e}")
        return {"error": str(e), "permanent": True}
        
    except Exception as e:
        # Unknown error - retry if attempts left
        if self.request.retries < self.max_retries:
            raise self.retry(exc=e)
        logger.error(f"Max retries exceeded: {e}")
        raise
```

## Task with Progress Updates

```python
@shared_task(bind=True)
def long_running_task(self, items):
    """Task that reports progress."""
    total = len(items)
    
    for i, item in enumerate(items, 1):
        # Process item
        process(item)
        
        # Update progress
        self.update_state(
            state='PROGRESS',
            meta={
                'current': i,
                'total': total,
                'percent': int((i / total) * 100),
            }
        )
    
    return {'status': 'complete', 'processed': total}

# Check progress from caller
result = long_running_task.delay(items)
while not result.ready():
    if result.state == 'PROGRESS':
        print(f"Progress: {result.info['percent']}%")
    time.sleep(1)
```

## Task Signatures and Chaining

```python
from celery import chain, group, chord, signature

# Signature (immutable task)
sig = my_task.s(arg1, arg2)
sig.delay()  # Execute

# Chain (sequential)
chain(
    task1.s(arg),
    task2.s(),      # Receives result from task1
    task3.s(),      # Receives result from task2
)()

# Group (parallel)
group(
    task.s(item1),
    task.s(item2),
    task.s(item3),
)()

# Chord (parallel then callback)
chord(
    group(task.s(i) for i in items),
    aggregate.s()
)()

# Immutable signature (don't pass previous result)
chain(
    task1.s(arg),
    task2.si(other_arg),  # .si() = immutable
)()
```

## Error Handling Best Practices

```python
@shared_task(bind=True, max_retries=3)
def robust_task(self, data):
    """Task with comprehensive error handling."""
    try:
        # Validate input
        if not data:
            raise ValueError("Data is required")
        
        # Process
        result = process(data)
        return {"status": "success", "result": result}
        
    except ValueError as e:
        # Validation errors - don't retry
        logger.error(f"Validation error: {e}")
        return {"status": "error", "message": str(e), "retryable": False}
        
    except (ConnectionError, TimeoutError) as e:
        # Temporary errors - retry
        logger.warning(f"Temporary error: {e}")
        raise self.retry(exc=e, countdown=30)
        
    except Exception as e:
        # Unknown errors
        logger.exception(f"Unexpected error: {e}")
        
        if self.request.retries < self.max_retries:
            raise self.retry(exc=e, countdown=60)
        
        return {"status": "error", "message": str(e), "max_retries_exceeded": True}
```

## Testing Tasks

```python
# tests/test_tasks.py
import pytest
from unittest.mock import patch, MagicMock

def test_task_sync():
    """Test task synchronously (without Celery)."""
    # Use .apply() for sync execution
    result = my_task.apply(args=['arg1', 'arg2'])
    assert result.get() == expected_result

def test_task_with_mock():
    """Test with mocked dependencies."""
    with patch('tasks.mymodule.external_api') as mock_api:
        mock_api.return_value = {'data': 'test'}
        
        result = my_task.apply(args=['test']).get()
        
        assert result['status'] == 'success'
        mock_api.assert_called_once()

@pytest.fixture
def celery_config():
    """Configure Celery for testing."""
    return {
        'task_always_eager': True,  # Execute synchronously
        'task_eager_propagates': True,  # Propagate exceptions
    }
```
