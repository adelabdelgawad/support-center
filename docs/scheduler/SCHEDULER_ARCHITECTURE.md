# Scheduler Management System Architecture

## Overview

This document describes the database-backed scheduler management system that replaces the previous in-process APScheduler setup. The new architecture provides:

- Database-driven job configurations
- UI for managing scheduled jobs
- Hybrid APScheduler + Celery execution
- Leader election for high availability
- Execution history tracking

## Current State (Problems Being Solved)

### Issues with Old Architecture

1. **APScheduler runs jobs in-process**: Jobs execute directly in FastAPI process threads, not Celery workers
2. **Multi-worker race condition**: 4 Uvicorn workers = 4 APScheduler instances = 4 concurrent executions
3. **Database connection pool exhaustion**: Jobs compete with API requests for connections
4. **No management UI**: Jobs can only be modified by code changes
5. **Misleading documentation**: Code comments claim Celery integration that doesn't exist

### Jobs Currently Running on APScheduler (In-Process)

| Job | Schedule | File Location |
|-----|----------|---------------|
| `sync_domain_users_job` | Every 1 hour | `core/scheduler.py:23-48` |
| `cleanup_expired_tokens_job` | Every 24 hours | `core/scheduler.py:59-92` |
| `cleanup_stale_desktop_sessions_job` | Every 1 minute | `core/scheduler.py:95-126` |

---

## Target Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     FastAPI Application                          │
│  - HTTP request handling only                                    │
│  - WebSocket connections                                         │
│  - NO periodic task execution                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Startup
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              DatabaseSchedulerManager (Single Leader)            │
│  - Leader election via database locks                            │
│  - Reads job configs from scheduled_jobs table                   │
│  - Dispatches jobs to Celery via .delay()                        │
│  - Only ONE instance active across all workers                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Redis (broker)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Celery Workers                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Worker 1  │  │   Worker 2  │  │   Worker N  │             │
│  │ (ad_queue)  │  │(file_queue) │  │  (default)  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                  │
│  Generic Task: execute_scheduled_job(job_id, execution_id)      │
│  - Looks up job configuration from database                      │
│  - Executes the appropriate handler                              │
│  - Records execution results                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     PostgreSQL Database                          │
│  - task_functions: Available task handlers                       │
│  - scheduler_job_types: interval, cron                           │
│  - scheduled_jobs: Job configurations                            │
│  - scheduled_job_executions: Execution history                   │
│  - scheduler_instances: Leader election tracking                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Models

### Entity Relationship Diagram

```
┌──────────────────┐       ┌────────────────────┐
│  TaskFunction    │       │ SchedulerJobType   │
├──────────────────┤       ├────────────────────┤
│ id (PK)          │       │ id (PK)            │
│ name             │       │ name               │
│ display_name     │       │ display_name       │
│ description      │       │ description        │
│ handler_path     │       │ is_active          │
│ handler_type     │       └────────────────────┘
│ queue            │                │
│ default_timeout  │                │
│ is_active        │                │
│ is_system        │                │
└──────────────────┘                │
         │                          │
         │ task_function_id         │ job_type_id
         ▼                          ▼
┌─────────────────────────────────────────────────┐
│               ScheduledJob                       │
├─────────────────────────────────────────────────┤
│ id (PK, UUID)                                    │
│ name                                             │
│ description                                      │
│ task_function_id (FK) ─────────────────────────►│
│ job_type_id (FK) ──────────────────────────────►│
│ schedule_config (JSON)                           │
│ task_args (JSON)                                 │
│ max_instances                                    │
│ timeout_seconds                                  │
│ retry_count                                      │
│ retry_delay_seconds                              │
│ is_enabled                                       │
│ is_paused                                        │
│ next_run_time                                    │
│ last_run_time                                    │
│ last_status                                      │
│ created_by (FK → users.id)                       │
│ updated_by (FK → users.id)                       │
│ created_at                                       │
│ updated_at                                       │
└─────────────────────────────────────────────────┘
         │
         │ job_id
         ▼
┌─────────────────────────────────────────────────┐
│          ScheduledJobExecution                   │
├─────────────────────────────────────────────────┤
│ id (PK, UUID)                                    │
│ job_id (FK) ───────────────────────────────────►│
│ celery_task_id                                   │
│ status (pending/running/success/failed/timeout)  │
│ started_at                                       │
│ completed_at                                     │
│ duration_seconds                                 │
│ result (JSON)                                    │
│ error_message                                    │
│ error_traceback                                  │
│ triggered_by (scheduler/manual/api)              │
│ triggered_by_user_id (FK → users.id)             │
│ scheduler_instance_id (FK)                       │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│           SchedulerInstance                      │
├─────────────────────────────────────────────────┤
│ id (PK, UUID)                                    │
│ hostname                                         │
│ pid                                              │
│ is_leader                                        │
│ leader_since                                     │
│ last_heartbeat                                   │
│ started_at                                       │
│ version                                          │
└─────────────────────────────────────────────────┘
```

