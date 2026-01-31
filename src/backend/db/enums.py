"""
Model enums for database models.

These enums replace simple lookup tables that:
- Have a fixed, small set of values
- Are never modified at runtime
- Don't require admin management
- Don't need bilingual display names

Tables that REMAIN as tables (not enums):
- Priority: Has SLA times, may need admin adjustment
- RequestStatus: Has bilingual names, colors, business flags
- Role, Page, Category, etc.: Complex data with relationships
"""
from enum import Enum, IntEnum


class SessionType(IntEnum):
    """
    Session type for user sessions.

    Replaces the session_types table which only had 3 static values.
    Values match the original table IDs for backwards compatibility.
    """
    WEB = 1
    DESKTOP = 2
    MOBILE = 3


class UploadStatus(str, Enum):
    """
    Upload status for screenshots and attachments.

    Used by Screenshot.upload_status field.
    """
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"


class TriggerTiming(str, Enum):
    """
    Trigger timing for system events.

    Used by SystemEvent.trigger_timing field.
    """
    IMMEDIATE = "immediate"
    DELAYED = "delayed"


class DeviceLifecycleState(str, Enum):
    """
    Device lifecycle state for deployment tracking.

    Used by Device.lifecycle_state field.
    """
    DISCOVERED = "discovered"
    INSTALL_PENDING = "install_pending"
    INSTALLED_UNENROLLED = "installed_unenrolled"
    ENROLLED = "enrolled"
    MANAGED = "managed"
    QUARANTINED = "quarantined"


class DeviceDiscoverySource(str, Enum):
    """
    Source of device discovery.

    Used by Device.discovery_source field.
    """
    AD = "ad"
    NETWORK_SCAN = "network_scan"
    DESKTOP_SESSION = "desktop_session"
    MANUAL = "manual"


class DeploymentJobStatus(str, Enum):
    """
    Deployment job execution status.

    Used by DeploymentJob.status field.
    """
    QUEUED = "queued"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    FAILED = "failed"


class CredentialType(str, Enum):
    """
    Credential type for deployment operations.

    Used by Credential.credential_type field.
    """
    LOCAL_ADMIN = "local_admin"
    DOMAIN_ADMIN = "domain_admin"
