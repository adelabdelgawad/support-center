"""
Support routers module.

This module exports all support request-related routers:
- requests_router: Service request endpoints (/requests)
- chat_router: Chat endpoints (/chat)
- screenshots_router: Screenshot endpoints (/screenshots)
- files_router: File attachment endpoints (/files)
- chat_files_router: Chat file endpoints (/chat-files)
- notifications_router: Notification endpoints (/notifications)
- request_notes_router: Request note endpoints (/request-notes)
- request_details_metadata_router: Metadata endpoint (/request-details-metadata)
- search_router: Search endpoints (/search)
"""
import logging
from fastapi import FastAPI

from api.routers.support.chat_files_router import router as chat_files_router
from api.routers.support.chat_router import router as chat_router
from api.routers.support.files_router import router as files_router
from api.routers.support.notifications_router import router as notifications_router
from api.routers.support.request_details_metadata_router import router as request_details_metadata_router
from api.routers.support.request_notes_router import router as request_notes_router
from api.routers.support.requests_router import router as requests_router
from api.routers.support.screenshots_router import router as screenshots_router
from api.routers.support.search_router import router as search_router

logger = logging.getLogger(__name__)

__all__ = ["register_routes"]


def register_routes(app: FastAPI) -> None:
    """
    Register all support routers with the FastAPI application.

    Args:
        app (FastAPI): FastAPI application instance
    """
    try:
        logger.info("Starting support router registration")

        app.include_router(request_details_metadata_router, prefix="/request-details-metadata", tags=["metadata"])
        app.include_router(request_notes_router, prefix="/request-notes", tags=["request-notes"])
        app.include_router(requests_router, prefix="/requests", tags=["requests"])
        app.include_router(screenshots_router, prefix="/screenshots", tags=["screenshots"])
        app.include_router(chat_router, prefix="/chat", tags=["chat"])
        app.include_router(notifications_router, prefix="/notifications", tags=["notifications"])
        app.include_router(search_router, prefix="/search", tags=["search"])
        app.include_router(files_router, prefix="/files", tags=["files"])
        app.include_router(chat_files_router, prefix="/chat-files", tags=["chat-files"])

        logger.info("Successfully registered 9 support routers")
    except Exception as e:
        logger.error(f"Failed to register support routers: {e}", exc_info=True)
        raise