### Model Definitions

#### TaskFunction

Registry of available task functions that can be scheduled.

```python
class TaskFunction(TableModel, table=True):
    __tablename__ = "task_functions"

    id: int = Field(primary_key=True)
    name: str = Field(max_length=100, unique=True)  # e.g., "sync_domain_users"
    display_name: str = Field(max_length=200)
    description: Optional[str] = Field(max_length=500)
    handler_path: str = Field(max_length=500)  # e.g., "tasks.ad_sync_tasks.sync_domain_users_task"
    handler_type: str = Field(max_length=20)  # "celery_task" or "async_function"
    queue: Optional[str] = Field(max_length=50)  # Celery queue name
    default_timeout_seconds: int = Field(default=300)
    is_active: bool = Field(default=True)
    is_system: bool = Field(default=False)  # System tasks cannot be deleted
    created_at: datetime
    updated_at: datetime
```

#### SchedulerJobType

Lookup table for schedule types.

```python
class SchedulerJobType(TableModel, table=True):
    __tablename__ = "scheduler_job_types"

    id: int = Field(primary_key=True)
    name: str  # "interval" or "cron"
    display_name: str
    description: Optional[str]
    is_active: bool = Field(default=True)
```

#### ScheduledJob

Main job configuration table.

```python
class ScheduledJob(TableModel, table=True):
    __tablename__ = "scheduled_jobs"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    name: str = Field(max_length=200)
    description: Optional[str]

    # References
    task_function_id: int = Field(foreign_key="task_functions.id")
    job_type_id: int = Field(foreign_key="scheduler_job_types.id")

    # Schedule configuration (JSON)
    schedule_config: dict  # {"hours": 1} or {"hour": "*/2", "minute": "0"}
    task_args: Optional[dict]  # Arguments to pass to task

    # Execution settings
    max_instances: int = Field(default=1)
    timeout_seconds: int = Field(default=300)
    retry_count: int = Field(default=3)
    retry_delay_seconds: int = Field(default=60)

    # Status
    is_enabled: bool = Field(default=True)
    is_paused: bool = Field(default=False)
    next_run_time: Optional[datetime]
    last_run_time: Optional[datetime]
    last_status: Optional[str]  # "success", "failed", "running"

    # Audit
    created_by: Optional[UUID]
    updated_by: Optional[UUID]
    created_at: datetime
    updated_at: datetime
```

#### ScheduledJobExecution

Execution history tracking.

```python
class ScheduledJobExecution(TableModel, table=True):
    __tablename__ = "scheduled_job_executions"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    job_id: UUID = Field(foreign_key="scheduled_jobs.id")

    celery_task_id: Optional[str]
    status: str  # "pending", "running", "success", "failed", "timeout"

    started_at: datetime
    completed_at: Optional[datetime]
    duration_seconds: Optional[float]

    result: Optional[dict]  # JSON result
    error_message: Optional[str]
    error_traceback: Optional[str]

    triggered_by: str  # "scheduler", "manual", "api"
    triggered_by_user_id: Optional[UUID]
    scheduler_instance_id: Optional[UUID]
```

