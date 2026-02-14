"""Management repositories module."""

from api.repositories.management.desktop_session_repository import DesktopSessionRepository
from api.repositories.management.device_repository import DeviceRepository
from api.repositories.management.deployment_job_repository import DeploymentJobRepository
from api.repositories.management.scheduler_repository import (
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
