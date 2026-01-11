"""
Debug logging middleware for request troubleshooting.

SECURITY: Only enabled when DEBUG=True.
Sensitive headers (Authorization, Cookie) are redacted.
"""

import logging
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware


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

        logger = logging.getLogger("debug")

        # Sanitize headers before logging
        safe_headers = {}
        for key, value in request.headers.items():
            if key.lower() in self.SENSITIVE_HEADERS:
                safe_headers[key] = "[REDACTED]"
            else:
                safe_headers[key] = value

        # Log request details (with sanitized headers)
        logger.info(f"🔍 Request: {request.method} {request.url.path}")
        logger.info(f"   Origin: {request.headers.get('origin', 'NONE')}")
        logger.info(f"   Host: {request.headers.get('host', 'NONE')}")
        logger.info(f"   User-Agent: {request.headers.get('user-agent', 'NONE')}")
        logger.info(f"   Content-Type: {request.headers.get('content-type', 'NONE')}")
        logger.info(f"   Headers: {safe_headers}")

        try:
            response = await call_next(request)
            logger.info(f"   ✅ Response: {response.status_code}")
            return response
        except Exception as e:
            logger.error(f"   ❌ Error: {str(e)}", exc_info=True)
            raise
