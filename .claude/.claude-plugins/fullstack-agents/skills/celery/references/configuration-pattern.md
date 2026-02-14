# Celery Configuration Reference

Complete Celery configuration options and best practices.

## Full Configuration

```python
# celery_app.py
import sys
import os
from celery import Celery
from settings import settings

# Create Celery app
celery_app = Celery(
    "app_name",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "tasks.email",
        "tasks.files",
        "tasks.scheduler",
        "tasks.notifications",
    ],
)

# Fix Python path for workers
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Complete configuration
celery_app.conf.update(
    # =========================================
    # SERIALIZATION
    # =========================================
    task_serializer="json",           # JSON for task arguments
    result_serializer="json",         # JSON for results
    accept_content=["json"],          # Only accept JSON
    
    # =========================================
    # RELIABILITY (CRITICAL)
    # =========================================
    task_acks_late=True,              # Ack AFTER task completion
                                      # If worker dies, task is requeued
    
    task_reject_on_worker_lost=True,  # Requeue task if worker killed
    
    task_track_started=True,          # Track when tasks start
                                      # Enables STARTED state
    
    # =========================================
    # TASK EXECUTION
    # =========================================
    task_always_eager=False,          # Don't run tasks synchronously
                                      # Set True for testing only
    
    task_eager_propagates=False,      # Don't propagate exceptions in eager mode
    
    # =========================================
    # TIME LIMITS
    # =========================================
    task_soft_time_limit=300,         # 5 min - raises SoftTimeLimitExceeded
                                      # Task can catch and cleanup
    
    task_time_limit=360,              # 6 min - SIGKILL, kills worker
                                      # Must be > soft_time_limit
    
    # =========================================
    # RESULTS
    # =========================================
    result_expires=86400,             # 24 hours - results expire
    
    result_extended=True,             # Store additional task metadata
    
    # =========================================
    # WORKER SETTINGS
    # =========================================
    worker_prefetch_multiplier=1,     # Prefetch 1 task per worker
                                      # Ensures fair distribution
    
    worker_concurrency=10,            # Number of concurrent workers
                                      # Adjust based on task type
    
    worker_hijack_root_logger=False,  # Don't hijack root logger
    
    worker_log_color=False,           # Disable colored logs
    
    # =========================================
    # RETRIES
    # =========================================
    task_default_retry_delay=60,      # 1 min default retry delay
    
    # =========================================
    # BROKER CONNECTION
    # =========================================
    broker_connection_retry_on_startup=True,  # Retry broker connection
    
    broker_connection_retry=True,     # Retry on connection failure
    
    broker_connection_max_retries=10, # Max connection retries
    
    # =========================================
    # TIMEZONE
    # =========================================
    timezone="UTC",
    enable_utc=True,
    
    # =========================================
    # TASK ROUTING (Optional)
    # =========================================
    task_routes={
        'tasks.email.*': {'queue': 'email'},
        'tasks.files.*': {'queue': 'files'},
        'tasks.heavy.*': {'queue': 'heavy'},
    },
    
    # =========================================
    # RATE LIMITING (Optional)
    # =========================================
    task_annotations={
        'tasks.email.send_email': {'rate_limit': '10/m'},
        'tasks.api.call_external': {'rate_limit': '100/h'},
    },
)
```

## Environment Variables

```bash
# .env.backend
CELERY_BROKER_URL=redis://:password@redis:6379/0
CELERY_RESULT_BACKEND=redis://:password@redis:6379/1
CELERY_ENABLED=true
```

## Worker Pool Types

### Prefork (Default)
```bash
# Process-based, good for CPU-bound tasks
celery -A celery_app worker -P prefork --concurrency=4
```

### Gevent
```bash
# Greenlet-based, good for I/O-bound tasks
# High concurrency with low memory
celery -A celery_app worker -P gevent --concurrency=100
```

### Eventlet
```bash
# Similar to gevent
celery -A celery_app worker -P eventlet --concurrency=100
```

### Solo
```bash
# Single-threaded, good for debugging
celery -A celery_app worker -P solo
```

## Queue Configuration

```python
# Define queues
from kombu import Queue

celery_app.conf.task_queues = (
    Queue('celery', routing_key='celery'),           # Default queue
    Queue('high_priority', routing_key='high'),      # High priority
    Queue('low_priority', routing_key='low'),        # Low priority
    Queue('file_processing', routing_key='files'),   # File tasks
    Queue('email', routing_key='email'),             # Email tasks
)

# Default queue
celery_app.conf.task_default_queue = 'celery'
celery_app.conf.task_default_routing_key = 'celery'
```

## Task Routing

```python
# Route by task name pattern
celery_app.conf.task_routes = {
    'tasks.email.*': {'queue': 'email'},
    'tasks.files.*': {'queue': 'file_processing'},
    'tasks.urgent.*': {'queue': 'high_priority'},
}

# Or route programmatically
class MyRouter:
    def route_for_task(self, task, args=None, kwargs=None):
        if task.startswith('tasks.email'):
            return {'queue': 'email'}
        return None

celery_app.conf.task_routes = (MyRouter(),)
```

## Rate Limiting

```python
# Global rate limit
celery_app.conf.task_annotations = {
    '*': {'rate_limit': '100/m'},  # 100 tasks per minute globally
}

# Per-task rate limit
@shared_task(rate_limit='10/m')  # 10 per minute
def send_email(to, subject, body):
    pass

# Per-task in configuration
celery_app.conf.task_annotations = {
    'tasks.email.send_email': {'rate_limit': '10/m'},
    'tasks.api.call_external': {'rate_limit': '100/h'},
}
```

## Monitoring Configuration

```python
# Enable events for monitoring
celery_app.conf.worker_send_task_events = True
celery_app.conf.task_send_sent_event = True

# Flower monitoring
# pip install flower
# celery -A celery_app flower --port=5555
```

## Redis Broker Configuration

```python
# For high availability
celery_app.conf.broker_transport_options = {
    'visibility_timeout': 3600,      # 1 hour
    'fanout_prefix': True,
    'fanout_patterns': True,
}

# Connection pool
celery_app.conf.broker_pool_limit = 10
```

## Best Practices Summary

| Setting | Recommended Value | Why |
|---------|------------------|-----|
| `task_acks_late` | `True` | Reliability - requeue on failure |
| `task_reject_on_worker_lost` | `True` | Don't lose tasks |
| `worker_prefetch_multiplier` | `1` | Fair distribution |
| `task_soft_time_limit` | Set it | Prevent hung tasks |
| `task_time_limit` | Set it | Kill hung workers |
| `result_expires` | `86400` | Clean up old results |
| `broker_connection_retry_on_startup` | `True` | Handle broker restarts |
