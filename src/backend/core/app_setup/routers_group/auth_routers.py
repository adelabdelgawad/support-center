"""
Authentication routers module.

This module exports all authentication-related routers:
- auth_router: Authentication endpoints (/auth)
- audit_router: Audit log endpoints (/audit)
"""
import logging
from fastapi import APIRouter

from api.routers.auth.auth_router import router as auth_router
from api.routers.auth.audit_router import router as audit_router

logger = logging.getLogger(__name__)

__all__ = ["register_routes"]


def register_routes(router: APIRouter) -> None:
    """
    Register all authentication routers.

    Args:
        router (APIRouter): Parent router to register routes under
    """
    try:
        logger.info("Starting authentication router registration")

        router.include_router(auth_router, prefix="/auth", tags=["Authentication"])
        router.include_router(audit_router, prefix="/audit", tags=["Audit"])

        logger.info("Successfully registered 2 authentication routers")
    except Exception as e:
        logger.error(f"Failed to register authentication routers: {e}", exc_info=True)
        raise
