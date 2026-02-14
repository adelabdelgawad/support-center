"""Management repositories module."""

from repositories.management.desktop_session_repository import DesktopSessionRepository
from repositories.management.device_repository import DeviceRepository
from repositories.management.deployment_job_repository import DeploymentJobRepository
from repositories.management.scheduler_repository import (
    TaskFunctionRepository,
    SchedulerJobTypeRepository,
    ScheduledJobRepository,
    ScheduledJobExecutionRepository,
    SchedulerInstanceRepository,
)

__all__ = [
    "DesktopSessionRepository",
    "DeviceRepository",
    "DeploymentJobRepository",
    "TaskFunctionRepository",
    "SchedulerJobTypeRepository",
    "ScheduledJobRepository",
    "ScheduledJobExecutionRepository",
    "SchedulerInstanceRepository",
]
