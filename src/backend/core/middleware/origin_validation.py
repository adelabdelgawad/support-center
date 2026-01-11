"""
Origin validation middleware for CSRF protection.

Validates Origin/Referer headers for mutation requests to prevent
Cross-Site Request Forgery attacks.
"""

import logging
from urllib.parse import urlparse

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from core.config import settings


class OriginValidationMiddleware(BaseHTTPMiddleware):
    """
    CSRF Hardening Middleware - Validates Origin/Referer headers for mutation requests.

    Security Finding #18: Origin Header Validation

    This middleware validates the Origin header (or Referer as fallback) for state-changing
    HTTP methods (POST, PUT, DELETE, PATCH) to prevent Cross-Site Request Forgery attacks.

    Allowed scenarios:
    - Origin matches one of the allowed CORS origins
    - Origin is "null" (same-origin browser behavior, file:// URLs, some redirects)
    - No Origin header present (same-origin requests from older browsers)
    - GET, HEAD, OPTIONS requests (read-only, excluded from CSRF checks)

    Note: This is defense-in-depth. The primary CSRF protection comes from:
    1. SameSite cookies for session management
    2. CORS policy enforced by browsers
    3. Token-based authentication (Bearer tokens)
    """

    # HTTP methods that require Origin validation (state-changing operations)
    MUTATION_METHODS = {"POST", "PUT", "DELETE", "PATCH"}

    # Paths excluded from Origin validation (e.g., internal health checks, metrics)
    EXCLUDED_PATHS = {"/health", "/metrics", "/", "/api/docs", "/api/redoc", "/api/openapi.json"}

    def __init__(self, app, allowed_origins: list[str] | None = None):
        super().__init__(app)
        self.allowed_origins = set(allowed_origins or settings.cors.origins)
        self.logger = logging.getLogger("security.origin")

    async def dispatch(self, request: Request, call_next):
        # Skip validation for non-mutation methods
        if request.method not in self.MUTATION_METHODS:
            return await call_next(request)

        # Skip validation for excluded paths
        if request.url.path in self.EXCLUDED_PATHS:
            return await call_next(request)

        # Get Origin header (primary) or Referer (fallback)
        origin = request.headers.get("origin")
        referer = request.headers.get("referer")

        # Scenario 1: No Origin header - allow (same-origin from older browsers)
        if origin is None:
            # If Referer is present, validate it instead
            if referer:
                if not self._is_valid_referer(referer):
                    return self._reject_request(request, "invalid_referer", referer)
            # No Origin and no Referer - allow (likely same-origin)
            return await call_next(request)

        # Scenario 2: Origin is "null" - allow (same-origin browser behavior)
        # This happens for file:// URLs, redirects, and some privacy contexts
        if origin.lower() == "null":
            return await call_next(request)

        # Scenario 3: Origin matches allowed origins - allow
        if origin in self.allowed_origins:
            return await call_next(request)

        # Scenario 4: Origin doesn't match - reject with 403
        return self._reject_request(request, "invalid_origin", origin)

    def _is_valid_referer(self, referer: str) -> bool:
        """Check if Referer header matches an allowed origin."""
        try:
            parsed = urlparse(referer)
            referer_origin = f"{parsed.scheme}://{parsed.netloc}"
            return referer_origin in self.allowed_origins
        except Exception:
            return False

    def _reject_request(self, request: Request, reason: str, value: str) -> Response:
        """Reject request and log the security event."""
        # Get client IP for logging
        client_ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        if not client_ip:
            client_ip = request.headers.get("x-real-ip", request.client.host if request.client else "unknown")

        # Log security event
        self.logger.warning(
            f"CSRF Protection: Rejected {request.method} {request.url.path} - "
            f"reason={reason}, value={value}, client_ip={client_ip}, "
            f"user_agent={request.headers.get('user-agent', 'unknown')[:100]}"
        )

        return Response(
            content='{"detail": "Origin validation failed"}',
            status_code=403,
            media_type="application/json"
        )
