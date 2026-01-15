# Scheduler Implementation Guide

This guide provides step-by-step instructions for implementing the database-backed scheduler management system.

---

## Phase 1: Database Models & Migration

### Step 1.1: Add Models to database_models.py

**File:** `src/backend/models/database_models.py`

Add the following models after the existing model definitions:

```python
from sqlalchemy import Column, JSON, Text

# =============================================================================
# SCHEDULER MODELS
# =============================================================================

class TaskFunction(TableModel, table=True):
    """Registry of available task functions that can be scheduled."""
    __tablename__ = "task_functions"

    id: int = Field(primary_key=True)
    name: str = Field(max_length=100, unique=True)
    display_name: str = Field(max_length=200)
    description: Optional[str] = Field(default=None, max_length=500)
    handler_path: str = Field(max_length=500)
    handler_type: str = Field(max_length=20)  # "celery_task" or "async_function"
    queue: Optional[str] = Field(default=None, max_length=50)
    default_timeout_seconds: int = Field(default=300)
    is_active: bool = Field(default=True)
    is_system: bool = Field(default=False)
    created_at: datetime = Field(default_factory=cairo_now)
    updated_at: datetime = Field(default_factory=cairo_now)

    # Relationships
    scheduled_jobs: List["ScheduledJob"] = Relationship(back_populates="task_function")

    __table_args__ = (
        Index("ix_task_functions_name", "name"),
        Index("ix_task_functions_is_active", "is_active"),
    )


class SchedulerJobType(TableModel, table=True):
    """Lookup table for job schedule types."""
    __tablename__ = "scheduler_job_types"

    id: int = Field(primary_key=True)
    name: str = Field(max_length=50, unique=True)
    display_name: str = Field(max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    is_active: bool = Field(default=True)

    # Relationships
    scheduled_jobs: List["ScheduledJob"] = Relationship(back_populates="job_type")


class ScheduledJob(TableModel, table=True):
    """Job configuration with schedule settings."""
    __tablename__ = "scheduled_jobs"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    name: str = Field(max_length=200)
    description: Optional[str] = Field(default=None, max_length=1000)

    # Task function reference
    task_function_id: int = Field(foreign_key="task_functions.id")
    task_function: TaskFunction = Relationship(back_populates="scheduled_jobs")

    # Schedule type reference
    job_type_id: int = Field(foreign_key="scheduler_job_types.id")
    job_type: SchedulerJobType = Relationship(back_populates="scheduled_jobs")

    # Schedule configuration (JSON)
    schedule_config: dict = Field(default={}, sa_column=Column(JSON))
    task_args: Optional[dict] = Field(default=None, sa_column=Column(JSON))

    # Execution settings
    max_instances: int = Field(default=1)
    timeout_seconds: int = Field(default=300)
    retry_count: int = Field(default=3)
    retry_delay_seconds: int = Field(default=60)

    # Status
    is_enabled: bool = Field(default=True)
    is_paused: bool = Field(default=False)
    next_run_time: Optional[datetime] = Field(default=None)
    last_run_time: Optional[datetime] = Field(default=None)
    last_status: Optional[str] = Field(default=None, max_length=20)

    # Audit
    created_by: Optional[UUID] = Field(default=None, foreign_key="users.id")
    updated_by: Optional[UUID] = Field(default=None, foreign_key="users.id")
    created_at: datetime = Field(default_factory=cairo_now)
    updated_at: datetime = Field(default_factory=cairo_now)

    # Relationships
    executions: List["ScheduledJobExecution"] = Relationship(back_populates="job")

    __table_args__ = (
        Index("ix_scheduled_jobs_is_enabled", "is_enabled"),
        Index("ix_scheduled_jobs_next_run_time", "next_run_time"),
        Index("ix_scheduled_jobs_task_function_id", "task_function_id"),
    )


class ScheduledJobExecution(TableModel, table=True):
    """Execution history for scheduled jobs."""
    __tablename__ = "scheduled_job_executions"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    job_id: UUID = Field(foreign_key="scheduled_jobs.id")
    job: ScheduledJob = Relationship(back_populates="executions")

    celery_task_id: Optional[str] = Field(default=None, max_length=100)
    status: str = Field(max_length=20)  # pending, running, success, failed, timeout

    started_at: datetime = Field(default_factory=cairo_now)
    completed_at: Optional[datetime] = Field(default=None)
    duration_seconds: Optional[float] = Field(default=None)

    result: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    error_message: Optional[str] = Field(default=None, max_length=2000)
    error_traceback: Optional[str] = Field(default=None, sa_column=Column(Text))

    triggered_by: str = Field(max_length=50)  # scheduler, manual, api
    triggered_by_user_id: Optional[UUID] = Field(default=None, foreign_key="users.id")
    scheduler_instance_id: Optional[UUID] = Field(default=None, foreign_key="scheduler_instances.id")

    __table_args__ = (
        Index("ix_scheduled_job_executions_job_id", "job_id"),
        Index("ix_scheduled_job_executions_status", "status"),
        Index("ix_scheduled_job_executions_started_at", "started_at"),
    )


class SchedulerInstance(TableModel, table=True):
    """Tracks scheduler instances for leader election."""
    __tablename__ = "scheduler_instances"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    hostname: str = Field(max_length=255)
    pid: int

    is_leader: bool = Field(default=False)
    leader_since: Optional[datetime] = Field(default=None)
    last_heartbeat: datetime = Field(default_factory=cairo_now)

    started_at: datetime = Field(default_factory=cairo_now)
    version: str = Field(max_length=50)

    __table_args__ = (
        Index("ix_scheduler_instances_is_leader", "is_leader"),
        Index("ix_scheduler_instances_last_heartbeat", "last_heartbeat"),
    )
```

