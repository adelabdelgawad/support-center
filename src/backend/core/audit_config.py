"""
Audit route configuration for automatic audit logging.

Maps API endpoints to resource types and actions for the audit middleware.
"""

import re
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Optional, Tuple


# Context variable to prevent duplicate audit entries
# When an enriched audit is created in service/endpoint layer, set this to True
# The middleware checks this and skips creating a basic entry
audit_handled_var: ContextVar[bool] = ContextVar("audit_handled", default=False)


@dataclass
class AuditRouteConfig:
    """Configuration for a single auditable route."""

    method: str  # HTTP method: POST, PUT, PATCH, DELETE
    pattern: re.Pattern  # Compiled regex for URL path
    resource_type: str  # Resource type for audit log
    action: str  # Action name for audit log
    id_group: int = 1  # Regex group index for extracting resource_id (0 = no ID)


# Routes to skip (high-frequency, low-value)
AUDIT_SKIP_PREFIXES = [
    "/health",
    "/metrics",
    "/ws",
    "/api/docs",
    "/api/redoc",
    "/api/openapi.json",
]

AUDIT_SKIP_ROUTES = [
    ("POST", re.compile(r"^/api/v1/auth/refresh$")),
    ("POST", re.compile(r"^/api/v1/sessions/desktop/[^/]+/heartbeat$")),
    ("POST", re.compile(r"^/api/v1/remote-access/[^/]+/heartbeat$")),
    ("POST", re.compile(r"^/api/v1/chat/messages/[^/]+/read$")),
    ("POST", re.compile(r"^/api/v1/chat/messages/request/[^/]+/read-all$")),
    ("POST", re.compile(r"^/api/v1/chat/[^/]+/mark-read$")),
]


# ============================================================================
# AUDIT ROUTE REGISTRY - All mutation endpoints that should be tracked
# ============================================================================

