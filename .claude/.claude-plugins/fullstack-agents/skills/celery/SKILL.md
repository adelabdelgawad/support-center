# Celery Worker Skill

Production-ready Celery worker configuration for distributed task processing.

## When to Use This Skill

Use this skill when asked to:
- Configure Celery workers for background tasks
- Set up task queues and routing
- Configure retry strategies
- Optimize worker performance
- Debug Celery issues

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI Application                       │
│  dispatch_to_celery() → task.delay() → Redis Broker         │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │   Redis Broker  │
                    │   (Message Queue)│
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │ Worker 1 │   │ Worker 2 │   │ Worker 3 │
        │ Q: celery│   │ Q: files │   │ Q: email │
        └──────────┘   └──────────┘   └──────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Result Backend  │
                    │    (Redis)      │
                    └─────────────────┘
```

## Celery App Configuration

```python
# celery_app.py
from celery import Celery
from settings import settings

celery_app = Celery(
    "app_name",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "tasks.email",
        "tasks.files",
        "tasks.scheduler",
    ],
)

celery_app.conf.update(
    # Serialization
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    
    # Reliability - CRITICAL
    task_acks_late=True,              # Ack after completion
    task_reject_on_worker_lost=True,  # Requeue if worker dies
    task_track_started=True,          # Track task start
    
    # Results
    result_expires=86400,             # 24 hours
    
    # Worker Performance
    worker_prefetch_multiplier=1,     # Fair distribution
    worker_concurrency=10,            # Concurrent tasks
    
    # Time Limits - IMPORTANT
    task_soft_time_limit=300,         # 5 min soft limit
    task_time_limit=360,              # 6 min hard limit
    
    # Retries
    task_default_retry_delay=60,      # 1 min default delay
    
    # Timezone
    timezone="UTC",
    enable_utc=True,
    
    # Connection
    broker_connection_retry_on_startup=True,
)
```

## Task Definition Pattern

```python
@shared_task(
    bind=True,                    # Access self
    max_retries=3,                # Retry 3 times
    default_retry_delay=60,       # 1 min delay
    autoretry_for=(Exception,),   # Auto-retry
    retry_backoff=True,           # Exponential backoff
    retry_backoff_max=300,        # Max 5 min
    retry_jitter=True,            # Prevent thundering herd
    soft_time_limit=120,          # Soft limit
    time_limit=180,               # Hard limit
)
def my_task(self, **kwargs):
    pass
```

## Worker Commands

```bash
# Basic worker
celery -A celery_app worker --loglevel=info

# With concurrency
celery -A celery_app worker --loglevel=info --concurrency=4

# Specific queues
celery -A celery_app worker -Q celery,file_queue,email_queue

# With gevent pool (high concurrency)
celery -A celery_app worker -P gevent --concurrency=100
```

## Queue Routing

```python
# celery_app.py
celery_app.conf.task_routes = {
    'tasks.email.*': {'queue': 'email'},
    'tasks.files.*': {'queue': 'files'},
    'tasks.heavy.*': {'queue': 'heavy'},
}

# Or per-task
@shared_task(queue='high_priority')
def urgent_task():
    pass
```

## Key Patterns

1. **task_acks_late=True** - Acknowledge after completion for reliability
2. **Time limits** - Prevent hung tasks
3. **Retry with backoff** - Handle transient failures
4. **Queue routing** - Separate workloads
5. **Result expiration** - Clean up old results
