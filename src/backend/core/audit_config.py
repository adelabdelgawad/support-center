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
    ("POST", re.compile(r"^/backend/auth/refresh$")),
    ("POST", re.compile(r"^/backend/sessions/desktop/[^/]+/heartbeat$")),
    ("POST", re.compile(r"^/backend/remote-access/[^/]+/heartbeat$")),
    ("POST", re.compile(r"^/backend/chat/messages/[^/]+/read$")),
    ("POST", re.compile(r"^/backend/chat/messages/request/[^/]+/read-all$")),
    ("POST", re.compile(r"^/backend/chat/[^/]+/mark-read$")),
]


# ============================================================================
# AUDIT ROUTE REGISTRY - All mutation endpoints that should be tracked
# ============================================================================

AUDIT_ROUTES: list[AuditRouteConfig] = [
    # Authentication (7 actions)
    AuditRouteConfig(
        "POST", re.compile(r"^/backend/auth/login$"), "Authentication", "LOGIN"
    ),
    AuditRouteConfig(
        "POST", re.compile(r"^/backend/auth/sso-login$"), "Authentication", "SSO_LOGIN"
    ),
    AuditRouteConfig(
        "POST", re.compile(r"^/backend/auth/ad-login$"), "Authentication", "AD_LOGIN"
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/auth/admin-login$"),
        "Authentication",
        "ADMIN_LOGIN",
    ),
    AuditRouteConfig(
        "POST", re.compile(r"^/backend/auth/logout$"), "Authentication", "LOGOUT"
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/backend/auth/sessions/([^/]+)$"),
        "Session",
        "TERMINATE",
        1,
    ),
    AuditRouteConfig(
        "DELETE", re.compile(r"^/backend/auth/sessions$"), "Session", "TERMINATE_ALL", 0
    ),
    # Service Requests (13 actions)
    AuditRouteConfig(
        "POST", re.compile(r"^/backend/requests$"), "ServiceRequest", "CREATE", 0
    ),
    AuditRouteConfig(
        "PATCH",
        re.compile(r"^/backend/requests/([^/]+)$"),
        "ServiceRequest",
        "UPDATE",
        1,
    ),
    AuditRouteConfig(
        "PATCH",
        re.compile(r"^/backend/requests/([^/]+)/technician-update$"),
        "ServiceRequest",
        "TECHNICIAN_UPDATE",
        1,
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/backend/requests/([^/]+)$"),
        "ServiceRequest",
        "DELETE",
        1,
    ),
    AuditRouteConfig(
        "PATCH",
        re.compile(r"^/backend/requests/bulk$"),
        "ServiceRequest",
        "BULK_UPDATE",
        0,
    ),
    AuditRouteConfig(
        "PATCH",
        re.compile(r"^/backend/requests/([^/]+)/reassign-section$"),
        "ServiceRequest",
        "REASSIGN_SECTION",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/requests/([^/]+)/sub-tasks/reorder$"),
        "SubTask",
        "REORDER",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/requests/([^/]+)/screenshots/([^/]+)/link$"),
        "ServiceRequest",
        "LINK_SCREENSHOT",
        1,
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/backend/requests/([^/]+)/screenshots/([^/]+)/link$"),
        "ServiceRequest",
        "UNLINK_SCREENSHOT",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/requests/([^/]+)/assign$"),
        "ServiceRequest",
        "ASSIGN_TECHNICIAN",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/requests/([^/]+)/unassign$"),
        "ServiceRequest",
        "UNASSIGN_TECHNICIAN",
        1,
    ),
    # Chat & Communication (8 actions)
    AuditRouteConfig(
        "POST", re.compile(r"^/backend/chat/messages$"), "ChatMessage", "SEND", 0
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/backend/chat/messages/([^/]+)$"),
        "ChatMessage",
        "DELETE",
        1,
    ),
    AuditRouteConfig(
        "POST", re.compile(r"^/backend/screenshots/upload$"), "Screenshot", "UPLOAD", 0
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/screenshots/bulk-upload$"),
        "Screenshot",
        "BULK_UPLOAD",
        0,
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/backend/screenshots/([^/]+)$"),
        "Screenshot",
        "DELETE",
        1,
    ),
    # Chat Files (2 actions)
    AuditRouteConfig(
        "POST", re.compile(r"^/backend/chat-files/upload$"), "ChatFile", "UPLOAD", 0
    ),
    AuditRouteConfig(
        "DELETE", re.compile(r"^/backend/chat-files/([^/]+)$"), "ChatFile", "DELETE", 1
    ),
    # Request Notes (1 action)
    AuditRouteConfig(
        "POST", re.compile(r"^/backend/request-notes$"), "RequestNote", "CREATE", 0
    ),
    # User Management (11 actions)
    AuditRouteConfig("POST", re.compile(r"^/backend/users$"), "User", "CREATE", 0),
    AuditRouteConfig(
        "PATCH", re.compile(r"^/backend/users/([^/]+)$"), "User", "UPDATE", 1
    ),
    AuditRouteConfig(
        "DELETE", re.compile(r"^/backend/users/([^/]+)$"), "User", "DELETE", 1
    ),
    AuditRouteConfig(
        "PATCH", re.compile(r"^/backend/users/([^/]+)/block$"), "User", "BLOCK", 1
    ),
    AuditRouteConfig(
        "PUT", re.compile(r"^/backend/users/([^/]+)/status$"), "User", "UPDATE_STATUS", 1
    ),
    AuditRouteConfig(
        "PUT",
        re.compile(r"^/backend/users/([^/]+)/technician$"),
        "User",
        "UPDATE_TECHNICIAN_FLAG",
        1,
    ),
    AuditRouteConfig(
        "PUT", re.compile(r"^/backend/users/([^/]+)/roles$"), "User", "UPDATE_ROLES", 1
    ),
    AuditRouteConfig(
        "PATCH",
        re.compile(r"^/backend/users/([^/]+)/preferences$"),
        "User",
        "UPDATE_PREFERENCES",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/users/bulk-status$"),
        "User",
        "BULK_UPDATE_STATUS",
        0,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/users/bulk-technician$"),
        "User",
        "BULK_UPDATE_TECHNICIAN",
        0,
    ),
    AuditRouteConfig(
        "PUT", re.compile(r"^/backend/user-custom-views$"), "UserCustomView", "UPDATE", 0
    ),
    # Roles & Permissions (6 actions)
    AuditRouteConfig("POST", re.compile(r"^/backend/roles$"), "Role", "CREATE", 0),
    AuditRouteConfig(
        "PUT", re.compile(r"^/backend/roles/([^/]+)$"), "Role", "UPDATE", 1
    ),
    AuditRouteConfig(
        "PUT", re.compile(r"^/backend/roles/([^/]+)/status$"), "Role", "UPDATE_STATUS", 1
    ),
    AuditRouteConfig(
        "DELETE", re.compile(r"^/backend/roles/([^/]+)$"), "Role", "DELETE", 1
    ),
    AuditRouteConfig(
        "PUT", re.compile(r"^/backend/roles/([^/]+)/pages$"), "Role", "UPDATE_PAGES", 1
    ),
    AuditRouteConfig(
        "PUT", re.compile(r"^/backend/roles/([^/]+)/users$"), "Role", "UPDATE_USERS", 1
    ),
    # Categories & Subcategories (8 actions)
    AuditRouteConfig(
        "POST", re.compile(r"^/backend/categories$"), "Category", "CREATE", 0
    ),
    AuditRouteConfig(
        "PUT", re.compile(r"^/backend/categories/([^/]+)$"), "Category", "UPDATE", 1
    ),
    AuditRouteConfig(
        "DELETE", re.compile(r"^/backend/categories/([^/]+)$"), "Category", "DELETE", 1
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/categories/([^/]+)/subcategories$"),
        "Subcategory",
        "CREATE",
        1,
    ),
    AuditRouteConfig(
        "POST", re.compile(r"^/backend/subcategories$"), "Subcategory", "CREATE", 0
    ),
    AuditRouteConfig(
        "PUT",
        re.compile(r"^/backend/subcategories/([^/]+)$"),
        "Subcategory",
        "UPDATE",
        1,
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/backend/subcategories/([^/]+)$"),
        "Subcategory",
        "DELETE",
        1,
    ),
    # Request Statuses (5 actions)
    AuditRouteConfig(
        "POST", re.compile(r"^/backend/request-statuses$"), "RequestStatus", "CREATE", 0
    ),
    AuditRouteConfig(
        "PUT",
        re.compile(r"^/backend/request-statuses/([^/]+)$"),
        "RequestStatus",
        "UPDATE",
        1,
    ),
    AuditRouteConfig(
        "PUT",
        re.compile(r"^/backend/request-statuses/([^/]+)/status$"),
        "RequestStatus",
        "UPDATE_STATUS",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/request-statuses/bulk-status$"),
        "RequestStatus",
        "BULK_UPDATE_STATUS",
        0,
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/backend/request-statuses/([^/]+)$"),
        "RequestStatus",
        "DELETE",
        1,
    ),
    # Request Types (5 actions)
    AuditRouteConfig(
        "POST", re.compile(r"^/backend/request-types$"), "RequestType", "CREATE", 0
    ),
    AuditRouteConfig(
        "PUT",
        re.compile(r"^/backend/request-types/([^/]+)$"),
        "RequestType",
        "UPDATE",
        1,
    ),
    AuditRouteConfig(
        "PUT",
        re.compile(r"^/backend/request-types/([^/]+)/status$"),
        "RequestType",
        "UPDATE_STATUS",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/request-types/bulk-status$"),
        "RequestType",
        "BULK_UPDATE_STATUS",
        0,
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/backend/request-types/([^/]+)$"),
        "RequestType",
        "DELETE",
        1,
    ),
    # Priorities (3 actions)
    AuditRouteConfig(
        "POST", re.compile(r"^/backend/priorities$"), "Priority", "CREATE", 0
    ),
    AuditRouteConfig(
        "PUT", re.compile(r"^/backend/priorities/([^/]+)$"), "Priority", "UPDATE", 1
    ),
    AuditRouteConfig(
        "DELETE", re.compile(r"^/backend/priorities/([^/]+)$"), "Priority", "DELETE", 1
    ),
    # Business Units (6 actions)
    AuditRouteConfig(
        "POST", re.compile(r"^/backend/business-units$"), "BusinessUnit", "CREATE", 0
    ),
    AuditRouteConfig(
        "PUT",
        re.compile(r"^/backend/business-units/([^/]+)$"),
        "BusinessUnit",
        "UPDATE",
        1,
    ),
    AuditRouteConfig(
        "PUT",
        re.compile(r"^/backend/business-units/([^/]+)/status$"),
        "BusinessUnit",
        "UPDATE_STATUS",
        1,
    ),
    AuditRouteConfig(
        "PATCH",
        re.compile(r"^/backend/business-units/([^/]+)/working-hours$"),
        "BusinessUnit",
        "UPDATE_WORKING_HOURS",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/business-units/bulk-status$"),
        "BusinessUnit",
        "BULK_UPDATE_STATUS",
        0,
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/backend/business-units/([^/]+)$"),
        "BusinessUnit",
        "DELETE",
        1,
    ),
    # Business Unit Regions (5 actions)
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/business-unit-regions$"),
        "BusinessUnitRegion",
        "CREATE",
        0,
    ),
    AuditRouteConfig(
        "PUT",
        re.compile(r"^/backend/business-unit-regions/([^/]+)$"),
        "BusinessUnitRegion",
        "UPDATE",
        1,
    ),
    AuditRouteConfig(
        "PUT",
        re.compile(r"^/backend/business-unit-regions/([^/]+)/status$"),
        "BusinessUnitRegion",
        "UPDATE_STATUS",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/business-unit-regions/bulk-status$"),
        "BusinessUnitRegion",
        "BULK_UPDATE_STATUS",
        0,
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/backend/business-unit-regions/([^/]+)$"),
        "BusinessUnitRegion",
        "DELETE",
        1,
    ),
    # Technician Assignments (7 actions)
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/business-unit-user-assigns$"),
        "TechnicianAssignment",
        "CREATE",
        0,
    ),
    AuditRouteConfig(
        "PUT",
        re.compile(r"^/backend/business-unit-user-assigns/([^/]+)$"),
        "TechnicianAssignment",
        "UPDATE",
        1,
    ),
    AuditRouteConfig(
        "PUT",
        re.compile(r"^/backend/business-unit-user-assigns/([^/]+)/status$"),
        "TechnicianAssignment",
        "UPDATE_STATUS",
        1,
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/backend/business-unit-user-assigns/([^/]+)$"),
        "TechnicianAssignment",
        "DELETE",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/business-unit-user-assigns/bulk-assign$"),
        "TechnicianAssignment",
        "BULK_ASSIGN",
        0,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/business-unit-user-assigns/bulk-remove$"),
        "TechnicianAssignment",
        "BULK_REMOVE",
        0,
    ),
    # Email Configuration (4 actions)
    AuditRouteConfig(
        "POST", re.compile(r"^/backend/email-configs$"), "EmailConfig", "CREATE", 0
    ),
    AuditRouteConfig(
        "PUT",
        re.compile(r"^/backend/email-configs/([^/]+)$"),
        "EmailConfig",
        "UPDATE",
        1,
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/backend/email-configs/([^/]+)$"),
        "EmailConfig",
        "DELETE",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/email-configs/([^/]+)/test$"),
        "EmailConfig",
        "TEST",
        1,
    ),
    # Active Directory Configuration (4 actions)
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/active-directory-configs$"),
        "ADConfig",
        "CREATE",
        0,
    ),
    AuditRouteConfig(
        "PUT",
        re.compile(r"^/backend/active-directory-configs/([^/]+)$"),
        "ADConfig",
        "UPDATE",
        1,
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/backend/active-directory-configs/([^/]+)$"),
        "ADConfig",
        "DELETE",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/active-directory-configs/([^/]+)/test$"),
        "ADConfig",
        "TEST",
        1,
    ),
    # SLA Configuration (3 actions)
    AuditRouteConfig(
        "POST", re.compile(r"^/backend/sla-configs$"), "SLAConfig", "CREATE", 0
    ),
    AuditRouteConfig(
        "PATCH", re.compile(r"^/backend/sla-configs/([^/]+)$"), "SLAConfig", "UPDATE", 1
    ),
    AuditRouteConfig(
        "DELETE", re.compile(r"^/backend/sla-configs/([^/]+)$"), "SLAConfig", "DELETE", 1
    ),
    # Report Configuration (3 actions)
    AuditRouteConfig(
        "POST", re.compile(r"^/backend/report-configs$"), "ReportConfig", "CREATE", 0
    ),
    AuditRouteConfig(
        "PATCH",
        re.compile(r"^/backend/report-configs/([^/]+)$"),
        "ReportConfig",
        "UPDATE",
        1,
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/backend/report-configs/([^/]+)$"),
        "ReportConfig",
        "DELETE",
        1,
    ),
    # Remote Access (5 actions)
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/requests/([^/]+)/remote-access/request$"),
        "RemoteAccess",
        "REQUEST",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/remote-access/start-by-user/([^/]+)$"),
        "RemoteAccess",
        "START_BY_USER",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/remote-access/([^/]+)/end$"),
        "RemoteAccess",
        "END",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/remote-access/([^/]+)/control$"),
        "RemoteAccess",
        "TOGGLE_CONTROL",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/remote-access/([^/]+)/resume$"),
        "RemoteAccess",
        "RESUME",
        1,
    ),
    # Desktop Sessions (3 actions)
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/sessions/desktop/([^/]+)/disconnect$"),
        "DesktopSession",
        "DISCONNECT",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/sessions/desktop/([^/]+)/push-update$"),
        "DesktopSession",
        "PUSH_UPDATE",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/sessions/desktop/cleanup$"),
        "DesktopSession",
        "CLEANUP",
        0,
    ),
    # Scheduler (5 actions)
    AuditRouteConfig(
        "POST", re.compile(r"^/backend/scheduler/jobs$"), "ScheduledJob", "CREATE", 0
    ),
    AuditRouteConfig(
        "PUT",
        re.compile(r"^/backend/scheduler/jobs/([^/]+)$"),
        "ScheduledJob",
        "UPDATE",
        1,
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/backend/scheduler/jobs/([^/]+)$"),
        "ScheduledJob",
        "DELETE",
        1,
    ),
    AuditRouteConfig(
        "PUT",
        re.compile(r"^/backend/scheduler/jobs/([^/]+)/status$"),
        "ScheduledJob",
        "UPDATE_STATUS",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/scheduler/jobs/([^/]+)/trigger$"),
        "ScheduledJob",
        "TRIGGER",
        1,
    ),
    # Devices (7 actions)
    AuditRouteConfig(
        "PUT", re.compile(r"^/backend/devices/([^/]+)$"), "Device", "UPDATE", 1
    ),
    AuditRouteConfig(
        "POST", re.compile(r"^/backend/devices/manual$"), "Device", "CREATE", 0
    ),
    AuditRouteConfig(
        "POST", re.compile(r"^/backend/devices/discover-ad$"), "Device", "DISCOVER_AD", 0
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/devices/sync-sessions$"),
        "Device",
        "SYNC_SESSIONS",
        0,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/devices/network-scan$"),
        "Device",
        "NETWORK_SCAN",
        0,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/devices/refresh-status$"),
        "Device",
        "REFRESH_STATUS",
        0,
    ),
    AuditRouteConfig(
        "POST", re.compile(r"^/backend/devices/([^/]+)/install$"), "Device", "INSTALL", 1
    ),
    # Deployment Jobs (2 actions)
    AuditRouteConfig(
        "POST", re.compile(r"^/backend/deployment-jobs$"), "DeploymentJob", "CREATE", 0
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/internal/deployment-jobs/([^/]+)/result$"),
        "DeploymentJob",
        "UPDATE_RESULT",
        1,
    ),
    # Client Versions (5 actions)
    AuditRouteConfig(
        "POST", re.compile(r"^/backend/client-versions$"), "ClientVersion", "CREATE", 0
    ),
    AuditRouteConfig(
        "PUT",
        re.compile(r"^/backend/client-versions/([^/]+)$"),
        "ClientVersion",
        "UPDATE",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/client-versions/([^/]+)/set-latest$"),
        "ClientVersion",
        "SET_LATEST",
        1,
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/backend/client-versions/([^/]+)$"),
        "ClientVersion",
        "DELETE",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/client-versions/([^/]+)/installer$"),
        "ClientVersion",
        "UPLOAD_INSTALLER",
        1,
    ),
    # System Events (4 actions)
    AuditRouteConfig(
        "POST", re.compile(r"^/backend/system-events$"), "SystemEvent", "CREATE", 0
    ),
    AuditRouteConfig(
        "PATCH",
        re.compile(r"^/backend/system-events/([^/]+)$"),
        "SystemEvent",
        "UPDATE",
        1,
    ),
    AuditRouteConfig(
        "PATCH",
        re.compile(r"^/backend/system-events/([^/]+)/toggle$"),
        "SystemEvent",
        "TOGGLE",
        1,
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/backend/system-events/([^/]+)$"),
        "SystemEvent",
        "DELETE",
        1,
    ),
    # System Messages (5 actions)
    AuditRouteConfig(
        "POST", re.compile(r"^/backend/system-messages$"), "SystemMessage", "CREATE", 0
    ),
    AuditRouteConfig(
        "PATCH",
        re.compile(r"^/backend/system-messages/([^/]+)$"),
        "SystemMessage",
        "UPDATE",
        1,
    ),
    AuditRouteConfig(
        "PATCH",
        re.compile(r"^/backend/system-messages/([^/]+)/toggle$"),
        "SystemMessage",
        "TOGGLE",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/system-messages/bulk-status$"),
        "SystemMessage",
        "BULK_UPDATE_STATUS",
        0,
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/backend/system-messages/([^/]+)$"),
        "SystemMessage",
        "DELETE",
        1,
    ),
    # Organizational Units (5 actions)
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/organizational-units$"),
        "OrganizationalUnit",
        "CREATE",
        0,
    ),
    AuditRouteConfig(
        "PATCH",
        re.compile(r"^/backend/organizational-units/([^/]+)$"),
        "OrganizationalUnit",
        "UPDATE",
        1,
    ),
    AuditRouteConfig(
        "DELETE",
        re.compile(r"^/backend/organizational-units/([^/]+)$"),
        "OrganizationalUnit",
        "DELETE",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/organizational-units/([^/]+)/toggle$"),
        "OrganizationalUnit",
        "TOGGLE",
        1,
    ),
    AuditRouteConfig(
        "POST",
        re.compile(r"^/backend/organizational-units/sync$"),
        "OrganizationalUnit",
        "SYNC",
        0,
    ),
    # Domain Users (1 action)
    AuditRouteConfig(
        "POST", re.compile(r"^/backend/domain-users/sync$"), "DomainUser", "SYNC", 0
    ),
]


def resolve_route(method: str, path: str) -> Optional[Tuple[str, str, Optional[str]]]:
    """
    Match a request to an audit route config.

    Args:
        method: HTTP method (GET, POST, PUT, PATCH, DELETE)
        path: URL path (e.g., "/backend/users/123")

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