AUDIT_ROUTES: list[AuditRouteConfig] = [
    # Authentication (7 actions)
    AuditRouteConfig(
        "POST", re.compile(r"^/api/v1/auth/login$"), "Authentication", "LOGIN"
    ),
    AuditRouteConfig(
        "POST", re.compile(r"^/api/v1/auth/sso-login$"), "Authentication", "SSO_LOGIN"
    ),
    AuditRouteConfig(
        "POST", re.compile(r"^/api/v1/auth/ad-login$"), "Authentication", "AD_LOGIN"
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/auth/admin-login$"),
        "Authentication",
        "ADMIN_LOGIN",
    ),
    AuditRouteConfig(
        "POST", re.compile(r"^/api/v1/auth/logout$"), "Authentication", "LOGOUT"
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/api/v1/auth/sessions/([^/]+)$"),
        "Session",
        "TERMINATE",
        1,
    ),
    AuditRouteConfig(
        "DELETE", re.compile(r"^/api/v1/auth/sessions$"), "Session", "TERMINATE_ALL", 0
    ),
    # Service Requests (13 actions)
    AuditRouteConfig(
        "POST", re.compile(r"^/api/v1/requests$"), "ServiceRequest", "CREATE", 0
    ),
    AuditRouteConfig(
        "PATCH",
        re.compile(r"^/api/v1/requests/([^/]+)$"),
        "ServiceRequest",
        "UPDATE",
        1,
    ),
    AuditRouteConfig(
        "PATCH",
        re.compile(r"^/api/v1/requests/([^/]+)/technician-update$"),
        "ServiceRequest",
        "TECHNICIAN_UPDATE",
        1,
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/api/v1/requests/([^/]+)$"),
        "ServiceRequest",
        "DELETE",
        1,
    ),
    AuditRouteConfig(
        "PATCH",
        re.compile(r"^/api/v1/requests/bulk$"),
        "ServiceRequest",
        "BULK_UPDATE",
        0,
    ),
    AuditRouteConfig(
        "PATCH",
        re.compile(r"^/api/v1/requests/([^/]+)/reassign-section$"),
        "ServiceRequest",
        "REASSIGN_SECTION",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/requests/([^/]+)/sub-tasks/reorder$"),
        "SubTask",
        "REORDER",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/requests/([^/]+)/screenshots/([^/]+)/link$"),
        "ServiceRequest",
        "LINK_SCREENSHOT",
        1,
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/api/v1/requests/([^/]+)/screenshots/([^/]+)/link$"),
        "ServiceRequest",
        "UNLINK_SCREENSHOT",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/requests/([^/]+)/assign$"),
        "ServiceRequest",
        "ASSIGN_TECHNICIAN",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/requests/([^/]+)/unassign$"),
        "ServiceRequest",
        "UNASSIGN_TECHNICIAN",
        1,
    ),
    # Chat & Communication (8 actions)
    AuditRouteConfig(
        "POST", re.compile(r"^/api/v1/chat/messages$"), "ChatMessage", "SEND", 0
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/api/v1/chat/messages/([^/]+)$"),
        "ChatMessage",
        "DELETE",
        1,
    ),
    AuditRouteConfig(
        "POST", re.compile(r"^/api/v1/screenshots/upload$"), "Screenshot", "UPLOAD", 0
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/screenshots/bulk-upload$"),
        "Screenshot",
        "BULK_UPLOAD",
        0,
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/api/v1/screenshots/([^/]+)$"),
        "Screenshot",
        "DELETE",
        1,
    ),
    # Chat Files (2 actions)
    AuditRouteConfig(
        "POST", re.compile(r"^/api/v1/chat-files/upload$"), "ChatFile", "UPLOAD", 0
    ),
    AuditRouteConfig(
        "DELETE", re.compile(r"^/api/v1/chat-files/([^/]+)$"), "ChatFile", "DELETE", 1
    ),
    # Request Notes (1 action)
    AuditRouteConfig(
        "POST", re.compile(r"^/api/v1/request-notes$"), "RequestNote", "CREATE", 0
    ),
    # User Management (11 actions)
    AuditRouteConfig("POST", re.compile(r"^/api/v1/users$"), "User", "CREATE", 0),
    AuditRouteConfig(
        "PATCH", re.compile(r"^/api/v1/users/([^/]+)$"), "User", "UPDATE", 1
    ),
    AuditRouteConfig(
        "DELETE", re.compile(r"^/api/v1/users/([^/]+)$"), "User", "DELETE", 1
    ),
    AuditRouteConfig(
        "PATCH", re.compile(r"^/api/v1/users/([^/]+)/block$"), "User", "BLOCK", 1
    ),
    AuditRouteConfig(
        "PUT", re.compile(r"^/api/v1/users/([^/]+)/status$"), "User", "UPDATE_STATUS", 1
    ),
    AuditRouteConfig(
        "PUT",
        re.compile(r"^/api/v1/users/([^/]+)/technician$"),
        "User",
        "UPDATE_TECHNICIAN_FLAG",
        1,
    ),
    AuditRouteConfig(
        "PUT", re.compile(r"^/api/v1/users/([^/]+)/roles$"), "User", "UPDATE_ROLES", 1
    ),
    AuditRouteConfig(
        "PATCH",
        re.compile(r"^/api/v1/users/([^/]+)/preferences$"),
        "User",
        "UPDATE_PREFERENCES",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/users/bulk-status$"),
        "User",
        "BULK_UPDATE_STATUS",
        0,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/users/bulk-technician$"),
        "User",
        "BULK_UPDATE_TECHNICIAN",
        0,
    ),
    AuditRouteConfig(
        "PUT", re.compile(r"^/api/v1/user-custom-views$"), "UserCustomView", "UPDATE", 0
    ),
    # Roles & Permissions (6 actions)
    AuditRouteConfig("POST", re.compile(r"^/api/v1/roles$"), "Role", "CREATE", 0),
    AuditRouteConfig(
        "PUT", re.compile(r"^/api/v1/roles/([^/]+)$"), "Role", "UPDATE", 1
    ),
    AuditRouteConfig(
        "PUT", re.compile(r"^/api/v1/roles/([^/]+)/status$"), "Role", "UPDATE_STATUS", 1
    ),
    AuditRouteConfig(
        "DELETE", re.compile(r"^/api/v1/roles/([^/]+)$"), "Role", "DELETE", 1
    ),
    AuditRouteConfig(
        "PUT", re.compile(r"^/api/v1/roles/([^/]+)/pages$"), "Role", "UPDATE_PAGES", 1
    ),
    AuditRouteConfig(
        "PUT", re.compile(r"^/api/v1/roles/([^/]+)/users$"), "Role", "UPDATE_USERS", 1
    ),
    # Categories & Subcategories (8 actions)
    AuditRouteConfig(
        "POST", re.compile(r"^/api/v1/categories$"), "Category", "CREATE", 0
    ),
    AuditRouteConfig(
        "PUT", re.compile(r"^/api/v1/categories/([^/]+)$"), "Category", "UPDATE", 1
    ),
    AuditRouteConfig(
        "DELETE", re.compile(r"^/api/v1/categories/([^/]+)$"), "Category", "DELETE", 1
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/categories/([^/]+)/subcategories$"),
        "Subcategory",
        "CREATE",
        1,
    ),
    AuditRouteConfig(
        "POST", re.compile(r"^/api/v1/subcategories$"), "Subcategory", "CREATE", 0
    ),
    AuditRouteConfig(
        "PUT",
        re.compile(r"^/api/v1/subcategories/([^/]+)$"),
        "Subcategory",
        "UPDATE",
        1,
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/api/v1/subcategories/([^/]+)$"),
        "Subcategory",
        "DELETE",
        1,
    ),
    # Request Statuses (5 actions)
    AuditRouteConfig(
        "POST", re.compile(r"^/api/v1/request-statuses$"), "RequestStatus", "CREATE", 0
    ),
    AuditRouteConfig(
        "PUT",
        re.compile(r"^/api/v1/request-statuses/([^/]+)$"),
        "RequestStatus",
        "UPDATE",
        1,
    ),
    AuditRouteConfig(
        "PUT",
        re.compile(r"^/api/v1/request-statuses/([^/]+)/status$"),
        "RequestStatus",
        "UPDATE_STATUS",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/request-statuses/bulk-status$"),
        "RequestStatus",
        "BULK_UPDATE_STATUS",
        0,
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/api/v1/request-statuses/([^/]+)$"),
        "RequestStatus",
        "DELETE",
        1,
    ),
    # Request Types (5 actions)
    AuditRouteConfig(
        "POST", re.compile(r"^/api/v1/request-types$"), "RequestType", "CREATE", 0
    ),
    AuditRouteConfig(
        "PUT",
        re.compile(r"^/api/v1/request-types/([^/]+)$"),
        "RequestType",
        "UPDATE",
        1,
    ),
    AuditRouteConfig(
        "PUT",
        re.compile(r"^/api/v1/request-types/([^/]+)/status$"),
        "RequestType",
        "UPDATE_STATUS",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/request-types/bulk-status$"),
        "RequestType",
        "BULK_UPDATE_STATUS",
        0,
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/api/v1/request-types/([^/]+)$"),
        "RequestType",
        "DELETE",
        1,
    ),
    # Priorities (3 actions)
    AuditRouteConfig(
        "POST", re.compile(r"^/api/v1/priorities$"), "Priority", "CREATE", 0
    ),
    AuditRouteConfig(
        "PUT", re.compile(r"^/api/v1/priorities/([^/]+)$"), "Priority", "UPDATE", 1
    ),
    AuditRouteConfig(
        "DELETE", re.compile(r"^/api/v1/priorities/([^/]+)$"), "Priority", "DELETE", 1
    ),
    # Business Units (6 actions)
    AuditRouteConfig(
        "POST", re.compile(r"^/api/v1/business-units$"), "BusinessUnit", "CREATE", 0
    ),
    AuditRouteConfig(
        "PUT",
        re.compile(r"^/api/v1/business-units/([^/]+)$"),
        "BusinessUnit",
        "UPDATE",
        1,
    ),
    AuditRouteConfig(
        "PUT",
        re.compile(r"^/api/v1/business-units/([^/]+)/status$"),
        "BusinessUnit",
        "UPDATE_STATUS",
        1,
    ),
    AuditRouteConfig(
        "PATCH",
        re.compile(r"^/api/v1/business-units/([^/]+)/working-hours$"),
        "BusinessUnit",
        "UPDATE_WORKING_HOURS",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/business-units/bulk-status$"),
        "BusinessUnit",
        "BULK_UPDATE_STATUS",
        0,
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/api/v1/business-units/([^/]+)$"),
        "BusinessUnit",
        "DELETE",
        1,
    ),
    # Business Unit Regions (5 actions)
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/business-unit-regions$"),
        "BusinessUnitRegion",
        "CREATE",
        0,
    ),
    AuditRouteConfig(
        "PUT",
        re.compile(r"^/api/v1/business-unit-regions/([^/]+)$"),
        "BusinessUnitRegion",
        "UPDATE",
        1,
    ),
    AuditRouteConfig(
        "PUT",
        re.compile(r"^/api/v1/business-unit-regions/([^/]+)/status$"),
        "BusinessUnitRegion",
        "UPDATE_STATUS",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/business-unit-regions/bulk-status$"),
        "BusinessUnitRegion",
        "BULK_UPDATE_STATUS",
        0,
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/api/v1/business-unit-regions/([^/]+)$"),
        "BusinessUnitRegion",
        "DELETE",
        1,
    ),
    # Technician Assignments (7 actions)
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/business-unit-user-assigns$"),
        "TechnicianAssignment",
        "CREATE",
        0,
    ),
    AuditRouteConfig(
        "PUT",
        re.compile(r"^/api/v1/business-unit-user-assigns/([^/]+)$"),
        "TechnicianAssignment",
        "UPDATE",
        1,
    ),
    AuditRouteConfig(
        "PUT",
        re.compile(r"^/api/v1/business-unit-user-assigns/([^/]+)/status$"),
        "TechnicianAssignment",
        "UPDATE_STATUS",
        1,
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/api/v1/business-unit-user-assigns/([^/]+)$"),
        "TechnicianAssignment",
        "DELETE",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/business-unit-user-assigns/bulk-assign$"),
        "TechnicianAssignment",
        "BULK_ASSIGN",
        0,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/business-unit-user-assigns/bulk-remove$"),
        "TechnicianAssignment",
        "BULK_REMOVE",
        0,
    ),
    # Email Configuration (4 actions)
    AuditRouteConfig(
        "POST", re.compile(r"^/api/v1/email-configs$"), "EmailConfig", "CREATE", 0
    ),
    AuditRouteConfig(
        "PUT",
        re.compile(r"^/api/v1/email-configs/([^/]+)$"),
        "EmailConfig",
        "UPDATE",
        1,
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/api/v1/email-configs/([^/]+)$"),
        "EmailConfig",
        "DELETE",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/email-configs/([^/]+)/test$"),
        "EmailConfig",
        "TEST",
        1,
    ),
    # Active Directory Configuration (4 actions)
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/active-directory-configs$"),
        "ADConfig",
        "CREATE",
        0,
    ),
    AuditRouteConfig(
        "PUT",
        re.compile(r"^/api/v1/active-directory-configs/([^/]+)$"),
        "ADConfig",
        "UPDATE",
        1,
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/api/v1/active-directory-configs/([^/]+)$"),
        "ADConfig",
        "DELETE",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/active-directory-configs/([^/]+)/test$"),
        "ADConfig",
        "TEST",
        1,
    ),
    # SLA Configuration (3 actions)
    AuditRouteConfig(
        "POST", re.compile(r"^/api/v1/sla-configs$"), "SLAConfig", "CREATE", 0
    ),
    AuditRouteConfig(
        "PATCH", re.compile(r"^/api/v1/sla-configs/([^/]+)$"), "SLAConfig", "UPDATE", 1
    ),
    AuditRouteConfig(
        "DELETE", re.compile(r"^/api/v1/sla-configs/([^/]+)$"), "SLAConfig", "DELETE", 1
    ),
    # Report Configuration (3 actions)
    AuditRouteConfig(
        "POST", re.compile(r"^/api/v1/report-configs$"), "ReportConfig", "CREATE", 0
    ),
    AuditRouteConfig(
        "PATCH",
        re.compile(r"^/api/v1/report-configs/([^/]+)$"),
        "ReportConfig",
        "UPDATE",
        1,
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/api/v1/report-configs/([^/]+)$"),
        "ReportConfig",
        "DELETE",
        1,
    ),
    # Remote Access (5 actions)
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/requests/([^/]+)/remote-access/request$"),
        "RemoteAccess",
        "REQUEST",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/remote-access/start-by-user/([^/]+)$"),
        "RemoteAccess",
        "START_BY_USER",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/remote-access/([^/]+)/end$"),
        "RemoteAccess",
        "END",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/remote-access/([^/]+)/control$"),
        "RemoteAccess",
        "TOGGLE_CONTROL",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/remote-access/([^/]+)/resume$"),
        "RemoteAccess",
        "RESUME",
        1,
    ),
    # Desktop Sessions (3 actions)
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/sessions/desktop/([^/]+)/disconnect$"),
        "DesktopSession",
        "DISCONNECT",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/sessions/desktop/([^/]+)/push-update$"),
        "DesktopSession",
        "PUSH_UPDATE",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/sessions/desktop/cleanup$"),
        "DesktopSession",
        "CLEANUP",
        0,
    ),
    # Scheduler (5 actions)
    AuditRouteConfig(
        "POST", re.compile(r"^/api/v1/scheduler/jobs$"), "ScheduledJob", "CREATE", 0
    ),
    AuditRouteConfig(
        "PUT",
        re.compile(r"^/api/v1/scheduler/jobs/([^/]+)$"),
        "ScheduledJob",
        "UPDATE",
        1,
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/api/v1/scheduler/jobs/([^/]+)$"),
        "ScheduledJob",
        "DELETE",
        1,
    ),
    AuditRouteConfig(
        "PUT",
        re.compile(r"^/api/v1/scheduler/jobs/([^/]+)/status$"),
        "ScheduledJob",
        "UPDATE_STATUS",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/scheduler/jobs/([^/]+)/trigger$"),
        "ScheduledJob",
        "TRIGGER",
        1,
    ),
    # Devices (7 actions)
    AuditRouteConfig(
        "PUT", re.compile(r"^/api/v1/devices/([^/]+)$"), "Device", "UPDATE", 1
    ),
    AuditRouteConfig(
        "POST", re.compile(r"^/api/v1/devices/manual$"), "Device", "CREATE", 0
    ),
    AuditRouteConfig(
        "POST", re.compile(r"^/api/v1/devices/discover-ad$"), "Device", "DISCOVER_AD", 0
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/devices/sync-sessions$"),
        "Device",
        "SYNC_SESSIONS",
        0,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/devices/network-scan$"),
        "Device",
        "NETWORK_SCAN",
        0,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/devices/refresh-status$"),
        "Device",
        "REFRESH_STATUS",
        0,
    ),
    AuditRouteConfig(
        "POST", re.compile(r"^/api/v1/devices/([^/]+)/install$"), "Device", "INSTALL", 1
    ),
    # Deployment Jobs (2 actions)
    AuditRouteConfig(
        "POST", re.compile(r"^/api/v1/deployment-jobs$"), "DeploymentJob", "CREATE", 0
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/internal/deployment-jobs/([^/]+)/result$"),
        "DeploymentJob",
        "UPDATE_RESULT",
        1,
    ),
    # Client Versions (5 actions)
    AuditRouteConfig(
        "POST", re.compile(r"^/api/v1/client-versions$"), "ClientVersion", "CREATE", 0
    ),
    AuditRouteConfig(
        "PUT",
        re.compile(r"^/api/v1/client-versions/([^/]+)$"),
        "ClientVersion",
        "UPDATE",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/client-versions/([^/]+)/set-latest$"),
        "ClientVersion",
        "SET_LATEST",
        1,
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/api/v1/client-versions/([^/]+)$"),
        "ClientVersion",
        "DELETE",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/client-versions/([^/]+)/installer$"),
        "ClientVersion",
        "UPLOAD_INSTALLER",
        1,
    ),
    # System Events (4 actions)
    AuditRouteConfig(
        "POST", re.compile(r"^/api/v1/system-events$"), "SystemEvent", "CREATE", 0
    ),
    AuditRouteConfig(
        "PATCH",
        re.compile(r"^/api/v1/system-events/([^/]+)$"),
        "SystemEvent",
        "UPDATE",
        1,
    ),
    AuditRouteConfig(
        "PATCH",
        re.compile(r"^/api/v1/system-events/([^/]+)/toggle$"),
        "SystemEvent",
        "TOGGLE",
        1,
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/api/v1/system-events/([^/]+)$"),
        "SystemEvent",
        "DELETE",
        1,
    ),
    # System Messages (5 actions)
    AuditRouteConfig(
        "POST", re.compile(r"^/api/v1/system-messages$"), "SystemMessage", "CREATE", 0
    ),
    AuditRouteConfig(
        "PATCH",
        re.compile(r"^/api/v1/system-messages/([^/]+)$"),
        "SystemMessage",
        "UPDATE",
        1,
    ),
    AuditRouteConfig(
        "PATCH",
        re.compile(r"^/api/v1/system-messages/([^/]+)/toggle$"),
        "SystemMessage",
        "TOGGLE",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/system-messages/bulk-status$"),
        "SystemMessage",
        "BULK_UPDATE_STATUS",
        0,
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/api/v1/system-messages/([^/]+)$"),
        "SystemMessage",
        "DELETE",
        1,
    ),
    # Organizational Units (5 actions)
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/organizational-units$"),
        "OrganizationalUnit",
        "CREATE",
        0,
    ),
    AuditRouteConfig(
        "PATCH",
        re.compile(r"^/api/v1/organizational-units/([^/]+)$"),
        "OrganizationalUnit",
        "UPDATE",
        1,
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/api/v1/organizational-units/([^/]+)$"),
        "OrganizationalUnit",
        "DELETE",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/organizational-units/([^/]+)/toggle$"),
        "OrganizationalUnit",
        "TOGGLE",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/api/v1/organizational-units/sync$"),
        "OrganizationalUnit",
        "SYNC",
        0,
    ),
    # Domain Users (1 action)
    AuditRouteConfig(
        "POST", re.compile(r"^/api/v1/domain-users/sync$"), "DomainUser", "SYNC", 0
    ),
]


