"""
Internal routers module.

This module exports all internal-related routers:
- events_router: Internal event endpoints (/events) - Redis Streams monitoring
- health_router: Health check endpoints (/health/*) - System health monitoring
"""
import logging
from fastapi import APIRouter

from api.routers.internal.events_router import router as events_router
from api.routers.internal.health_router import router as health_router

logger = logging.getLogger(__name__)

__all__ = ["register_routes"]


def register_routes(router: APIRouter) -> None:
    """
    Register all internal routers.

    Args:
        router (APIRouter): Parent router to register routes under
    """
    try:
        logger.info("Starting internal router registration")

        # Register health check routes first (no authentication required)
        router.include_router(health_router, prefix="/health", tags=["Health"])

        # Register events router
        router.include_router(events_router, prefix="/events", tags=["Events"])

        logger.info("Successfully registered 2 internal routers")
    except Exception as e:
        logger.error(f"Failed to register internal routers: {e}", exc_info=True)
        raise
