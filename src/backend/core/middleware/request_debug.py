"""
Request debugging middleware to capture invalid HTTP requests.

This middleware helps diagnose "Invalid HTTP request received" warnings
by logging raw request data before uvicorn's HTTP parser processes it.
"""

import logging
import traceback
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send

logger = logging.getLogger("request_debug")
logger.setLevel(logging.DEBUG)


class RequestDebugMiddleware(BaseHTTPMiddleware):
    """
    Middleware to debug invalid HTTP requests.

    Logs request details including raw data, headers, and connection info
    to help diagnose malformed requests causing uvicorn warnings.
    """

    async def dispatch(self, request: Request, call_next: Callable):
        """Process the request and log detailed debugging info."""
        try:
            # Log basic request info
            logger.info(
                f"📥 Incoming request: {request.method} {request.url.path} "
                f"from {request.client.host if request.client else 'unknown'}:{request.client.port if request.client else 'unknown'}"
            )

            # Log request details
            logger.debug(f"   Protocol: {request.scope.get('scheme', 'unknown')}://{request.url.netloc}")
            logger.debug(f"   HTTP Version: {request.scope.get('http_version', 'unknown')}")
            logger.debug(f"   Path: {request.url.path}")
            logger.debug(f"   Query: {request.url.query or 'none'}")

            # Log headers (with sensitive data redacted)
            safe_headers = {}
            for key, value in request.headers.items():
                if key.lower() in {"authorization", "cookie", "x-api-key"}:
                    safe_headers[key] = "[REDACTED]"
                else:
                    safe_headers[key] = value
            logger.debug(f"   Headers: {safe_headers}")

            # Process request
            response = await call_next(request)

            logger.info(f"✅ Response: {response.status_code} for {request.method} {request.url.path}")
            return response

        except Exception as e:
            logger.error(
                f"❌ Error processing request: {request.method} {request.url.path if hasattr(request, 'url') else 'unknown'} "
                f"- Error: {type(e).__name__}: {str(e)}"
            )
            logger.error(f"   Traceback: {traceback.format_exc()}")
            raise


class RawRequestLogger:
    """
    ASGI middleware to log raw request data before HTTP parsing.

    This catches requests at the ASGI level, before FastAPI/Starlette
    processes them, allowing us to see malformed requests that cause
    "Invalid HTTP request received" warnings.
    """

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        """Intercept ASGI calls to log raw request data."""
        if scope["type"] == "http":
            logger.info(
                f"🔍 [RAW] HTTP connection from {scope.get('client', ['unknown', 0])[0]}:{scope.get('client', ['unknown', 0])[1]}"
            )
            logger.debug(f"   [RAW] Method: {scope.get('method', 'unknown')}")
            logger.debug(f"   [RAW] Path: {scope.get('path', 'unknown')}")
            logger.debug(f"   [RAW] Scheme: {scope.get('scheme', 'unknown')}")
            logger.debug(f"   [RAW] HTTP Version: {scope.get('http_version', 'unknown')}")

            # Log raw headers
            headers = scope.get("headers", [])
            logger.debug(f"   [RAW] Header count: {len(headers)}")
            for name, value in headers:
                try:
                    header_name = name.decode("latin1")
                    # Redact sensitive headers
                    if header_name.lower() in {"authorization", "cookie"}:
                        logger.debug(f"   [RAW] Header: {header_name}: [REDACTED]")
                    else:
                        header_value = value.decode("latin1")
                        logger.debug(f"   [RAW] Header: {header_name}: {header_value}")
                except Exception as e:
                    logger.error(f"   [RAW] Failed to decode header: {e}")

            # Wrap receive to log body data
            original_receive = receive
            body_chunks = []

            async def logging_receive():
                message = await original_receive()
                if message["type"] == "http.request":
                    body = message.get("body", b"")
                    if body:
                        body_chunks.append(body)
                        logger.debug(f"   [RAW] Body chunk received: {len(body)} bytes")
                        # Log first 200 bytes of body for debugging (be careful with binary data)
                        try:
                            preview = body[:200].decode("utf-8", errors="replace")
                            logger.debug(f"   [RAW] Body preview: {preview}")
                        except Exception as e:
                            logger.debug(f"   [RAW] Body preview failed (binary data?): {e}")
                return message

            try:
                await self.app(scope, logging_receive, send)
                logger.info(f"✅ [RAW] Request completed successfully")
            except Exception as e:
                logger.error(f"❌ [RAW] Request failed: {type(e).__name__}: {str(e)}")
                logger.error(f"   [RAW] Traceback: {traceback.format_exc()}")
                raise
        else:
            # Not HTTP (websocket, lifespan, etc)
            logger.debug(f"🔍 [RAW] Non-HTTP connection type: {scope['type']}")
            await self.app(scope, receive, send)
