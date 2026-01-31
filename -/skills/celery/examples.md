# Celery Worker Examples

Real-world examples for common Celery task patterns.

## Example 1: Email Notification Task

```python
# tasks/email.py
from celery import shared_task
from celery.utils.log import get_task_logger

logger = get_task_logger(__name__)

@shared_task(
    bind=True,
    max_retries=3,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=300,
    soft_time_limit=60,
    time_limit=90,
)
def send_email_task(self, to: str, subject: str, body: str, execution_id: str = None):
    """Send email with automatic retry on failure."""
    logger.info(f"Sending email to {to}: {subject}")
    
    try:
        # Your email sending logic
        from services.email_service import EmailService
        email_service = EmailService()
        email_service.send(to=to, subject=subject, body=body)
        
        logger.info(f"Email sent successfully to {to}")
        return {"status": "sent", "to": to}
        
    except Exception as e:
        logger.error(f"Failed to send email: {e}")
        raise
```

**Usage:**
```python
# Async call
send_email_task.delay(
    to="user@example.com",
    subject="Welcome!",
    body="Hello, welcome to our platform."
)

# With countdown (delay 60 seconds)
send_email_task.apply_async(
    args=["user@example.com", "Reminder", "Don't forget!"],
    countdown=60
)
```

## Example 2: File Processing Task

```python
# tasks/files.py
from celery import shared_task
from celery.utils.log import get_task_logger
import asyncio

logger = get_task_logger(__name__)

def _run_async(coro):
    """Run async code in Celery task."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()

@shared_task(
    bind=True,
    max_retries=2,
    soft_time_limit=300,
    time_limit=360,
    queue='file_queue',
)
def process_file_task(self, file_path: str, user_id: str, execution_id: str = None):
    """Process uploaded file asynchronously."""
    logger.info(f"Processing file: {file_path} for user {user_id}")
    
    async def _process():
        from services.file_service import FileService
        service = FileService()
        
        # Validate file
        if not await service.validate_file(file_path):
            raise ValueError(f"Invalid file: {file_path}")
        
        # Process file
        result = await service.process(file_path)
        
        # Update database
        await service.save_result(user_id, result)
        
        return result
    
    try:
        result = _run_async(_process())
        logger.info(f"File processed: {result}")
        return {"status": "processed", "result": result}
        
    except Exception as e:
        logger.error(f"File processing failed: {e}")
        raise self.retry(exc=e, countdown=60)
```

**Usage:**
```python
# Route to specific queue
process_file_task.apply_async(
    args=["/uploads/report.xlsx", "user-123"],
    queue='file_queue'
)
```

## Example 3: Scheduled Cleanup Task

```python
# tasks/scheduler.py
from celery import shared_task
from celery.utils.log import get_task_logger
from datetime import datetime, timedelta

logger = get_task_logger(__name__)

@shared_task(
    bind=True,
    max_retries=1,
    soft_time_limit=600,
    time_limit=660,
)
def cleanup_old_records_task(self, days: int = 30, execution_id: str = None):
    """Clean up records older than specified days."""
    logger.info(f"Starting cleanup for records older than {days} days")
    
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    try:
        from db.session import get_db
        from models import TempFile, AuditLog
        
        with get_db() as db:
            # Delete old temp files
            deleted_files = db.query(TempFile).filter(
                TempFile.created_at < cutoff_date
            ).delete()
            
            # Archive old audit logs
            archived_logs = db.query(AuditLog).filter(
                AuditLog.created_at < cutoff_date
            ).delete()
            
            db.commit()
            
        result = {
            "deleted_files": deleted_files,
            "archived_logs": archived_logs,
            "cutoff_date": cutoff_date.isoformat()
        }
        logger.info(f"Cleanup completed: {result}")
        return result
        
    except Exception as e:
        logger.error(f"Cleanup failed: {e}")
        raise
```

