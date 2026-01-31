# Tasks Management Examples

Real-world examples for APScheduler + Celery task management.

## Example 1: Creating a Scheduled Job

```python
# api/routes/jobs.py
from fastapi import APIRouter, Depends
from api.services.scheduler_service import SchedulerService

router = APIRouter(prefix="/jobs", tags=["jobs"])

@router.post("/")
async def create_job(
    name: str,
    task_name: str,
    trigger_type: str,  # "interval" or "cron"
    trigger_args: dict,
    kwargs: dict = None,
    scheduler_service: SchedulerService = Depends()
):
    """Create a new scheduled job."""
    job = await scheduler_service.create_job(
        name=name,
        task_name=task_name,
        trigger_type=trigger_type,
        trigger_args=trigger_args,
        kwargs=kwargs or {}
    )
    return {"job_id": job.id, "next_run": job.next_run_time}
```

**API Usage:**
```bash
# Create interval job (every 5 minutes)
curl -X POST "http://localhost:8000/api/jobs" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "sync_users",
    "task_name": "sync_users_task",
    "trigger_type": "interval",
    "trigger_args": {"minutes": 5},
    "kwargs": {"batch_size": 100}
  }'

# Create cron job (daily at 2:00 AM)
curl -X POST "http://localhost:8000/api/jobs" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "daily_cleanup",
    "task_name": "cleanup_old_records_task",
    "trigger_type": "cron",
    "trigger_args": {"hour": 2, "minute": 0},
    "kwargs": {"days": 30}
  }'
```

## Example 2: Complete Scheduler Service

```python
# api/services/scheduler_service.py
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
from uuid import uuid4

class SchedulerService:
    def __init__(self, db: AsyncSession, scheduler: AsyncIOScheduler):
        self.db = db
        self.scheduler = scheduler
    
    async def create_job(
        self,
        name: str,
        task_name: str,
        trigger_type: str,
        trigger_args: dict,
        kwargs: dict = None,
        enabled: bool = True
    ):
        """Create and schedule a new job."""
        job_id = str(uuid4())
        
        # Create database record
        job = ScheduledJob(
            id=job_id,
            name=name,
            task_name=task_name,
            trigger_type=trigger_type,
            trigger_args=trigger_args,
            kwargs=kwargs or {},
            is_enabled=enabled
        )
        self.db.add(job)
        await self.db.commit()
        
        # Schedule with APScheduler
        if enabled:
            self._add_to_scheduler(job)
        
        return job
    
    def _add_to_scheduler(self, job: ScheduledJob):
        """Add job to APScheduler."""
        trigger = self._create_trigger(job.trigger_type, job.trigger_args)
        
        self.scheduler.add_job(
            self._execute_job_wrapper,
            trigger=trigger,
            id=job.id,
            name=job.name,
            kwargs={
                'job_id': job.id,
                'task_name': job.task_name,
                'task_kwargs': job.kwargs
            },
            replace_existing=True
        )
    
    def _create_trigger(self, trigger_type: str, args: dict):
        """Create APScheduler trigger."""
        if trigger_type == "interval":
            return IntervalTrigger(**args)
        elif trigger_type == "cron":
            return CronTrigger(**args)
        else:
            raise ValueError(f"Unknown trigger type: {trigger_type}")
    
    async def _execute_job_wrapper(self, job_id: str, task_name: str, task_kwargs: dict):
        """Execute job and track execution."""
        execution_id = str(uuid4())
        
        # Create execution record
        execution = ScheduledJobExecution(
            id=execution_id,
            job_id=job_id,
            status="running",
            started_at=datetime.utcnow()
        )
        self.db.add(execution)
        await self.db.commit()
        
        try:
            # Dispatch to Celery
            from tasks.celery_bridge import dispatch_to_celery
            dispatch_to_celery(task_name, execution_id=execution_id, **task_kwargs)
            
            execution.status = "dispatched"
        except Exception as e:
            execution.status = "failed"
            execution.error_message = str(e)
        
        execution.completed_at = datetime.utcnow()
        await self.db.commit()
```

## Example 3: Celery Bridge

```python
# tasks/celery_bridge.py
from celery_app import celery_app
from settings import settings
import importlib

def dispatch_to_celery(task_name: str, execution_id: str = None, **kwargs):
    """
    Dispatch a task to Celery worker.
    
    If CELERY_ENABLED is False, executes inline for development.
    """
    if not settings.CELERY_ENABLED:
        # Inline execution for development
        return _execute_inline(task_name, execution_id, **kwargs)
    
    # Get Celery task
    task = celery_app.tasks.get(task_name)
    if not task:
        raise ValueError(f"Task not found: {task_name}")
    
    # Dispatch to worker
    result = task.delay(execution_id=execution_id, **kwargs)
    return result.id

def _execute_inline(task_name: str, execution_id: str, **kwargs):
    """Execute task inline (development mode)."""
    # Import task module dynamically
    module_name, func_name = task_name.rsplit('.', 1)
    module = importlib.import_module(module_name)
    task_func = getattr(module, func_name)
    
    # Execute directly
    return task_func(execution_id=execution_id, **kwargs)
```

