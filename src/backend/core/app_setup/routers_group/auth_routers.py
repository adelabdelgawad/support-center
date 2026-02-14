"""
Authentication routers module.

This module exports all authentication-related routers:
- auth_router: Authentication endpoints (/auth)
- audit_router: Audit log endpoints (/audit)
"""
import logging
from fastapi import FastAPI

from api.routers.auth.auth_router import router as auth_router
from api.routers.auth.audit_router import router as audit_router

logger = logging.getLogger(__name__)

__all__ = ["register_routes"]


def register_routes(app: FastAPI) -> None:
    """
    Register all authentication routers with the FastAPI application.

    Args:
        app (FastAPI): FastAPI application instance
    """
    try:
        logger.info("Starting authentication router registration")

        app.include_router(auth_router, prefix="/auth", tags=["Authentication"])
        app.include_router(audit_router, prefix="/audit", tags=["Audit"])

        logger.info("Successfully registered 2 authentication routers")
    except Exception as e:
        logger.error(f"Failed to register authentication routers: {e}", exc_info=True)
        raise
