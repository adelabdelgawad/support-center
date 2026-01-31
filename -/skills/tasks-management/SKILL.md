# Tasks Management Skill

Background task management system using APScheduler for scheduling and Celery for distributed execution.

## When to Use This Skill

Use this skill when asked to:
- Set up background task processing
- Create scheduled jobs with APScheduler
- Implement Celery workers for task execution
- Add job management endpoints
- Configure task queues and retries

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI Application                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  Scheduler  │  │   Tasks     │  │    API      │         │
│  │   Router    │  │   Bridge    │  │  Endpoints  │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
└─────────┼────────────────┼────────────────┼─────────────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────┐
│                  Scheduler Service                           │
│  • Job CRUD operations                                       │
│  • Execution tracking                                        │
│  • Distributed locking                                       │
│  • Instance management                                       │
└─────────────────────────────┬───────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐   ┌─────────────────┐   ┌───────────────┐
│  APScheduler  │   │  Celery Bridge  │   │   Database    │
│  (Scheduling) │   │  (Dispatch)     │   │  (Persistence)│
└───────────────┘   └────────┬────────┘   └───────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  Redis Broker   │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  Celery Worker  │
                    │  (Execution)    │
                    └─────────────────┘
```

## Directory Structure

```
project/
├── celery_app.py              # Celery configuration
├── tasks/
│   ├── __init__.py            # Task exports
│   ├── celery_bridge.py       # APScheduler-Celery bridge
│   ├── email.py               # Email tasks
│   ├── attendance.py          # Domain-specific tasks
│   ├── hris.py                # Integration tasks
│   └── scheduler.py           # Scheduler maintenance
├── api/
│   ├── v1/
│   │   └── scheduler.py       # Scheduler endpoints
│   ├── services/
│   │   └── scheduler_service.py
│   ├── repositories/
│   │   └── scheduler_repository.py
│   └── schemas/
│       └── scheduler_schema.py
└── db/
    └── models.py              # Job & execution models
```

## Core Components

### 1. Celery App Configuration

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
        "tasks.attendance",
        "tasks.scheduler",
    ],
)

celery_app.conf.update(
    # Serialization
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    
    # Reliability
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_track_started=True,
    
    # Result expiration
    result_expires=86400,
    
    # Worker settings
    worker_prefetch_multiplier=1,
    worker_concurrency=10,
    
    # Time limits
    task_soft_time_limit=300,
    task_time_limit=360,
    
    # Retry defaults
    task_default_retry_delay=60,
    
    # Timezone
    timezone="UTC",
    enable_utc=True,
)
```

### 2. Celery-APScheduler Bridge

```python
# tasks/celery_bridge.py
from typing import Optional
from settings import settings

_CELERY_TASK_REGISTRY = {}

def register_celery_task(job_key: str, task):
    """Register a Celery task for a job key."""
    _CELERY_TASK_REGISTRY[job_key] = task

def dispatch_to_celery(
    job_key: str, 
    execution_id: Optional[str] = None, 
    **kwargs
) -> Optional[str]:
    """Dispatch job to Celery if enabled."""
    if not settings.CELERY_ENABLED:
        return None  # Fall back to inline
    
    task = _CELERY_TASK_REGISTRY.get(job_key)
    if not task:
        return None  # Fall back to inline
    
    result = task.delay(execution_id=execution_id, **kwargs)
    return result.id

def initialize_celery_tasks():
    """Register all Celery tasks at startup."""
    from tasks.attendance import sync_attendance_task
    from tasks.scheduler import cleanup_history_task
    
    register_celery_task("attendance_sync", sync_attendance_task)
    register_celery_task("history_cleanup", cleanup_history_task)
```

### 3. Task Definition Pattern

```python
# tasks/scheduler.py
import asyncio
from celery import shared_task

def _run_async(coro):
    """Run async code in Celery worker."""
    try:
        loop = asyncio.get_running_loop()
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            return executor.submit(asyncio.run, coro).result()
    except RuntimeError:
        return asyncio.run(coro)

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
def cleanup_history_task(
    self,
    execution_id: str = None,
    retention_days: int = 30,
) -> dict:
    """Celery task with automatic retries."""
    
    async def _execute():
        from db.database import get_session
        from api.services.scheduler_service import get_scheduler_service
        
        async with get_session() as session:
            service = get_scheduler_service()
            result = await service.cleanup_history(session, retention_days)
            
            # Update execution status
            if execution_id:
                await update_execution_status(session, execution_id, "success")
            
            return result
    
    return _run_async(_execute())
```

