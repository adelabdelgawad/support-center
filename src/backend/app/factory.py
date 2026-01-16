"""
Application factory for FastAPI.

This module provides the create_app() function that creates and configures
the FastAPI application instance.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from api.v1 import api_router
from app.routes import root_router, health_router
from core.config import settings
from core.instrumentator import instrumentator
from core.lifespan import lifespan
from core.middleware import (
    DebugLoggingMiddleware,
    SecurityHeadersMiddleware,
    OriginValidationMiddleware,
    RequestDebugMiddleware,
    RawRequestLogger,
)


def create_app() -> FastAPI:
    """
    Application factory function.

    Creates and configures the FastAPI application with all necessary
    middleware, routes, and instrumentation.

    Returns:
        FastAPI: Configured FastAPI application instance
    """
    # Rate limiter instance
    limiter = Limiter(key_func=get_remote_address)

    # Create FastAPI app
    app = FastAPI(
        title=settings.api.app_name,
        version=settings.api.app_version,
        description="High-performance service catalog system with FastAPI and SQLModel",
        lifespan=lifespan,
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
    )

    # Add rate limiter
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # Raw request logging at ASGI level (only when explicitly enabled)
    # WARNING: Very verbose, use only for debugging invalid HTTP requests
    if settings.logging.enable_raw_request_logging:
        app.add_middleware(RawRequestLogger)

    # Request debug middleware (enabled via LOG_ENABLE_REQUEST_DEBUG)
    if settings.logging.enable_request_debug:
        app.add_middleware(RequestDebugMiddleware)

    # Debug logging middleware (only enabled when DEBUG=True)
    if settings.api.debug:
        app.add_middleware(DebugLoggingMiddleware)

    # CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors.origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "Accept", "Origin", "X-Requested-With", "X-Client-Private-IP"],
        expose_headers=["X-Total-Count", "X-Page", "X-Per-Page"],
    )

    # Security headers middleware (added after CORS)
    app.add_middleware(SecurityHeadersMiddleware)

    # Origin validation middleware for CSRF protection (Finding #18)
    # Note: Added after CORS middleware to work with preflight requests
    app.add_middleware(OriginValidationMiddleware)

    # Include routers
    app.include_router(root_router)
    app.include_router(health_router)
    app.include_router(api_router, prefix=settings.api.api_v1_prefix)

    # Instrumentation
    instrumentator.instrument(app)
    instrumentator.expose(app, endpoint="/metrics")

    return app