#### SchedulerInstance

Tracks scheduler instances for leader election.

```python
class SchedulerInstance(TableModel, table=True):
    __tablename__ = "scheduler_instances"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    hostname: str
    pid: int

    is_leader: bool = Field(default=False)
    leader_since: Optional[datetime]
    last_heartbeat: datetime

    started_at: datetime
    version: str
```

---

## Execution Flow

### Job Scheduling Flow

```
1. FastAPI starts
   └─► DatabaseSchedulerManager.start()
       └─► Register instance in scheduler_instances table
       └─► Start APScheduler with:
           - leader_election_loop (every 30s)
           - sync_jobs_from_database (every 60s)

2. Leader Election Loop
   └─► Update heartbeat
   └─► Try to acquire leader lock if not already leader
   └─► Cleanup stale instances (heartbeat > 2 min old)

3. Job Sync Loop (only if leader)
   └─► Query enabled jobs from scheduled_jobs table
   └─► Add/update APScheduler jobs with correct triggers
   └─► Remove jobs no longer in database

4. Job Execution (APScheduler triggers)
   └─► Create execution record (status: pending)
   └─► Dispatch to Celery: execute_scheduled_job.delay(job_id, execution_id)
   └─► Update execution with celery_task_id
```

### Celery Task Execution Flow

```
1. execute_scheduled_job task starts
   └─► Load job from database
   └─► Update execution status to "running"

2. Execute handler based on type
   ├─► celery_task: task.apply() and wait
   └─► async_function: await func(**task_args)

3. Record result
   ├─► Success: status="success", result={...}
   └─► Failure: status="failed", error_message, error_traceback

4. Update job
   └─► last_run_time = now
   └─► last_status = execution.status
```

---

## Leader Election

### Why Leader Election?

When running multiple Uvicorn workers (e.g., 4 workers in production), each worker would start its own APScheduler instance. Without coordination, this would cause:

- 4x job executions per scheduled interval
- Race conditions on database updates
- Wasted resources

### How It Works

1. **Instance Registration**: Each worker registers itself in `scheduler_instances` table on startup
2. **Heartbeat**: Every 30 seconds, instances update their `last_heartbeat`
3. **Leader Acquisition**: Only one instance can have `is_leader=True`
4. **Stale Cleanup**: Instances with heartbeat > 2 minutes are removed
5. **Leader Takeover**: If leader dies, another instance acquires the lock

### Implementation

```python
async def acquire_leader_lock(db: AsyncSession, instance_id: UUID) -> bool:
    """Try to acquire leader lock using database transaction."""

    # Check if there's an active leader
    stmt = select(SchedulerInstance).where(
        SchedulerInstance.is_leader == True,
        SchedulerInstance.last_heartbeat > datetime.utcnow() - timedelta(minutes=2)
    )
    result = await db.execute(stmt)
    current_leader = result.scalar_one_or_none()

    if current_leader and current_leader.id != instance_id:
        return False  # Another instance is leader

    # Acquire leader lock
    stmt = update(SchedulerInstance).where(
        SchedulerInstance.id == instance_id
    ).values(
        is_leader=True,
        leader_since=datetime.utcnow()
    )
    await db.execute(stmt)
    await db.commit()

    return True
```

---

## Task Functions (Seed Data)

### System Tasks (is_system=True)

| Name | Handler | Type | Queue | Schedule |
|------|---------|------|-------|----------|
| `sync_domain_users` | `tasks.ad_sync_tasks.sync_domain_users_task` | celery_task | ad_queue | 1 hour |
| `cleanup_expired_tokens` | `services.auth_service.auth_service.cleanup_all_expired_sessions` | async_function | - | 24 hours |
| `cleanup_stale_desktop_sessions` | `services.desktop_session_service.DesktopSessionService.cleanup_stale_sessions` | async_function | - | 1 minute |
| `cleanup_stale_deployment_jobs` | `tasks.deployment_tasks.cleanup_stale_deployment_jobs` | celery_task | celery | 30 seconds |

