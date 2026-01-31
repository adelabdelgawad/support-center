"""
API v1 routes.

REFACTORED:
- Organized endpoints into subdirectories: auth, setting, support, management, reporting, internal
- Re-added business_unit_user_assigns endpoints for technician-to-business-unit assignments
"""

from fastapi import APIRouter

# Import from subdirectories
from .endpoints.auth import audit, auth
from .endpoints.setting import (
    active_directory_config,
    business_unit_regions,
    business_unit_user_assigns,
    business_units,
    categories,
    domain_users,
    email_config,
    organizational_units,
    pages,
    priorities,
    request_status,
    request_types,
    roles,
    service_sections,
    sla_configs,
    system_messages,
    tags,
    user_custom_views,
    users,
)
from .endpoints.support import (
    chat,
    chat_files,
    files,
    notifications,
    request_details_metadata,
    request_notes,
    requests,
    screenshots,
    search,
)
from .endpoints.management import (
    client_versions,
    deployment_jobs,
    desktop_sessions,
    devices,
    remote_access,
    scheduler,
    session_stats,
    system_events,
    turn,
)
from .endpoints.reporting import report_configs, reports
from .endpoints.internal import events, internal

api_router = APIRouter()

# Include all endpoint routers
api_router.include_router(
    active_directory_config.router,
    prefix="/active-directory-configs",
    tags=["active-directory"],
)

api_router.include_router(
    email_config.router,
    prefix="/email-configs",
    tags=["email"],
)

api_router.include_router(audit.router, prefix="/audit", tags=["audit"])

api_router.include_router(users.router, prefix="/users", tags=["users"])

api_router.include_router(
    domain_users.router, prefix="/domain-users", tags=["domain-users"]
)

api_router.include_router(
    organizational_units.router,
    prefix="/organizational-units",
    tags=["organizational-units"],
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
    request_details_metadata.router,
    prefix="/request-details-metadata",
    tags=["metadata"],
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

# Scheduler Management
api_router.include_router(
    scheduler.router, prefix="/scheduler", tags=["scheduler"]
)

# Events Monitoring (Redis Streams)
api_router.include_router(
    events.router, prefix="/events", tags=["Events"]
)
