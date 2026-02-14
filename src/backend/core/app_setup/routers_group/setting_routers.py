"""
Setting routers module.

This module exports all setting/administration-related routers:
- users_router: User management endpoints (/users)
- roles_router: Role management endpoints (/roles)
- pages_router: Page management endpoints (/pages)
- business_units_router: Business unit endpoints (/business-units)
- categories_router: Category endpoints (/categories)
- priorities_router: Priority endpoints (/priorities)
- request_types_router: Request type endpoints (/request-types)
- request_status_router: Request status endpoints (/request-status)
- sla_configs_router: SLA configuration endpoints (prefix in router)
- sections_router: Section endpoints (/sections)
- active_directory_config_router: AD configuration endpoints (/active-directory-configs)
- domain_users_router: Domain user sync endpoints (/domain-users)
- organizational_units_router: OU endpoints (/organizational-units)
- business_unit_regions_router: BU region endpoints (/business-unit-regions)
- business_unit_user_assigns_router: BU user assignment endpoints (/business-unit-user-assigns)
- email_config_router: Email configuration endpoints (/email-configs)
- system_messages_router: System message endpoints (/system-messages)
- user_custom_views_router: User custom view endpoints (/user-custom-views)
"""
import logging
from fastapi import FastAPI

from api.routers.setting.active_directory_config_router import router as active_directory_config_router
from api.routers.setting.business_unit_regions_router import router as business_unit_regions_router
from api.routers.setting.business_unit_user_assigns_router import router as business_unit_user_assigns_router
from api.routers.setting.business_units_router import router as business_units_router
from api.routers.setting.categories_router import router as categories_router
from api.routers.setting.domain_users_router import router as domain_users_router
from api.routers.setting.email_config_router import router as email_config_router
from api.routers.setting.organizational_units_router import router as organizational_units_router
from api.routers.setting.pages_router import router as pages_router
from api.routers.setting.priorities_router import router as priorities_router
from api.routers.setting.request_status_router import router as request_status_router
from api.routers.setting.request_types_router import router as request_types_router
from api.routers.setting.roles_router import router as roles_router
from api.routers.setting.sections_router import router as sections_router
from api.routers.setting.sla_configs_router import router as sla_configs_router
from api.routers.setting.system_messages_router import router as system_messages_router
from api.routers.setting.user_custom_views_router import router as user_custom_views_router
from api.routers.setting.users_router import router as users_router

logger = logging.getLogger(__name__)

__all__ = ["register_routes"]


def register_routes(app: FastAPI) -> None:
    """
    Register all setting/administration routers with the FastAPI application.

    Args:
        app (FastAPI): FastAPI application instance
    """
    try:
        logger.info("Starting setting router registration")

        app.include_router(active_directory_config_router, prefix="/active-directory-configs", tags=["active-directory"])
        app.include_router(email_config_router, prefix="/email-configs", tags=["email"])
        app.include_router(users_router, prefix="/users", tags=["users"])
        app.include_router(domain_users_router, prefix="/domain-users", tags=["domain-users"])
        app.include_router(organizational_units_router, prefix="/organizational-units", tags=["organizational-units"])
        app.include_router(request_status_router, prefix="/request-statuses", tags=["request-statuses"])
        app.include_router(priorities_router, prefix="/priorities", tags=["priorities"])
        app.include_router(request_types_router, prefix="/request-types", tags=["request-types"])
        app.include_router(categories_router, prefix="/categories", tags=["categories"])
        app.include_router(sections_router, prefix="/sections", tags=["sections"])
        app.include_router(business_unit_regions_router, prefix="/business-unit-regions", tags=["business-unit-regions"])
        app.include_router(business_units_router, prefix="/business-units", tags=["business-units"])
        app.include_router(business_unit_user_assigns_router, prefix="/business-unit-user-assigns", tags=["business-unit-user-assigns"])
        app.include_router(roles_router, prefix="/roles", tags=["roles"])
        app.include_router(pages_router, prefix="/pages", tags=["pages"])
        app.include_router(system_messages_router, prefix="/system-messages", tags=["System Messages"])
        app.include_router(user_custom_views_router, prefix="/user-custom-views", tags=["user-custom-views"])
        # SLA configs, reports, and report_configs have prefix defined in router
        app.include_router(sla_configs_router)

        logger.info("Successfully registered 17 setting routers")
    except Exception as e:
        logger.error(f"Failed to register setting routers: {e}", exc_info=True)
        raise