### Step 1.2: Create Migration

```bash
cd src/backend
uv run alembic revision --autogenerate -m "add_scheduler_management_tables"
```

Review the generated migration file and ensure it creates:
- `task_functions` table
- `scheduler_job_types` table
- `scheduled_jobs` table
- `scheduled_job_executions` table
- `scheduler_instances` table
- All indexes

### Step 1.3: Run Migration

```bash
uv run alembic upgrade head
```

### Step 1.4: Verify Tables

```bash
psql -U postgres -d service_catalog -c "\dt *scheduler*"
psql -U postgres -d service_catalog -c "\dt task_functions"
```

---

## Phase 2: Backend Schemas

### Step 2.1: Create Schema Directory

```bash
mkdir -p src/backend/schemas/scheduler
touch src/backend/schemas/scheduler/__init__.py
```

### Step 2.2: Create Schemas

**File:** `src/backend/schemas/scheduler/scheduler.py`

```python
"""Scheduler management schemas."""
from datetime import datetime
from typing import List, Optional, Dict, Any
from uuid import UUID
from pydantic import Field

from core.schema_base import HTTPSchemaModel


# =============================================================================
# Task Function Schemas
# =============================================================================

class TaskFunctionRead(HTTPSchemaModel):
    """Schema for reading task function data."""
    id: int
    name: str
    display_name: str
    description: Optional[str] = None
    handler_path: str
    handler_type: str
    queue: Optional[str] = None
    default_timeout_seconds: int
    is_active: bool
    is_system: bool
    created_at: datetime


class TaskFunctionListResponse(HTTPSchemaModel):
    """Paginated list of task functions."""
    task_functions: List[TaskFunctionRead]
    total: int


# =============================================================================
# Job Type Schemas
# =============================================================================

class SchedulerJobTypeRead(HTTPSchemaModel):
    """Schema for reading job type data."""
    id: int
    name: str
    display_name: str
    description: Optional[str] = None


# =============================================================================
# Scheduled Job Schemas
# =============================================================================

class ScheduledJobBase(HTTPSchemaModel):
    """Base scheduled job schema."""
    name: str = Field(..., min_length=2, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    task_function_id: int
    job_type_id: int
    schedule_config: Dict[str, Any] = Field(default_factory=dict)
    task_args: Optional[Dict[str, Any]] = None
    max_instances: int = Field(default=1, ge=1, le=10)
    timeout_seconds: int = Field(default=300, ge=30, le=3600)
    retry_count: int = Field(default=3, ge=0, le=10)
    retry_delay_seconds: int = Field(default=60, ge=0, le=3600)
    is_enabled: bool = True


class ScheduledJobCreate(ScheduledJobBase):
    """Schema for creating a new scheduled job."""
    pass


class ScheduledJobUpdate(HTTPSchemaModel):
    """Schema for updating a scheduled job."""
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    task_function_id: Optional[int] = None
    job_type_id: Optional[int] = None
    schedule_config: Optional[Dict[str, Any]] = None
    task_args: Optional[Dict[str, Any]] = None
    max_instances: Optional[int] = Field(None, ge=1, le=10)
    timeout_seconds: Optional[int] = Field(None, ge=30, le=3600)
    retry_count: Optional[int] = Field(None, ge=0, le=10)
    retry_delay_seconds: Optional[int] = Field(None, ge=0, le=3600)
    is_enabled: Optional[bool] = None


class ScheduledJobRead(ScheduledJobBase):
    """Schema for reading scheduled job data."""
    id: UUID
    is_paused: bool
    next_run_time: Optional[datetime] = None
    last_run_time: Optional[datetime] = None
    last_status: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    created_by: Optional[UUID] = None
    updated_by: Optional[UUID] = None


class ScheduledJobDetail(ScheduledJobRead):
    """Detailed scheduled job with relationships."""
    task_function: TaskFunctionRead
    job_type: SchedulerJobTypeRead
    recent_executions: List["ScheduledJobExecutionRead"] = []


class ScheduledJobListResponse(HTTPSchemaModel):
    """Paginated list of scheduled jobs."""
    jobs: List[ScheduledJobRead]
    total: int
    enabled_count: int
    disabled_count: int
    running_count: int


class ScheduledJobToggle(HTTPSchemaModel):
    """Schema for toggling job status."""
    is_enabled: bool


class ScheduledJobTrigger(HTTPSchemaModel):
    """Response from manual job trigger."""
    job_id: UUID
    execution_id: UUID
    celery_task_id: Optional[str] = None
    message: str


# =============================================================================
# Execution Schemas
# =============================================================================

class ScheduledJobExecutionRead(HTTPSchemaModel):
    """Schema for reading execution history."""
    id: UUID
    job_id: UUID
    celery_task_id: Optional[str] = None
    status: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    duration_seconds: Optional[float] = None
    result: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    triggered_by: str
    triggered_by_user_id: Optional[UUID] = None


class ScheduledJobExecutionListResponse(HTTPSchemaModel):
    """Paginated list of executions."""
    executions: List[ScheduledJobExecutionRead]
    total: int


# =============================================================================
# Scheduler Status Schemas
# =============================================================================

class SchedulerInstanceRead(HTTPSchemaModel):
    """Schema for scheduler instance."""
    id: UUID
    hostname: str
    pid: int
    is_leader: bool
    leader_since: Optional[datetime] = None
    last_heartbeat: datetime
    started_at: datetime
    version: str


class SchedulerStatusResponse(HTTPSchemaModel):
    """Overall scheduler status."""
    is_running: bool
    leader_instance: Optional[SchedulerInstanceRead] = None
    total_jobs: int
    enabled_jobs: int
    running_jobs: int
    next_scheduled_job: Optional[ScheduledJobRead] = None
    instances: List[SchedulerInstanceRead] = []


# Update forward references
ScheduledJobDetail.model_rebuild()
```

