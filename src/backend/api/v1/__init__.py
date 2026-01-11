"""
API v1 routes.

REFACTORED:
- Re-added business_unit_user_assigns endpoints for technician-to-business-unit assignments
"""

from fastapi import APIRouter

from .endpoints import (
    auth,
    business_unit_regions,
    business_unit_user_assigns,
    business_units,
    categories,
    chat,
    chat_files,
    client_versions,
    deployment_jobs,
    desktop_sessions,
    devices,
    domain_users,
    files,
    internal,
    notifications,
    pages,
    priorities,
    remote_access,
    report_configs,
    reports,
    request_notes,
    request_status,
    request_types,
    requests,
    roles,
    screenshots,
    search,
    service_sections,
    session_stats,
    sla_configs,
    system_events,
    system_messages,
    tags,
    turn,
    user_custom_views,
    users,
)

api_router = APIRouter()

# Include all endpoint routers
api_router.include_router(users.router, prefix="/users", tags=["users"])

api_router.include_router(
    domain_users.router, prefix="/domain-users", tags=["domain-users"]
)

api_router.include_router(
    request_status.router,
    prefix="/request-statuses",
    tags=["request-statuses"],
)

api_router.include_router(
    requests.router, prefix="/requests", tags=["requests"]
)

api_router.include_router(
    priorities.router, prefix="/priorities", tags=["priorities"]
)

api_router.include_router(
    client_versions.router, prefix="/client-versions", tags=["client-versions"]
)

api_router.include_router(
    request_types.router, prefix="/request-types", tags=["request-types"]
)

api_router.include_router(
    categories.router, prefix="/categories", tags=["categories"]
)

api_router.include_router(
    tags.router, prefix="/tags", tags=["tags"]
)

api_router.include_router(
    service_sections.router,
    prefix="/service-sections",
    tags=["service-sections"],
)

api_router.include_router(
    business_unit_regions.router,
    prefix="/business-unit-regions",
    tags=["business-unit-regions"],
)

api_router.include_router(
    business_units.router, prefix="/business-units", tags=["business-units"]
)

api_router.include_router(
    business_unit_user_assigns.router,
    prefix="/business-unit-user-assigns",
    tags=["business-unit-user-assigns"],
)

api_router.include_router(
    request_notes.router, prefix="/request-notes", tags=["request-notes"]
)

api_router.include_router(
    remote_access.router, prefix="", tags=["remote-access"]
)

api_router.include_router(turn.router, prefix="/turn", tags=["turn"])

api_router.include_router(
    desktop_sessions.router, prefix="/sessions/desktop", tags=["desktop-sessions"]
)

api_router.include_router(
    session_stats.router, prefix="/sessions", tags=["sessions"]
)

api_router.include_router(chat.router, prefix="/chat", tags=["chat"])

api_router.include_router(
    notifications.router, prefix="/notifications", tags=["notifications"]
)

api_router.include_router(search.router, prefix="/search", tags=["search"])

api_router.include_router(files.router, prefix="/files", tags=["files"])

api_router.include_router(
    screenshots.router, prefix="/screenshots", tags=["screenshots"]
)

api_router.include_router(
    chat_files.router, prefix="/chat-files", tags=["chat-files"]
)

api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])

api_router.include_router(roles.router, prefix="/roles", tags=["roles"])

api_router.include_router(pages.router, prefix="/pages", tags=["pages"])

api_router.include_router(
    system_events.router, prefix="/system-events", tags=["System Events"]
)

api_router.include_router(
    system_messages.router, prefix="/system-messages", tags=["System Messages"]
)

api_router.include_router(
    user_custom_views.router,
    prefix="/user-custom-views",
    tags=["user-custom-views"],
)

# Reporting & Analytics
api_router.include_router(reports.router)  # prefix and tags defined in router

api_router.include_router(sla_configs.router)  # prefix and tags defined in router

api_router.include_router(report_configs.router)  # prefix and tags defined in router

# Deployment Control Plane
api_router.include_router(devices.router, prefix="/devices", tags=["devices"])
api_router.include_router(
    deployment_jobs.router, prefix="/deployment-jobs", tags=["deployment-jobs"]
)
api_router.include_router(internal.router, prefix="/internal", tags=["internal"])
