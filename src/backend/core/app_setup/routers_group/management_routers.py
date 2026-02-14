"""
Management routers module.

This module exports all management-related routers:
- desktop_sessions_router: Remote desktop session endpoints (/sessions/desktop)
- remote_access_router: Remote access endpoints (/)
- scheduler_router: Scheduler endpoints (/scheduler)
- session_stats_router: Session stats endpoints (/sessions)
- system_events_router: System event endpoints (/system-events)
- turn_router: Turn management endpoints (/turn)
"""
import logging
from fastapi import APIRouter

from api.routers.management.desktop_sessions_router import router as desktop_sessions_router
from api.routers.management.remote_access_router import router as remote_access_router
from api.routers.management.scheduler_router import router as scheduler_router
from api.routers.management.session_stats_router import router as session_stats_router
from api.routers.management.system_events_router import router as system_events_router
from api.routers.management.turn_router import router as turn_router

logger = logging.getLogger(__name__)

__all__ = ["register_routes"]


def register_routes(router: APIRouter) -> None:
    """
    Register all management routers.

    Args:
        router (APIRouter): Parent router to register routes under
    """
    try:
        logger.info("Starting management router registration")

        router.include_router(desktop_sessions_router, prefix="/sessions/desktop", tags=["desktop-sessions"])
        router.include_router(remote_access_router, prefix="", tags=["remote-access"])
        router.include_router(turn_router, prefix="/turn", tags=["turn"])
        router.include_router(session_stats_router, prefix="/sessions", tags=["sessions"])
        router.include_router(system_events_router, prefix="/system-events", tags=["System Events"])
        router.include_router(scheduler_router, prefix="/scheduler", tags=["scheduler"])

        logger.info("Successfully registered 6 management routers")
    except Exception as e:
        logger.error(f"Failed to register management routers: {e}", exc_info=True)
        raise
