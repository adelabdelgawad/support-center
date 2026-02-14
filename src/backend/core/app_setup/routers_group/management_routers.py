"""
Management routers module.

This module exports all management-related routers:
- desktop_sessions_router: Remote desktop session endpoints (/sessions/desktop)
- remote_access_router: Remote access endpoints (/)
- devices_router: Device management endpoints (/devices)
- deployment_jobs_router: Deployment job endpoints (/deployment-jobs)
- scheduler_router: Scheduler endpoints (/scheduler)
- session_stats_router: Session stats endpoints (/sessions)
- system_events_router: System event endpoints (/system-events)
- client_versions_router: Client version endpoints (/client-versions)
- turn_router: Turn management endpoints (/turn)
"""
import logging
from fastapi import FastAPI

from api.routers.management.client_versions_router import router as client_versions_router
from api.routers.management.deployment_jobs_router import router as deployment_jobs_router
from api.routers.management.desktop_sessions_router import router as desktop_sessions_router
from api.routers.management.devices_router import router as devices_router
from api.routers.management.remote_access_router import router as remote_access_router
from api.routers.management.scheduler_router import router as scheduler_router
from api.routers.management.session_stats_router import router as session_stats_router
from api.routers.management.system_events_router import router as system_events_router
from api.routers.management.turn_router import router as turn_router

logger = logging.getLogger(__name__)

__all__ = ["register_routes"]


def register_routes(app: FastAPI) -> None:
    """
    Register all management routers with the FastAPI application.

    Args:
        app (FastAPI): FastAPI application instance
    """
    try:
        logger.info("Starting management router registration")

        app.include_router(client_versions_router, prefix="/client-versions", tags=["client-versions"])
        app.include_router(deployment_jobs_router, prefix="/deployment-jobs", tags=["deployment-jobs"])
        app.include_router(desktop_sessions_router, prefix="/sessions/desktop", tags=["desktop-sessions"])
        app.include_router(devices_router, prefix="/devices", tags=["devices"])
        app.include_router(remote_access_router, prefix="", tags=["remote-access"])
        app.include_router(turn_router, prefix="/turn", tags=["turn"])
        app.include_router(session_stats_router, prefix="/sessions", tags=["sessions"])
        app.include_router(system_events_router, prefix="/system-events", tags=["System Events"])
        app.include_router(scheduler_router, prefix="/scheduler", tags=["scheduler"])

        logger.info("Successfully registered 9 management routers")
    except Exception as e:
        logger.error(f"Failed to register management routers: {e}", exc_info=True)
        raise