### Step 2.3: Create Schema Exports

**File:** `src/backend/schemas/scheduler/__init__.py`

```python
from .scheduler import (
    # Task Functions
    TaskFunctionRead,
    TaskFunctionListResponse,
    # Job Types
    SchedulerJobTypeRead,
    # Scheduled Jobs
    ScheduledJobCreate,
    ScheduledJobUpdate,
    ScheduledJobRead,
    ScheduledJobDetail,
    ScheduledJobListResponse,
    ScheduledJobToggle,
    ScheduledJobTrigger,
    # Executions
    ScheduledJobExecutionRead,
    ScheduledJobExecutionListResponse,
    # Scheduler Status
    SchedulerInstanceRead,
    SchedulerStatusResponse,
)

__all__ = [
    "TaskFunctionRead",
    "TaskFunctionListResponse",
    "SchedulerJobTypeRead",
    "ScheduledJobCreate",
    "ScheduledJobUpdate",
    "ScheduledJobRead",
    "ScheduledJobDetail",
    "ScheduledJobListResponse",
    "ScheduledJobToggle",
    "ScheduledJobTrigger",
    "ScheduledJobExecutionRead",
    "ScheduledJobExecutionListResponse",
    "SchedulerInstanceRead",
    "SchedulerStatusResponse",
]
```

