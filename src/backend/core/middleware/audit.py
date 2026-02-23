"""
Audit middleware for automatic tracking of mutation requests.

Intercepts POST/PUT/PATCH/DELETE requests and creates audit log entries.
"""

import asyncio
import logging
from typing import Callable
from uuid import UUID

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from core.audit_config import audit_handled_var, is_mutation_method, resolve_route
from core.middleware.correlation import get_correlation_id
from api.schemas.audit import AuditCreate
from api.services.audit_service import AuditService

logger = logging.getLogger(__name__)


def _extract_user_id(request: Request) -> UUID | None:
    """
    Extract user_id from JWT without DB query.

    Args:
        request: FastAPI request

    Returns:
        User UUID or None if not authenticated/parsable
    """
    try:
        from core.security import decode_token

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return None

        token = auth_header.split(" ", 1)[1]
        payload = decode_token(token)
        sub = payload.get("sub")

        if sub:
            return UUID(sub)
        return None
    except Exception:
        # Graceful fallback for auth endpoints or invalid tokens
        return None


def _extract_ip_address(request: Request) -> str | None:
    """
    Extract client IP address from request.

    Args:
        request: FastAPI request

    Returns:
        IP address or None
    """
    try:
        from core.dependencies import get_client_ip

        # Use the existing get_client_ip function
        return get_client_ip(request)
    except Exception:
        # Fallback: try to get from headers directly
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()

        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip

        # Last resort: client host (may not work in all cases)
        return request.client.host if request.client else None


class AuditMiddleware(BaseHTTPMiddleware):
    """
    Automatically creates audit log entries for all mutation requests.

    - Intercepts POST, PUT, PATCH, DELETE requests
    - Maps URL to resource_type/action via audit_config
    - Extracts user_id from JWT (no DB query)
    - Creates audit entry in background task with isolated DB session
    - Never blocks or fails the actual request

    Flow:
    1. Check if mutation method
    2. Skip non-auditable routes
    3. Resolve route → (resource_type, action, resource_id)
    4. Execute endpoint via call_next(request)
    5. On 2xx response: fire-and-forget audit log creation
    """

    MUTATION_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

    def __init__(self, app: ASGIApp):
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """
        Process request and create audit log on mutations.

        Args:
            request: FastAPI request
            call_next: Next middleware in chain

        Returns:
            Response
        """
        method = request.method.upper()
        path = request.url.path

        # Reset ContextVar for each request to prevent leakage
        audit_handled_var.set(False)

        # Step 1: Check if mutation method
        if not is_mutation_method(method):
            return await call_next(request)

        # Step 2: Resolve route configuration
        route_info = resolve_route(method, path)
        if route_info is None:
            return await call_next(request)

        resource_type, action, resource_id = route_info

        # Step 3: Execute endpoint
        response = await call_next(request)

        # Step 4: Only audit successful responses (2xx) that weren't already handled
        if 200 <= response.status_code < 300 and not audit_handled_var.get(False):
            try:
                # Extract metadata
                user_id = _extract_user_id(request)
                ip_address = _extract_ip_address(request)
                correlation_id = get_correlation_id()
                user_agent = request.headers.get("User-Agent")

                # Create audit entry in background (fire-and-forget)
                asyncio.create_task(
                    AuditService.create_audit_log_background(
                        AuditCreate(
                            user_id=user_id,
                            action=action,
                            resource_type=resource_type,
                            resource_id=resource_id,
                            ip_address=ip_address,
                            endpoint=f"{method} {path}",
                            correlation_id=correlation_id,
                            user_agent=user_agent,
                            old_values=None,
                            new_values=None,
                            changes_summary=None,
                        )
                    )
                )

                logger.debug(
                    f"Audit background task created: {action} on {resource_type} "
                    f"(resource_id={resource_id}, user_id={user_id})"
                )
            except Exception as e:
                # Audit failures must never affect endpoints
                logger.error(f"Failed to create audit log: {e}")

        return response
