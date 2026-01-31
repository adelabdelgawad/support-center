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
    execution: Optional["ScheduledJobExecutionRead"] = None
    job: Optional[ScheduledJobRead] = None


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
ScheduledJobTrigger.model_rebuild()