---

## Phase 3: Backend Service

### Step 3.1: Create Scheduler Service

**File:** `src/backend/services/scheduler_service.py`

Create the service with all CRUD operations, leader election, and execution tracking. See the full implementation in the architecture document.

Key methods to implement:
- `list_task_functions()` - List available tasks
- `list_job_types()` - List schedule types
- `list_scheduled_jobs()` - List jobs with filters
- `get_scheduled_job()` - Get job details
- `create_scheduled_job()` - Create new job
- `update_scheduled_job()` - Update job
- `delete_scheduled_job()` - Delete job
- `toggle_job_status()` - Enable/disable
- `trigger_job_manually()` - Manual trigger
- `list_job_executions()` - Execution history
- `record_execution_start()` - Start execution
- `record_execution_complete()` - Complete execution
- `get_scheduler_status()` - Status info
- `register_scheduler_instance()` - Register instance
- `acquire_leader_lock()` - Leader election
- `update_instance_heartbeat()` - Heartbeat
- `cleanup_stale_instances()` - Cleanup

---

## Phase 4: Backend API Endpoints

### Step 4.1: Create Scheduler Endpoints

**File:** `src/backend/api/v1/endpoints/scheduler.py`

Implement all endpoints as documented in SCHEDULER_API_REFERENCE.md.

### Step 4.2: Register Router

**File:** `src/backend/api/v1/__init__.py`

Add:

```python
from .endpoints import scheduler

api_router.include_router(
    scheduler.router, prefix="/scheduler", tags=["scheduler"]
)
```

---

## Phase 5: Celery Integration

### Step 5.1: Create Scheduler Tasks

**File:** `src/backend/tasks/scheduler_tasks.py`

```python
"""Scheduler execution tasks."""
import asyncio
import importlib
import logging
import traceback
from datetime import datetime
from uuid import UUID

from celery_app import celery_app
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
    """Execute a scheduled job by ID."""
    # Implementation - see architecture document
    pass
```

### Step 5.2: Register Task in Celery App

**File:** `src/backend/celery_app.py`

Add to imports:

```python
from tasks import scheduler_tasks  # noqa: F401, E402
```

### Step 5.3: Create Scheduler Manager

**File:** `src/backend/core/scheduler_manager.py`

Implement the DatabaseSchedulerManager class with:
- Leader election
- Job synchronization from database
- Celery task dispatching

---

## Phase 6: Frontend Implementation

### Step 6.1: Create Types

**File:** `src/it-app/types/scheduler.d.ts`

