"""
Reporting routers module.

This module exports all reporting-related routers:
- reports_router: Report endpoints (prefix in router)
- report_configs_router: Report configuration endpoints (prefix in router)
"""
import logging
from fastapi import FastAPI

from api.routers.reporting.reports_router import router as reports_router
from api.routers.reporting.report_configs_router import router as report_configs_router

logger = logging.getLogger(__name__)

__all__ = ["register_routes"]


def register_routes(app: FastAPI) -> None:
    """
    Register all reporting routers with the FastAPI application.

    Args:
        app (FastAPI): FastAPI application instance
    """
    try:
        logger.info("Starting reporting router registration")

        # Reports and report_configs have prefix and tags defined in their routers
        app.include_router(reports_router)
        app.include_router(report_configs_router)

        logger.info("Successfully registered 2 reporting routers")
    except Exception as e:
        logger.error(f"Failed to register reporting routers: {e}", exc_info=True)
        raise
