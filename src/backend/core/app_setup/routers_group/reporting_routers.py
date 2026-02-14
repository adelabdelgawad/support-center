"""
Reporting routers module.

This module exports all reporting-related routers:
- reports_router: Report endpoints (prefix in router)
- report_configs_router: Report configuration endpoints (prefix in router)
"""
import logging
from fastapi import APIRouter

from api.routers.reporting.reports_router import router as reports_router
from api.routers.reporting.report_configs_router import router as report_configs_router

logger = logging.getLogger(__name__)

__all__ = ["register_routes"]


def register_routes(router: APIRouter) -> None:
    """
    Register all reporting routers.

    Args:
        router (APIRouter): Parent router to register routes under
    """
    try:
        logger.info("Starting reporting router registration")

        # Reports and report_configs have prefix defined in router
        router.include_router(reports_router)
        router.include_router(report_configs_router)

        logger.info("Successfully registered 2 reporting routers")
    except Exception as e:
        logger.error(f"Failed to register reporting routers: {e}", exc_info=True)
        raise
