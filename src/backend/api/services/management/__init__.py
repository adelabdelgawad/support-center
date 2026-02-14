"""Management domain services.

This module contains services for managing IT operations including:
- Desktop sessions and remote access
- Device management
- Deployment jobs and client versions
- Scheduler and system events
"""

from api.services.management.client_version_service import ClientVersionService
from api.services.management.deployment_job_service import DeploymentJobService
from api.services.management.desktop_session_service import DesktopSessionService
from api.services.management.device_service import DeviceService
from api.services.management.remote_access_service import RemoteAccessService
from api.services.management.scheduler_service import SchedulerService
from api.services.management.system_event_service import SystemEventService

__all__ = [
    "ClientVersionService",
    "DeploymentJobService",
    "DesktopSessionService",
    "DeviceService",
    "RemoteAccessService",
    "SchedulerService",
    "SystemEventService",
]