def resolve_route(method: str, path: str) -> Optional[Tuple[str, str, Optional[str]]]:
    """
    Match a request to an audit route config.

    Args:
        method: HTTP method (GET, POST, PUT, PATCH, DELETE)
        path: URL path (e.g., "/api/v1/users/123")

    Returns:
        Tuple of (resource_type, action, resource_id) or None if no match/skipped.
        resource_id is None if the route doesn't have an ID group.
    """
    # Check skip prefixes first
    for prefix in AUDIT_SKIP_PREFIXES:
        if path.startswith(prefix):
            return None

    # Check exact skip routes
    for skip_method, skip_pattern in AUDIT_SKIP_ROUTES:
        if skip_method == method and skip_pattern.match(path):
            return None

    # Try to match against audit routes
    for config in AUDIT_ROUTES:
        if config.method != method:
            continue

        match = config.pattern.match(path)
        if match:
            # Extract resource_id from the appropriate regex group
            resource_id = None
            if config.id_group > 0 and match.lastindex is not None:
                try:
                    resource_id = match.group(config.id_group)
                except (IndexError, AttributeError):
                    pass

            return (config.resource_type, config.action, resource_id)

    return None


def is_mutation_method(method: str) -> bool:
    """
    Check if HTTP method should be audited.

    Args:
        method: HTTP method

    Returns:
        True if method is POST, PUT, PATCH, or DELETE
    """
    return method.upper() in {"POST", "PUT", "PATCH", "DELETE"}
