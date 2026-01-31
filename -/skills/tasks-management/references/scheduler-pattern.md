# Scheduler Pattern Reference

APScheduler integration for job scheduling with database persistence.

## Scheduler Service Structure

```python
# api/services/scheduler_service.py
from typing import Callable, Dict, List, Optional
from datetime import datetime, timezone
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

class SchedulerService:
    """
    Service for managing APScheduler jobs with database persistence.
    Supports both embedded (FastAPI) and standalone modes.
    """
    
    _instance: Optional["SchedulerService"] = None
    _scheduler: Optional[AsyncIOScheduler] = None
    _instance_id: Optional[str] = None
    _job_functions: Dict[str, Callable] = {}
    _is_running: bool = False
    
    def __init__(self):
        self._repo = SchedulerRepository()
    
    @classmethod
    def get_instance(cls) -> "SchedulerService":
        """Singleton pattern."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance
    
    def register_job_function(self, job_key: str, func: Callable) -> None:
        """Register a callable for a job key."""
        self._job_functions[job_key] = func
    
    async def initialize(
        self,
        session: AsyncSession,
        mode: str = "embedded",
        instance_name: Optional[str] = None,
    ) -> str:
        """Initialize scheduler and register instance."""
        if instance_name is None:
            instance_name = f"{mode}-{socket.gethostname()}"
        
        instance = await self._repo.register_instance(session, instance_name, mode)
        await session.commit()
        
        self._instance_id = instance.id
        self._scheduler = AsyncIOScheduler()
        
        return self._instance_id
    
    async def start(self, session: AsyncSession) -> None:
        """Start scheduler and load jobs from database."""
        if not self._scheduler:
            raise RuntimeError("Scheduler not initialized")
        
        # Initialize Celery bridge
        if settings.CELERY_ENABLED:
            from tasks.celery_bridge import initialize_celery_tasks
            initialize_celery_tasks()
        
        # Load jobs from database
        jobs = await self._repo.get_enabled_jobs(session)
        for job in jobs:
            await self._add_job_to_scheduler(job)
        
        # Start heartbeat
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop(session))
        
        self._scheduler.start()
        self._is_running = True
    
    async def _add_job_to_scheduler(self, job: ScheduledJob) -> None:
        """Add job to APScheduler."""
        if job.job_type == "interval":
            trigger = IntervalTrigger(
                seconds=job.interval_seconds or 0,
                minutes=job.interval_minutes or 0,
                hours=job.interval_hours or 0,
                days=job.interval_days or 0,
            )
        elif job.job_type == "cron":
            trigger = CronTrigger.from_crontab(job.cron_expression)
        else:
            return
        
        self._scheduler.add_job(
            self._execute_job_wrapper,
            trigger,
            id=job.job_key,
            args=[job.id],
            max_instances=job.max_instances,
            misfire_grace_time=job.misfire_grace_time,
            coalesce=job.coalesce,
            replace_existing=True,
        )
```

## Job Execution Flow

```python
async def _execute_job_wrapper(self, job_id: str) -> None:
    """Wrapper called by APScheduler."""
    from db.database import get_session
    
    async with get_session() as session:
        job = await self._repo.get_job(session, job_id)
        if not job or not job.is_enabled:
            return
        
        # Create execution record
        execution = await self._repo.create_execution(session, job_id)
        await session.commit()
        
        # Try Celery dispatch first
        from tasks.celery_bridge import dispatch_to_celery
        task_id = dispatch_to_celery(job.job_key, execution_id=execution.id)
        
        if task_id:
            # Running in Celery
            await self._repo.update_execution(
                session, execution.id, {"celery_task_id": task_id}
            )
            await session.commit()
        else:
            # Run inline
            await self._execute_job(session, job, execution)

async def _execute_job(
    self,
    session: AsyncSession,
    job: ScheduledJob,
    execution: ScheduledJobExecution,
) -> None:
    """Execute job inline (when Celery is disabled)."""
    started_at = datetime.now(timezone.utc)
    
    # Update status to running
    running_status = await self._repo.get_execution_status_by_code(session, "running")
    await self._repo.update_execution(
        session, execution.id, {"status_id": running_status.id, "started_at": started_at}
    )
    await session.commit()
    
    try:
        # Get and execute job function
        func = self._job_functions.get(job.job_key)
        if func:
            if asyncio.iscoroutinefunction(func):
                result = await func()
            else:
                result = func()
        
        # Update to success
        completed_at = datetime.now(timezone.utc)
        duration_ms = int((completed_at - started_at).total_seconds() * 1000)
        
        success_status = await self._repo.get_execution_status_by_code(session, "success")
        await self._repo.update_execution(
            session,
            execution.id,
            {
                "status_id": success_status.id,
                "completed_at": completed_at,
                "duration_ms": duration_ms,
                "result_summary": str(result) if result else None,
            },
        )
        
    except Exception as e:
        # Update to failed
        completed_at = datetime.now(timezone.utc)
        duration_ms = int((completed_at - started_at).total_seconds() * 1000)
        
        failed_status = await self._repo.get_execution_status_by_code(session, "failed")
        await self._repo.update_execution(
            session,
            execution.id,
            {
                "status_id": failed_status.id,
                "completed_at": completed_at,
                "duration_ms": duration_ms,
                "error_message": str(e),
                "error_traceback": traceback.format_exc(),
            },
        )
    
    await session.commit()
```

