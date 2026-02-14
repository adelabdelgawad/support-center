"""
Internal routers module.

This module exports all internal-related routers:
- internal_router: Internal endpoints (/internal)
- events_router: Internal event endpoints (/events)
"""
import logging
from fastapi import FastAPI

from api.routers.internal.events_router import router as events_router
from api.routers.internal.internal_router import router as internal_router

logger = logging.getLogger(__name__)

__all__ = ["register_routes"]


def register_routes(app: FastAPI) -> None:
    """
    Register all internal routers with the FastAPI application.

    Args:
        app (FastAPI): FastAPI application instance
    """
    try:
        logger.info("Starting internal router registration")

        app.include_router(internal_router, prefix="/internal", tags=["internal"])
        app.include_router(events_router, prefix="/events", tags=["Events"])

        logger.info("Successfully registered 2 internal routers")
    except Exception as e:
        logger.error(f"Failed to register internal routers: {e}", exc_info=True)
        raise