```typescript
export interface TaskFunction {
  id: number;
  name: string;
  displayName: string;
  description: string | null;
  handlerPath: string;
  handlerType: "celery_task" | "async_function";
  queue: string | null;
  defaultTimeoutSeconds: number;
  isActive: boolean;
  isSystem: boolean;
  createdAt: string;
}

export interface SchedulerJobType {
  id: number;
  name: string;
  displayName: string;
  description: string | null;
}

export interface ScheduledJob {
  id: string;
  name: string;
  description: string | null;
  taskFunctionId: number;
  jobTypeId: number;
  scheduleConfig: Record<string, number | string>;
  taskArgs: Record<string, unknown> | null;
  maxInstances: number;
  timeoutSeconds: number;
  retryCount: number;
  retryDelaySeconds: number;
  isEnabled: boolean;
  isPaused: boolean;
  nextRunTime: string | null;
  lastRunTime: string | null;
  lastStatus: "success" | "failed" | "running" | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface ScheduledJobDetail extends ScheduledJob {
  taskFunction: TaskFunction;
  jobType: SchedulerJobType;
  recentExecutions: ScheduledJobExecution[];
}

export interface ScheduledJobExecution {
  id: string;
  jobId: string;
  celeryTaskId: string | null;
  status: "pending" | "running" | "success" | "failed" | "timeout";
  startedAt: string;
  completedAt: string | null;
  durationSeconds: number | null;
  result: Record<string, unknown> | null;
  errorMessage: string | null;
  triggeredBy: "scheduler" | "manual" | "api";
  triggeredByUserId: string | null;
}

export interface SchedulerInstance {
  id: string;
  hostname: string;
  pid: number;
  isLeader: boolean;
  leaderSince: string | null;
  lastHeartbeat: string;
  startedAt: string;
  version: string;
}

export interface ScheduledJobListResponse {
  jobs: ScheduledJob[];
  total: number;
  enabledCount: number;
  disabledCount: number;
  runningCount: number;
}

export interface TaskFunctionListResponse {
  taskFunctions: TaskFunction[];
  total: number;
}

export interface ScheduledJobExecutionListResponse {
  executions: ScheduledJobExecution[];
  total: number;
}

export interface SchedulerStatusResponse {
  isRunning: boolean;
  leaderInstance: SchedulerInstance | null;
  totalJobs: number;
  enabledJobs: number;
  runningJobs: number;
  nextScheduledJob: ScheduledJob | null;
  instances: SchedulerInstance[];
}

export interface CreateScheduledJobRequest {
  name: string;
  description?: string;
  taskFunctionId: number;
  jobTypeId: number;
  scheduleConfig: Record<string, number | string>;
  taskArgs?: Record<string, unknown>;
  maxInstances?: number;
  timeoutSeconds?: number;
  retryCount?: number;
  retryDelaySeconds?: number;
  isEnabled?: boolean;
}

export interface UpdateScheduledJobRequest {
  name?: string;
  description?: string;
  taskFunctionId?: number;
  jobTypeId?: number;
  scheduleConfig?: Record<string, number | string>;
  taskArgs?: Record<string, unknown>;
  maxInstances?: number;
  timeoutSeconds?: number;
  retryCount?: number;
  retryDelaySeconds?: number;
  isEnabled?: boolean;
}
```

### Step 6.2: Create Server Actions

**File:** `src/it-app/lib/actions/scheduler.actions.ts`

### Step 6.3: Create Client API

**File:** `src/it-app/lib/api/scheduler.ts`

### Step 6.4: Create Next.js API Routes

Create the following routes:
- `app/api/setting/scheduler/jobs/route.ts`
- `app/api/setting/scheduler/jobs/[id]/route.ts`
- `app/api/setting/scheduler/jobs/[id]/status/route.ts`
- `app/api/setting/scheduler/jobs/[id]/trigger/route.ts`
- `app/api/setting/scheduler/executions/route.ts`
- `app/api/setting/scheduler/status/route.ts`
- `app/api/setting/scheduler/task-functions/route.ts`
- `app/api/setting/scheduler/job-types/route.ts`

### Step 6.5: Create Page Components

Follow the users page pattern exactly:
- `app/(it-pages)/setting/scheduler/page.tsx`
- `app/(it-pages)/setting/scheduler/loading.tsx`
- `app/(it-pages)/setting/scheduler/_components/table/scheduler-table.tsx`
- `app/(it-pages)/setting/scheduler/_components/modal/add-job-sheet.tsx`
- `app/(it-pages)/setting/scheduler/_components/modal/edit-job-sheet.tsx`
- `app/(it-pages)/setting/scheduler/_components/sidebar/scheduler-status-panel.tsx`
- `app/(it-pages)/setting/scheduler/context/scheduler-actions-context.tsx`