## Example 4: Job Management API

```python
# api/routes/jobs.py
from fastapi import APIRouter, Depends, HTTPException

router = APIRouter(prefix="/jobs", tags=["jobs"])

@router.get("/")
async def list_jobs(
    skip: int = 0,
    limit: int = 20,
    scheduler_service: SchedulerService = Depends()
):
    """List all scheduled jobs."""
    jobs = await scheduler_service.list_jobs(skip=skip, limit=limit)
    return {"jobs": jobs, "total": len(jobs)}

@router.get("/{job_id}")
async def get_job(job_id: str, scheduler_service: SchedulerService = Depends()):
    """Get job details."""
    job = await scheduler_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@router.put("/{job_id}/enable")
async def enable_job(job_id: str, scheduler_service: SchedulerService = Depends()):
    """Enable a job."""
    job = await scheduler_service.enable_job(job_id)
    return {"status": "enabled", "job_id": job_id}

@router.put("/{job_id}/disable")
async def disable_job(job_id: str, scheduler_service: SchedulerService = Depends()):
    """Disable a job."""
    job = await scheduler_service.disable_job(job_id)
    return {"status": "disabled", "job_id": job_id}

@router.post("/{job_id}/run")
async def run_job_now(job_id: str, scheduler_service: SchedulerService = Depends()):
    """Trigger immediate job execution."""
    execution_id = await scheduler_service.run_now(job_id)
    return {"status": "triggered", "execution_id": execution_id}

@router.delete("/{job_id}")
async def delete_job(job_id: str, scheduler_service: SchedulerService = Depends()):
    """Delete a scheduled job."""
    await scheduler_service.delete_job(job_id)
    return {"status": "deleted", "job_id": job_id}

@router.get("/{job_id}/executions")
async def get_job_executions(
    job_id: str,
    skip: int = 0,
    limit: int = 20,
    scheduler_service: SchedulerService = Depends()
):
    """Get job execution history."""
    executions = await scheduler_service.get_executions(job_id, skip, limit)
    return {"executions": executions}
```

## Example 5: Database Models

```python
# models/scheduler.py
from sqlalchemy import Column, String, Boolean, DateTime, JSON, ForeignKey
from sqlalchemy.orm import relationship
from db.base import Base
from datetime import datetime

class ScheduledJob(Base):
    __tablename__ = "scheduled_jobs"
    
    id = Column(String, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    task_name = Column(String, nullable=False)
    trigger_type = Column(String, nullable=False)  # "interval" or "cron"
    trigger_args = Column(JSON, nullable=False)
    kwargs = Column(JSON, default={})
    is_enabled = Column(Boolean, default=True)
    last_run_at = Column(DateTime)
    next_run_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    executions = relationship("ScheduledJobExecution", back_populates="job")

class ScheduledJobExecution(Base):
    __tablename__ = "scheduled_job_executions"
    
    id = Column(String, primary_key=True)
    job_id = Column(String, ForeignKey("scheduled_jobs.id"), nullable=False)
    status = Column(String, nullable=False)  # pending, running, success, failed
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    error_message = Column(String)
    result = Column(JSON)
    
    job = relationship("ScheduledJob", back_populates="executions")
```

## Example 6: Trigger Types Reference

```python
# Interval Triggers
trigger_args = {
    "seconds": 30,       # Every 30 seconds
    "minutes": 5,        # Every 5 minutes
    "hours": 1,          # Every hour
    "days": 1,           # Every day
    "weeks": 1,          # Every week
}

# Cron Triggers
trigger_args = {
    # Every day at 2:00 AM
    "hour": 2, "minute": 0,
    
    # Every Monday at 9:00 AM
    "day_of_week": "mon", "hour": 9, "minute": 0,
    
    # First day of every month at midnight
    "day": 1, "hour": 0, "minute": 0,
    
    # Every 15 minutes
    "minute": "*/15",
    
    # Weekdays at 6 PM
    "day_of_week": "mon-fri", "hour": 18, "minute": 0,
}

# Date Trigger (one-time)
trigger_args = {
    "run_date": "2024-12-31 23:59:59"
}
```

## Example 7: Startup Initialization

```python
# main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from api.services.scheduler_service import SchedulerService

scheduler = AsyncIOScheduler()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    scheduler.start()
    
    # Restore jobs from database
    async with get_db() as db:
        service = SchedulerService(db, scheduler)
        await service.restore_jobs_from_database()
    
    yield
    
    # Shutdown
    scheduler.shutdown()

app = FastAPI(lifespan=lifespan)
```
