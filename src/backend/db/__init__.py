"""
Database models using SQLModel with performance optimizations and best practices.
Enhanced models with proper constraints, indexes, and validation.

This module provides all database models in a consolidated structure for better
organization and maintainability.

REFACTORED:
- Renamed "agent" to "technician" throughout
- Replaced SessionType and AssignType tables with enums
- Renamed tables for clarity:
  * request_user_assigns → request_assignees
  * region_user_assigns → technician_regions
  * business_unit_user_assigns → technician_business_units
  * technician_section_assigns → technician_sections
  * chat_read_monitors → chat_read_states
  * resolutions → request_resolutions
  * service_request_notes → request_notes
- Added UploadStatus and TriggerTiming enums
- Consolidated auth models into models.py for consistency
"""
from .models import (
    # Lookup/Reference Tables
    Role,
    UserRole,
    Page,
    PageRole,
    RequestAssignee,
    UserRequestAssign,  # Backward compatibility alias for RequestAssignee
    TechnicianRegion,
    TechnicianBusinessUnit,
    BusinessUnitUserAssign,  # Backward compatibility alias for TechnicianBusinessUnit
    RequestResolution,
    SystemMessage,
    SystemEvent,
    Tag,

    # Updated Core Models
    User,
    DesktopSession,
    WebSession,
    ServiceRequest,
    RequestNote,
    TechnicianSection,
    ChatMessage,
    ChatReadState,
    Screenshot,
    ChatFile,
    RequestScreenshotLink,
    RequestStatus,
    RequestType,

    # Unchanged Models
    Priority,
    ServiceSection,
    Category,
    Subcategory,
    BusinessUnitRegion,
    BusinessUnit,

    # Remote Access Models
    RemoteAccessSession,

    # Notification Events (Durable Notification Tracking)
    NotificationEvent,

    # WhatsApp Escalation Models
    WhatsAppBatch,

    # Client Version Management
    ClientVersion,

    # Deployment Control Plane
    Device,
    DeploymentJob,
    Credential,

    # Active Directory
    ActiveDirectoryConfig,

    # Authentication Models
    AuthToken,
    RefreshSession,

    # Utilities
    UUIDField,
    cairo_now
)

# Enums (replacing simple lookup tables)
from .enums import (
    SessionType,      # Replaces session_types table
    UploadStatus,     # Type-safe upload status
    TriggerTiming,    # Type-safe trigger timing
    # Deployment Control Plane enums
    DeviceLifecycleState,
    DeviceDiscoverySource,
    DeploymentJobStatus,
    CredentialType,
)

__all__ = [
    # Enums (replacing simple lookup tables)
    "SessionType",
    "UploadStatus",
    "TriggerTiming",
    "DeviceLifecycleState",
    "DeviceDiscoverySource",
    "DeploymentJobStatus",
    "CredentialType",

    # Lookup/Reference Tables
    "Role",
    "UserRole",
    "Page",
    "PageRole",
    "RequestAssignee",
    "UserRequestAssign",  # Backward compatibility alias
    "TechnicianRegion",
    "TechnicianBusinessUnit",
    "BusinessUnitUserAssign",  # Backward compatibility alias
    "RequestResolution",
    "SystemMessage",
    "SystemEvent",
    "Tag",

    # Core Models
    "User",
    "DesktopSession",
    "WebSession",
    "ServiceRequest",
    "RequestNote",
    "TechnicianSection",
    "ChatMessage",
    "ChatReadState",
    "Screenshot",
    "ChatFile",
    "RequestScreenshotLink",
    "RequestStatus",
    "RequestType",
    "Priority",
    "ServiceSection",
    "Category",
    "Subcategory",

    # Business Unit Models
    "BusinessUnitRegion",
    "BusinessUnit",

    # Remote Access Models
    "RemoteAccessSession",

    # Notification Events (Durable Notification Tracking)
    "NotificationEvent",

    # WhatsApp Escalation Models
    "WhatsAppBatch",

    # Client Version Management
    "ClientVersion",

    # Deployment Control Plane
    "Device",
    "DeploymentJob",
    "Credential",

    # Active Directory
    "ActiveDirectoryConfig",

    # Authentication Models
    "AuthToken",
    "RefreshSession",

    # Utilities
    "UUIDField",
    "cairo_now",
]
