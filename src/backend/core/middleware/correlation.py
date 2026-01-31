"""
Correlation ID middleware for distributed request tracing.

Adds X-Correlation-ID header to all requests and responses for tracking
requests across multiple services and through logs.
"""

import uuid
from contextvars import ContextVar
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

# Context variable to store correlation ID for the current request
correlation_id_var: ContextVar[str] = ContextVar("correlation_id", default="")


def get_correlation_id() -> str:
    """
    Get the correlation ID for the current request.

    Returns:
        str: Correlation ID or empty string if not set
    """
    return correlation_id_var.get("")


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """
    Middleware to add correlation ID to requests and responses.

    - Extracts or generates X-Correlation-ID for each request
    - Stores in context variable for access in logs and services
    - Adds to response headers for client-side tracking
    """

    def __init__(self, app: ASGIApp):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """
        Process request and add correlation ID.

        Args:
            request: Incoming HTTP request
            call_next: Next middleware in chain

        Returns:
            Response with X-Correlation-ID header
        """
        # Extract correlation ID from request header or generate new one
        correlation_id = request.headers.get("X-Correlation-ID")

        if not correlation_id:
            # Generate new UUID if not provided
            correlation_id = str(uuid.uuid4())

        # Store in context variable for access in application code
        correlation_id_var.set(correlation_id)

        # Process request
        response = await call_next(request)

        # Add correlation ID to response headers
        response.headers["X-Correlation-ID"] = correlation_id

        return response