### Optional Tasks (is_system=False)

| Name | Handler | Type | Queue |
|------|---------|------|-------|
| `cleanup_expired_files` | `tasks.minio_file_tasks.cleanup_expired_files` | celery_task | file_queue |
| `retry_pending_uploads` | `tasks.minio_file_tasks.retry_pending_uploads` | celery_task | file_queue |

---

## Schedule Configuration

### Interval Schedule

```json
{
  "hours": 1,
  "minutes": 0,
  "seconds": 0
}
```

Creates APScheduler `IntervalTrigger(hours=1, minutes=0, seconds=0)`.

### Cron Schedule

```json
{
  "hour": "*/2",
  "minute": "0",
  "day_of_week": "*",
  "day": "*",
  "month": "*"
}
```

Creates APScheduler `CronTrigger(hour="*/2", minute="0", ...)`.

---

## Frontend Components

### Page Structure

```
/app/(it-pages)/setting/scheduler/
├── page.tsx                    # Server component - fetches data
├── loading.tsx                 # Loading skeleton
├── _components/
│   ├── table/
│   │   ├── scheduler-table.tsx          # Main client wrapper
│   │   ├── scheduler-table-columns.tsx  # Column definitions
│   │   └── scheduler-table-body.tsx     # Table rows
│   ├── modal/
│   │   ├── add-job-sheet.tsx            # Create job
│   │   ├── edit-job-sheet.tsx           # Edit job
│   │   ├── view-job-sheet.tsx           # View details
│   │   └── execution-history-sheet.tsx  # View history
│   ├── sidebar/
│   │   └── scheduler-status-panel.tsx   # Status dashboard
│   └── actions/
│       ├── actions-menu.tsx             # Row actions
│       └── inline-actions.tsx           # Enable/trigger buttons
└── context/
    └── scheduler-actions-context.tsx    # Actions provider
```

### UI Features

1. **Data Table**: List all jobs with columns for name, task, schedule, status, last run, next run
2. **Enable/Disable Toggle**: Quick toggle for job status
3. **Manual Trigger**: Button to execute job immediately
4. **Create Job**: Sheet form to create new scheduled job
5. **Edit Job**: Sheet form to modify existing job
6. **View Details**: Sheet showing job configuration and recent executions
7. **Execution History**: Sheet with paginated execution history
8. **Status Sidebar**: Dashboard showing scheduler status, job counts, recent failures

---

## Files to Create

### Backend

| File | Purpose |
|------|---------|
| `models/scheduler_models.py` | 5 database models (or add to database_models.py) |
| `schemas/scheduler/__init__.py` | Schema exports |
| `schemas/scheduler/scheduler.py` | All Pydantic schemas |
| `services/scheduler_service.py` | Business logic service |
| `api/v1/endpoints/scheduler.py` | API endpoints |
| `tasks/scheduler_tasks.py` | Generic Celery task |
| `core/scheduler_manager.py` | Database-backed scheduler manager |

### Frontend

| File | Purpose |
|------|---------|
| `lib/actions/scheduler.actions.ts` | Server actions |
| `lib/api/scheduler.ts` | Client API functions |
| `types/scheduler.d.ts` | TypeScript types |
| `app/api/setting/scheduler/**/*.ts` | API routes |
| `app/(it-pages)/setting/scheduler/**/*` | Page components |

---

## Related Documents

- [SCHEDULER_API_REFERENCE.md](./SCHEDULER_API_REFERENCE.md) - API endpoints documentation
- [SCHEDULER_IMPLEMENTATION_GUIDE.md](./SCHEDULER_IMPLEMENTATION_GUIDE.md) - Step-by-step implementation
- [SCHEDULER_MIGRATION_PLAN.md](./SCHEDULER_MIGRATION_PLAN.md) - Migration from old scheduler
