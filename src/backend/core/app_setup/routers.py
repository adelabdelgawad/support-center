"""
Main router registration module.

This module provides the central entry point for router registration,
coordinating all domain-specific router groups.

Usage:
    from core.app_setup.routers import register_all_routers
    register_all_routers(app)
"""
import logging

from fastapi import FastAPI

# Import grouped router registration modules
from core.app_setup.routers_group.auth_routers import (
    register_routes as register_auth_routes,
)
from core.app_setup.routers_group.setting_routers import (
    register_routes as register_setting_routes,
)
from core.app_setup.routers_group.support_routers import (
    register_routes as register_support_routes,
)
from core.app_setup.routers_group.management_routers import (
    register_routes as register_management_routes,
)
from core.app_setup.routers_group.reporting_routers import (
    register_routes as register_reporting_routes,
)
from core.app_setup.routers_group.internal_routers import (
    register_routes as register_internal_routes,
)

logger = logging.getLogger(__name__)

__all__ = ["register_all_routers"]


def register_all_routers(app: FastAPI) -> None:
    """
    Register all API routers with the FastAPI application.

    Iterates through each router group and calls their registration function.

    Args:
        app (FastAPI): FastAPI application instance

    Raises:
        Exception: If router registration fails

    Example:
        register_all_routers(app)
    """
    try:
        logger.info("Starting router registration")

        # Register internal routes first (no authentication required)
        register_internal_routes(app)

        # Register authentication routes (must be before protected routes)
        register_auth_routes(app)

        # Register all other route groups
        register_setting_routes(app)
        register_support_routes(app)
        register_management_routes(app)
        register_reporting_routes(app)

        logger.info("Successfully registered all routers")
    except Exception as e:
        logger.error(f"Router registration failed: {e}", exc_info=True)
        raise