**Schedule with APScheduler:**
```python
# scheduler_service.py
scheduler_service.create_job(
    name="daily_cleanup",
    task_name="cleanup_old_records_task",
    trigger_type="cron",
    trigger_args={"hour": 2, "minute": 0},  # 2:00 AM daily
    kwargs={"days": 30}
)
```

## Example 4: API Integration Task with Rate Limiting

```python
# tasks/integrations.py
from celery import shared_task
from celery.utils.log import get_task_logger
import time

logger = get_task_logger(__name__)

@shared_task(
    bind=True,
    max_retries=5,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=600,
    rate_limit='10/m',  # 10 calls per minute
    soft_time_limit=30,
    time_limit=60,
)
def sync_external_api_task(self, resource_id: str, execution_id: str = None):
    """Sync data with external API with rate limiting."""
    logger.info(f"Syncing resource: {resource_id}")
    
    try:
        import httpx
        
        with httpx.Client(timeout=20) as client:
            response = client.get(
                f"https://api.external.com/resources/{resource_id}",
                headers={"Authorization": f"Bearer {get_api_key()}"}
            )
            response.raise_for_status()
            data = response.json()
        
        # Process and save data
        from services.sync_service import SyncService
        SyncService().save_external_data(resource_id, data)
        
        return {"status": "synced", "resource_id": resource_id}
        
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 429:
            # Rate limited - retry with longer delay
            raise self.retry(exc=e, countdown=120)
        raise
```

## Example 5: Chained Tasks

```python
# tasks/workflow.py
from celery import shared_task, chain, group

@shared_task
def fetch_data_task(source_id: str):
    """Step 1: Fetch data from source."""
    return {"source_id": source_id, "data": [...]}

@shared_task
def transform_data_task(data: dict):
    """Step 2: Transform the fetched data."""
    return {"transformed": True, **data}

@shared_task
def save_data_task(data: dict):
    """Step 3: Save the transformed data."""
    return {"saved": True, **data}

@shared_task
def notify_completion_task(result: dict):
    """Step 4: Send notification."""
    return {"notified": True, **result}
```

**Usage - Sequential Chain:**
```python
# Execute tasks in sequence
workflow = chain(
    fetch_data_task.s("source-123"),
    transform_data_task.s(),
    save_data_task.s(),
    notify_completion_task.s()
)
result = workflow.apply_async()
```

**Usage - Parallel Group:**
```python
# Execute tasks in parallel
parallel_fetch = group(
    fetch_data_task.s("source-1"),
    fetch_data_task.s("source-2"),
    fetch_data_task.s("source-3"),
)
results = parallel_fetch.apply_async()
```

## Example 6: Task with Progress Tracking

```python
# tasks/long_running.py
from celery import shared_task

@shared_task(bind=True)
def long_running_task(self, items: list, execution_id: str = None):
    """Task with progress updates."""
    total = len(items)
    
    for i, item in enumerate(items):
        # Process item
        process_item(item)
        
        # Update progress
        self.update_state(
            state='PROGRESS',
            meta={'current': i + 1, 'total': total, 'percent': ((i + 1) / total) * 100}
        )
    
    return {'status': 'completed', 'processed': total}
```

**Check Progress:**
```python
from celery.result import AsyncResult

result = long_running_task.delay(items)
task_result = AsyncResult(result.id)

if task_result.state == 'PROGRESS':
    print(f"Progress: {task_result.info['percent']}%")
elif task_result.state == 'SUCCESS':
    print(f"Completed: {task_result.result}")
```

## Worker Commands Reference

```bash
# Start worker with specific queues
celery -A celery_app worker -Q celery,file_queue,high_priority -c 4

# Start worker with gevent pool (I/O bound tasks)
celery -A celery_app worker -P gevent -c 100

# Monitor tasks
celery -A celery_app events

# Inspect active tasks
celery -A celery_app inspect active

# Purge all pending tasks
celery -A celery_app purge
```