### Step 6.6: Sheet Modal Pattern (CRITICAL)

**Follow the Users Page Sheet Pattern Exactly**

The "New Job" button should open a Sheet (slide-out modal) from the right side, exactly like the "Add User" functionality.

**Reference:** `app/(it-pages)/setting/users/_components/modal/add-user-sheet.tsx`

#### Add Job Sheet Structure

```typescript
"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConfirmationDialog } from "@/hooks/use-confirmation-dialog";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

interface AddJobSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (jobData: CreateScheduledJobRequest) => Promise<void>;
  taskFunctions: TaskFunction[];
  jobTypes: SchedulerJobType[];
}

export function AddJobSheet({
  open,
  onOpenChange,
  onSave,
  taskFunctions,
  jobTypes,
}: AddJobSheetProps) {
  const [formData, setFormData] = useState<CreateScheduledJobRequest>({
    name: "",
    description: "",
    taskFunctionId: 0,
    jobTypeId: 1, // Default to interval
    scheduleConfig: {},
    maxInstances: 1,
    timeoutSeconds: 300,
    retryCount: 3,
    retryDelaySeconds: 60,
    isEnabled: true,
  });

  const {
    isOpen: showSaveConfirmDialog,
    openDialog: openSaveDialog,
    closeDialog: closeSaveDialog,
    handleConfirm: handleSaveConfirm,
    dialogProps: saveDialogProps,
  } = useConfirmationDialog({
    title: "Create Scheduled Job",
    description: "Are you sure you want to create this scheduled job?",
    confirmText: "Create",
    cancelText: "Cancel",
    variant: "default",
    onConfirm: async () => {
      await onSave(formData);
      onOpenChange(false);
    },
  });

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-[600px]">
          <SheetHeader>
            <SheetTitle>Create Scheduled Job</SheetTitle>
            <SheetDescription>
              Add a new scheduled job to the system
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="h-[calc(100vh-200px)] pr-4">
            <div className="space-y-4 py-4">
              {/* Job Name */}
              <div className="space-y-2">
                <Label htmlFor="name">Job Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Daily Cleanup Job"
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe what this job does..."
                  rows={3}
                />
              </div>

              {/* Task Function Select */}
              <div className="space-y-2">
                <Label htmlFor="taskFunction">Task Function *</Label>
                <Select
                  value={formData.taskFunctionId.toString()}
                  onValueChange={(value) => setFormData({ ...formData, taskFunctionId: parseInt(value) })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a task function" />
                  </SelectTrigger>
                  <SelectContent>
                    {taskFunctions
                      .filter((tf) => tf.isActive)
                      .map((tf) => (
                        <SelectItem key={tf.id} value={tf.id.toString()}>
                          {tf.displayName}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Job Type (Interval/Cron) */}
              <div className="space-y-2">
                <Label htmlFor="jobType">Schedule Type *</Label>
                <Select
                  value={formData.jobTypeId.toString()}
                  onValueChange={(value) => setFormData({ ...formData, jobTypeId: parseInt(value) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {jobTypes.map((jt) => (
                      <SelectItem key={jt.id} value={jt.id.toString()}>
                        {jt.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Schedule Configuration (conditional based on job type) */}
              {formData.jobTypeId === 1 && (
                <div className="space-y-4 border p-4 rounded-md">
                  <h4 className="font-medium">Interval Configuration</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="hours">Hours</Label>
                      <Input
                        id="hours"
                        type="number"
                        min="0"
                        value={formData.scheduleConfig.hours || 0}
                        onChange={(e) => setFormData({
                          ...formData,
                          scheduleConfig: { ...formData.scheduleConfig, hours: parseInt(e.target.value) }
                        })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="minutes">Minutes</Label>
                      <Input
                        id="minutes"
                        type="number"
                        min="0"
                        max="59"
                        value={formData.scheduleConfig.minutes || 0}
                        onChange={(e) => setFormData({
                          ...formData,
                          scheduleConfig: { ...formData.scheduleConfig, minutes: parseInt(e.target.value) }
                        })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="seconds">Seconds</Label>
                      <Input
                        id="seconds"
                        type="number"
                        min="0"
                        max="59"
                        value={formData.scheduleConfig.seconds || 0}
                        onChange={(e) => setFormData({
                          ...formData,
                          scheduleConfig: { ...formData.scheduleConfig, seconds: parseInt(e.target.value) }
                        })}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Additional settings */}
              <div className="space-y-2">
                <Label htmlFor="maxInstances">Max Instances</Label>
                <Input
                  id="maxInstances"
                  type="number"
                  min="1"
                  max="10"
                  value={formData.maxInstances}
                  onChange={(e) => setFormData({ ...formData, maxInstances: parseInt(e.target.value) })}
                />
              </div>
            </div>
          </ScrollArea>

          <SheetFooter className="gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={openSaveDialog} disabled={!formData.name || formData.taskFunctionId === 0}>
              Create Job
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmationDialog {...saveDialogProps} />
    </>
  );
}
```