### 4. Scheduler Service

```python
# api/services/scheduler_service.py
class SchedulerService:
    """Manages APScheduler jobs with database persistence."""
    
    _instance: Optional["SchedulerService"] = None
    _scheduler: Optional[AsyncIOScheduler] = None
    
    def __init__(self):
        self._repo = SchedulerRepository()
        self._job_functions: Dict[str, Callable] = {}
    
    @classmethod
    def get_instance(cls) -> "SchedulerService":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
    
    async def initialize(self, session: AsyncSession, mode: str = "embedded"):
        """Initialize scheduler and register instance."""
        instance = await self._repo.register_instance(session, mode)
        self._scheduler = AsyncIOScheduler()
        return instance.id
    
    async def start(self, session: AsyncSession):
        """Start scheduler and load jobs from database."""
        if settings.CELERY_ENABLED:
            from tasks.celery_bridge import initialize_celery_tasks
            initialize_celery_tasks()
        
        jobs = await self._repo.get_enabled_jobs(session)
        for job in jobs:
            await self._add_job_to_scheduler(job)
        
        self._scheduler.start()
    
    async def create_job(
        self, 
        session: AsyncSession, 
        job_data: ScheduledJobCreate
    ) -> ScheduledJob:
        """Create new scheduled job."""
        job = await self._repo.create_job(session, job_data)
        if job.is_enabled:
            await self._add_job_to_scheduler(job)
        return job
    
    async def trigger_job(
        self, 
        session: AsyncSession, 
        job_id: str
    ) -> JobExecution:
        """Manually trigger job execution."""
        job = await self._repo.get_job(session, job_id)
        execution = await self._repo.create_execution(session, job_id)
        
        # Dispatch to Celery or run inline
        from tasks.celery_bridge import dispatch_to_celery
        task_id = dispatch_to_celery(
            job.job_key, 
            execution_id=execution.id
        )
        
        if not task_id:
            # Run inline
            await self._execute_job(session, job, execution)
        
        return execution
```

### 5. Database Models

```python
# db/models.py
class ScheduledJob(Base):
    __tablename__ = "scheduled_jobs"
    
    id = Column(String(36), primary_key=True)
    job_key = Column(String(100), unique=True, nullable=False)
    name_en = Column(String(200))
    name_ar = Column(String(200))
    job_type = Column(String(20))  # "interval" or "cron"
    
    # Interval config
    interval_seconds = Column(Integer)
    interval_minutes = Column(Integer)
    interval_hours = Column(Integer)
    interval_days = Column(Integer)
    
    # Cron config
    cron_expression = Column(String(100))
    
    # APScheduler config
    max_instances = Column(Integer, default=1)
    misfire_grace_time = Column(Integer, default=60)
    coalesce = Column(Boolean, default=True)
    
    is_enabled = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)
    
    executions = relationship("ScheduledJobExecution", back_populates="job")

class ScheduledJobExecution(Base):
    __tablename__ = "scheduled_job_executions"
    
    id = Column(String(36), primary_key=True)
    job_id = Column(String(36), ForeignKey("scheduled_jobs.id"))
    execution_id = Column(String(36))  # Unique per execution
    
    scheduled_at = Column(DateTime(timezone=True))
    started_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))
    duration_ms = Column(Integer)
    
    status = Column(String(20))  # pending, running, success, failed
    error_message = Column(Text)
    result_summary = Column(Text)
    
    job = relationship("ScheduledJob", back_populates="executions")
```

## Key Patterns

### Job Types
- **Interval**: Run every N seconds/minutes/hours/days
- **Cron**: Run on cron schedule (e.g., "0 0 * * *")

### Execution Modes
- **Celery**: Distributed across workers (CELERY_ENABLED=True)
- **Inline**: Direct execution in FastAPI (CELERY_ENABLED=False)

### Retry Strategy
- Exponential backoff with jitter
- Configurable max retries
- Task-level time limits

### Instance Coordination
- Distributed locking for job execution
- Heartbeat tracking for instance health
- Automatic cleanup of stale instances

## References

See the `references/` directory for:
- `celery-pattern.md` - Celery configuration and tasks
- `scheduler-pattern.md` - APScheduler integration
- `task-pattern.md` - Task definition patterns
- `api-pattern.md` - Scheduler API endpoints
