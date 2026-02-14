"""Management domain services.

This module contains services for managing IT operations including:
- Desktop sessions and remote access
- Scheduler and system events
"""

# NOTE: client_version_service, deployment_job_service removed - deployment control plane deleted
from api.services.management.desktop_session_service import DesktopSessionService
from api.services.management.remote_access_service import RemoteAccessService
from api.services.management.scheduler_service import SchedulerService
from api.services.management.system_event_service import SystemEventService

__all__ = [
    # "ClientVersionService",  # Removed
    # "DeploymentJobService",  # Removed
    "DesktopSessionService",
    "RemoteAccessService",
    "SchedulerService",
    "SystemEventService",
]