#### Key Sheet Pattern Elements

1. **Sheet Component**: Use `<Sheet>` from shadcn/ui (not Dialog)
2. **SheetContent**: Slide-out from right with `sm:max-w-[600px]`
3. **ScrollArea**: For long forms with `h-[calc(100vh-200px)]`
4. **Confirmation Dialog**: Use `useConfirmationDialog` hook before save
5. **SheetFooter**: Cancel + Submit buttons
6. **Form State**: Local state with validation

#### Add Job Button

In the main table component, add a button that opens the sheet:

```typescript
<Button onClick={() => setAddJobSheetOpen(true)}>
  <Plus className="mr-2 h-4 w-4" />
  New Job
</Button>
```

---

## Phase 7: Database Seeding

### Step 7.1: Update database_setup.py

Add seeding for job types and task functions:

```python
async def seed_scheduler_data(db: AsyncSession):
    """Seed initial scheduler configuration."""

    # Check if already seeded
    result = await db.execute(select(SchedulerJobType).limit(1))
    if result.scalar_one_or_none():
        return  # Already seeded

    # Seed job types
    job_types = [
        SchedulerJobType(id=1, name="interval", display_name="Interval", description="Run at fixed time intervals"),
        SchedulerJobType(id=2, name="cron", display_name="Cron", description="Run on cron schedule"),
    ]
    db.add_all(job_types)

    # Seed task functions
    task_functions = [
        TaskFunction(
            name="sync_domain_users",
            display_name="Domain User Sync",
            description="Synchronize users from Active Directory",
            handler_path="tasks.ad_sync_tasks.sync_domain_users_task",
            handler_type="celery_task",
            queue="ad_queue",
            default_timeout_seconds=600,
            is_system=True,
        ),
        # ... add other task functions
    ]
    db.add_all(task_functions)

    await db.commit()
```

---

## Testing

### Backend Tests

```bash
cd src/backend
pytest tests/test_scheduler_service.py -v
pytest tests/test_scheduler_api.py -v
```

### Frontend Build

```bash
cd src/it-app
bun run build
```

### Integration Test

1. Start backend: `uvicorn main:app --reload`
2. Start Celery worker: `celery -A celery_app worker -Q celery,ad_queue,file_queue`
3. Start frontend: `bun run dev`
4. Navigate to `/setting/scheduler`
5. Test: Create job, toggle status, trigger manually, view history

---

## Verification Checklist

- [ ] Migration runs without errors
- [ ] All 5 tables created
- [ ] Schemas validate correctly
- [ ] API endpoints return expected data
- [ ] Leader election works (only one leader)
- [ ] Jobs sync from database to APScheduler
- [ ] Manual trigger dispatches to Celery
- [ ] Execution history recorded
- [ ] Frontend page loads
- [ ] CRUD operations work from UI
- [ ] Toggle enable/disable works
- [ ] Manual trigger works from UI