## CRUD Operations

```python
async def create_job(
    self,
    session: AsyncSession,
    job_data: ScheduledJobCreate,
) -> ScheduledJob:
    """Create new scheduled job."""
    job = await self._repo.create_job(session, job_data)
    await session.commit()
    
    if job.is_enabled and self._is_running:
        await self._add_job_to_scheduler(job)
    
    return job

async def update_job(
    self,
    session: AsyncSession,
    job_id: str,
    job_data: ScheduledJobUpdate,
) -> ScheduledJob:
    """Update scheduled job."""
    job = await self._repo.update_job(session, job_id, job_data)
    await session.commit()
    
    # Reschedule if needed
    if self._is_running:
        self._scheduler.remove_job(job.job_key, jobstore='default')
        if job.is_enabled:
            await self._add_job_to_scheduler(job)
    
    return job

async def delete_job(self, session: AsyncSession, job_id: str) -> None:
    """Delete scheduled job."""
    job = await self._repo.get_job(session, job_id)
    
    if self._is_running and job:
        self._scheduler.remove_job(job.job_key, jobstore='default')
    
    await self._repo.delete_job(session, job_id)
    await session.commit()

async def trigger_job(
    self,
    session: AsyncSession,
    job_id: str,
) -> ScheduledJobExecution:
    """Manually trigger job execution."""
    job = await self._repo.get_job(session, job_id)
    if not job:
        raise NotFoundError("ScheduledJob", job_id)
    
    execution = await self._repo.create_execution(session, job_id)
    await session.commit()
    
    # Dispatch
    from tasks.celery_bridge import dispatch_to_celery
    task_id = dispatch_to_celery(job.job_key, execution_id=execution.id)
    
    if not task_id:
        await self._execute_job(session, job, execution)
    
    return execution

async def toggle_job(
    self,
    session: AsyncSession,
    job_id: str,
    is_enabled: bool,
) -> ScheduledJob:
    """Enable or disable a job."""
    job = await self._repo.update_job(
        session, job_id, {"is_enabled": is_enabled}
    )
    await session.commit()
    
    if self._is_running:
        if is_enabled:
            await self._add_job_to_scheduler(job)
        else:
            self._scheduler.remove_job(job.job_key, jobstore='default')
    
    return job
```

## Instance Coordination

```python
async def _heartbeat_loop(self, session: AsyncSession) -> None:
    """Send heartbeats to indicate instance is alive."""
    while self._is_running:
        try:
            await self._repo.update_instance_heartbeat(session, self._instance_id)
            await session.commit()
        except Exception as e:
            logger.error(f"Heartbeat failed: {e}")
        
        await asyncio.sleep(30)  # Every 30 seconds

async def cleanup_history(
    self,
    session: AsyncSession,
    retention_days: int = 30,
) -> dict:
    """Clean up old data."""
    deleted_executions = await self._repo.cleanup_old_executions(
        session, retention_days
    )
    deleted_locks = await self._repo.cleanup_expired_locks(session)
    deleted_instances = await self._repo.cleanup_stale_instances(session)
    
    await session.commit()
    
    return {
        "deleted_executions": deleted_executions,
        "deleted_locks": deleted_locks,
        "deleted_instances": deleted_instances,
    }
```

## Trigger Types

### Interval Trigger
```python
# Run every 5 minutes
trigger = IntervalTrigger(minutes=5)

# Run every 2 hours
trigger = IntervalTrigger(hours=2)

# Run every day at specific time
trigger = IntervalTrigger(days=1, start_date='2024-01-01 09:00:00')
```

### Cron Trigger
```python
# Every day at midnight
trigger = CronTrigger.from_crontab('0 0 * * *')

# Every Monday at 9am
trigger = CronTrigger.from_crontab('0 9 * * 1')

# Every 5 minutes
trigger = CronTrigger.from_crontab('*/5 * * * *')

# First day of month at noon
trigger = CronTrigger(day=1, hour=12, minute=0)
```

## Key Patterns

1. **Singleton service** - One scheduler per application
2. **Database persistence** - Jobs survive restarts
3. **Celery bridge** - Distribute to workers when enabled
4. **Heartbeat tracking** - Monitor instance health
5. **Execution history** - Track all job runs
6. **Distributed locking** - Prevent duplicate executions
7. **Graceful shutdown** - Stop scheduler cleanly
