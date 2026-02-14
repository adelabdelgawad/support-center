"""
Main router registration module.

This module provides the central entry point for router registration,
coordinating all domain-specific router groups under a /backend prefix.

Usage:
    from core.app_setup.routers import register_all_routers
    register_all_routers(app)
"""
import logging

from fastapi import APIRouter, FastAPI

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
    Register all API routers with the FastAPI application under /backend prefix.

    Creates a parent router with /backend prefix and registers all domain routers under it.
    This makes it easy to distinguish frontend API routes from backend routes.

    Args:
        app (FastAPI): FastAPI application instance

    Raises:
        Exception: If router registration fails

    Example:
        register_all_routers(app)
        # All routes will be under /backend/* (e.g., /backend/users, /backend/requests)
    """
    try:
        logger.info("Starting router registration under /backend prefix")

        # Create parent router with /backend prefix
        backend_router = APIRouter(prefix="/backend")

        # Register internal routes first (no authentication required)
        register_internal_routes(backend_router)

        # Register authentication routes (must be before protected routes)
        register_auth_routes(backend_router)

        # Register all other route groups
        register_setting_routes(backend_router)
        register_support_routes(backend_router)
        register_management_routes(backend_router)
        register_reporting_routes(backend_router)

        # Include the parent router in the app
        app.include_router(backend_router)

        logger.info("Successfully registered all routers under /backend")
    except Exception as e:
        logger.error(f"Router registration failed: {e}", exc_info=True)
        raise
