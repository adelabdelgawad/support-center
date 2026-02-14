"""Management repositories module."""

from api.repositories.management.desktop_session_repository import DesktopSessionRepository
# NOTE: DeviceRepository removed - Device model deleted with agent-deployment removal
from api.repositories.management.remote_access_repository import RemoteAccessRepository
from api.repositories.management.scheduler_repository import (
    TaskFunctionRepository,
    SchedulerJobTypeRepository,
    ScheduledJobRepository,
    ScheduledJobExecutionRepository,
    SchedulerInstanceRepository,
)

__all__ = [
    "DesktopSessionRepository",
    "RemoteAccessRepository",
    # "DeploymentJobRepository",  # Removed - DeploymentJob model deleted with agent-deployment removal
    "TaskFunctionRepository",
    "SchedulerJobTypeRepository",
    "ScheduledJobRepository",
    "ScheduledJobExecutionRepository",
    "SchedulerInstanceRepository",
]
