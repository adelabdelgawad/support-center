"""
Debug logging middleware for request troubleshooting.

SECURITY: Only enabled when DEBUG=True.
Sensitive headers (Authorization, Cookie) are redacted.
"""

import logging
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

from core.config import settings


class DebugLoggingMiddleware(BaseHTTPMiddleware):
    """
    Debug middleware to log request details for troubleshooting.

    SECURITY: Only enabled when DEBUG=True.
    Sensitive headers (Authorization, Cookie) are redacted.
    """

    # Headers that should never be logged in full
    SENSITIVE_HEADERS = {"authorization", "cookie", "x-api-key", "x-worker-token"}

    async def dispatch(self, request: Request, call_next):
        # SECURITY: Only log in debug mode
        if not settings.api.debug:
            return await call_next(request)

        logger = logging.getLogger("debug")

        # Sanitize headers before logging
        safe_headers = {}
        for key, value in request.headers.items():
            if key.lower() in self.SENSITIVE_HEADERS:
                safe_headers[key] = "[REDACTED]"
            else:
                safe_headers[key] = value

        # Log request details (with sanitized headers)
        logger.debug(f"🔍 Request: {request.method} {request.url.path}")
        logger.debug(f"   Origin: {request.headers.get('origin', 'NONE')}")
        logger.debug(f"   Host: {request.headers.get('host', 'NONE')}")
        logger.debug(f"   User-Agent: {request.headers.get('user-agent', 'NONE')}")
        logger.debug(f"   Content-Type: {request.headers.get('content-type', 'NONE')}")
        logger.debug(f"   Headers: {safe_headers}")

        try:
            response = await call_next(request)
            logger.debug(f"   ✅ Response: {response.status_code}")
            return response
        except Exception as e:
            logger.error(f"   ❌ Error: {str(e)}", exc_info=True)
            raise
