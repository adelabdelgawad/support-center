# Middleware Pattern Reference

Custom middleware patterns for FastAPI: request timing, logging, security headers, correlation IDs, and error handling.

## Key Principles

1. **Order matters** - Middleware executes in reverse order of registration
2. **Use Starlette base** - `BaseHTTPMiddleware` for simple cases
3. **Handle exceptions** - Middleware can catch and transform errors
4. **Async-friendly** - Use `async def dispatch` for async operations
5. **Keep it light** - Middleware runs on every request

## Middleware Registration Order

```python
# app.py
# Middleware executes in REVERSE order of registration
# First registered = outermost (runs first on request, last on response)

app = FastAPI()

# 1. Security Headers (outermost - runs first)
app.add_middleware(SecurityHeadersMiddleware)

# 2. Correlation ID (adds ID early for logging)
app.add_middleware(CorrelationIdMiddleware)

# 3. Request Timing (measures total processing time)
app.add_middleware(TimingMiddleware)

# 4. Request Logging (logs with correlation ID)
app.add_middleware(RequestLoggingMiddleware)

# 5. CORS (innermost for API)
app.add_middleware(CORSMiddleware, allow_origins=["*"])
```

## Security Headers Middleware

```python
# core/middleware/security_headers.py
"""Security headers middleware."""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""

    def __init__(
        self,
        app,
        hsts_enabled: bool = True,
        hsts_max_age: int = 31536000,
        hsts_include_subdomains: bool = True,
        hsts_preload: bool = False,
        csp_directives: str = None,
    ):
        super().__init__(app)
        self.hsts_enabled = hsts_enabled
        self.hsts_max_age = hsts_max_age
        self.hsts_include_subdomains = hsts_include_subdomains
        self.hsts_preload = hsts_preload
        self.csp_directives = csp_directives or self._default_csp()

    def _default_csp(self) -> str:
        """Default Content Security Policy."""
        return "; ".join([
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: https:",
            "font-src 'self'",
            "frame-ancestors 'none'",
            "form-action 'self'",
        ])

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        # Prevent MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"

        # XSS protection (legacy browsers)
        response.headers["X-XSS-Protection"] = "1; mode=block"

        # Referrer policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Permissions policy
        response.headers["Permissions-Policy"] = (
            "geolocation=(), microphone=(), camera=()"
        )

        # Content Security Policy
        if self.csp_directives:
            response.headers["Content-Security-Policy"] = self.csp_directives

        # HSTS (only for HTTPS)
        if self.hsts_enabled and request.url.scheme == "https":
            hsts_value = f"max-age={self.hsts_max_age}"
            if self.hsts_include_subdomains:
                hsts_value += "; includeSubDomains"
            if self.hsts_preload:
                hsts_value += "; preload"
            response.headers["Strict-Transport-Security"] = hsts_value

        return response
```

## Correlation ID Middleware

```python
# core/middleware/correlation_id.py
"""Request correlation ID middleware."""

import uuid
from contextvars import ContextVar
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# Context variable for correlation ID
correlation_id_var: ContextVar[str] = ContextVar("correlation_id", default="")

CORRELATION_ID_HEADER = "X-Correlation-ID"


def get_correlation_id() -> str:
    """Get current correlation ID from context."""
    return correlation_id_var.get()


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """
    Add correlation ID to requests for distributed tracing.

    - Reads existing ID from request header
    - Generates new ID if not present
    - Adds ID to response header
    - Stores in context for logging
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        # Get or generate correlation ID
        correlation_id = request.headers.get(CORRELATION_ID_HEADER)
        if not correlation_id:
            correlation_id = str(uuid.uuid4())

        # Set in context for logging
        token = correlation_id_var.set(correlation_id)

        try:
            response = await call_next(request)

            # Add to response headers
            response.headers[CORRELATION_ID_HEADER] = correlation_id

            return response
        finally:
            # Reset context
            correlation_id_var.reset(token)
```

## Request Timing Middleware

```python
# core/middleware/timing.py
"""Request timing middleware."""

import time
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class TimingMiddleware(BaseHTTPMiddleware):
    """
    Measure and log request processing time.

    Adds X-Process-Time header to responses.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        start_time = time.perf_counter()

        response = await call_next(request)

        process_time = time.perf_counter() - start_time
        response.headers["X-Process-Time"] = f"{process_time:.4f}"

        return response
```

## Request Logging Middleware

```python
# core/middleware/logging.py
"""Request logging middleware."""

import logging
import time
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from core.middleware.correlation_id import get_correlation_id

logger = logging.getLogger(__name__)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    Log all incoming requests and responses.

    Includes:
    - Method, path, query params
    - Response status and timing
    - Correlation ID
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        start_time = time.perf_counter()
        correlation_id = get_correlation_id()

        # Log request
        logger.info(
            "Request started",
            extra={
                "correlation_id": correlation_id,
                "method": request.method,
                "path": request.url.path,
                "query": str(request.query_params),
                "client_ip": request.client.host if request.client else None,
                "user_agent": request.headers.get("user-agent"),
            },
        )

        # Process request
        response = await call_next(request)

        # Calculate duration
        duration = time.perf_counter() - start_time

        # Log response
        log_level = logging.INFO if response.status_code < 400 else logging.WARNING
        if response.status_code >= 500:
            log_level = logging.ERROR

        logger.log(
            log_level,
            "Request completed",
            extra={
                "correlation_id": correlation_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": round(duration * 1000, 2),
            },
        )

        return response
```

## Rate Limiting Middleware

```python
# core/middleware/rate_limit.py
"""Rate limiting middleware using Redis."""

import time
from typing import Optional
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response, JSONResponse
import redis.asyncio as redis


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Rate limit requests using sliding window algorithm.

    - Configurable limits per endpoint
    - Uses Redis for distributed rate limiting
    - Returns 429 Too Many Requests when exceeded
    """

    def __init__(
        self,
        app,
        redis_url: str,
        default_limit: int = 100,
        default_window: int = 60,
    ):
        super().__init__(app)
        self.redis = redis.from_url(redis_url)
        self.default_limit = default_limit
        self.default_window = default_window

    def _get_client_id(self, request: Request) -> str:
        """Get client identifier (IP or user ID)."""
        # Try to get user ID from auth
        user_id = getattr(request.state, "user_id", None)
        if user_id:
            return f"user:{user_id}"

        # Fall back to IP
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return f"ip:{forwarded.split(',')[0].strip()}"

        return f"ip:{request.client.host}"

    async def dispatch(self, request: Request, call_next) -> Response:
        # Skip rate limiting for health checks
        if request.url.path in ["/health", "/metrics"]:
            return await call_next(request)

        client_id = self._get_client_id(request)
        key = f"ratelimit:{client_id}:{request.url.path}"

        # Get current count
        current = await self.redis.get(key)
        current_count = int(current) if current else 0

        if current_count >= self.default_limit:
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded"},
                headers={
                    "Retry-After": str(self.default_window),
                    "X-RateLimit-Limit": str(self.default_limit),
                    "X-RateLimit-Remaining": "0",
                },
            )

        # Increment counter
        pipe = self.redis.pipeline()
        pipe.incr(key)
        pipe.expire(key, self.default_window)
        await pipe.execute()

        # Process request
        response = await call_next(request)

        # Add rate limit headers
        response.headers["X-RateLimit-Limit"] = str(self.default_limit)
        response.headers["X-RateLimit-Remaining"] = str(
            max(0, self.default_limit - current_count - 1)
        )

        return response
```

## Error Handling Middleware

```python
# core/middleware/error_handler.py
"""Global error handling middleware."""

import logging
import traceback
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from core.middleware.correlation_id import get_correlation_id

logger = logging.getLogger(__name__)


class ErrorHandlerMiddleware(BaseHTTPMiddleware):
    """
    Catch unhandled exceptions and return proper error responses.

    - Logs full traceback
    - Returns sanitized error to client
    - Includes correlation ID for debugging
    """

    async def dispatch(self, request: Request, call_next):
        try:
            return await call_next(request)

        except Exception as e:
            correlation_id = get_correlation_id()

            # Log full error
            logger.exception(
                "Unhandled exception",
                extra={
                    "correlation_id": correlation_id,
                    "path": request.url.path,
                    "method": request.method,
                    "error": str(e),
                    "traceback": traceback.format_exc(),
                },
            )

            # Return sanitized error
            return JSONResponse(
                status_code=500,
                content={
                    "detail": "Internal server error",
                    "correlation_id": correlation_id,
                },
            )
```

## Database Session Middleware

```python
# core/middleware/database.py
"""Database session middleware."""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from db.database import async_session_maker


class DatabaseSessionMiddleware(BaseHTTPMiddleware):
    """
    Provide database session for each request.

    - Creates session at request start
    - Commits on success, rollbacks on error
    - Closes session after response

    Note: Consider using FastAPI's SessionDep type alias instead
    for more granular control.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        async with async_session_maker() as session:
            # Attach session to request state
            request.state.db = session

            try:
                response = await call_next(request)

                # Commit if successful
                if response.status_code < 400:
                    await session.commit()
                else:
                    await session.rollback()

                return response

            except Exception:
                await session.rollback()
                raise
```

## Complete App Setup

```python
# app.py
"""FastAPI application with middleware stack."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from core.middleware.security_headers import SecurityHeadersMiddleware
from core.middleware.correlation_id import CorrelationIdMiddleware
from core.middleware.timing import TimingMiddleware
from core.middleware.logging import RequestLoggingMiddleware
from core.middleware.error_handler import ErrorHandlerMiddleware

app = FastAPI(
    title="My API",
    version="1.0.0",
)

# Add middleware (reverse order of execution)

# 1. Error handler (outermost - catches all errors)
app.add_middleware(ErrorHandlerMiddleware)

# 2. Security headers
app.add_middleware(
    SecurityHeadersMiddleware,
    hsts_enabled=settings.ENVIRONMENT != "local",
    hsts_max_age=31536000,
)

# 3. Correlation ID
app.add_middleware(CorrelationIdMiddleware)

# 4. Request timing
app.add_middleware(TimingMiddleware)

# 5. Request logging
app.add_middleware(RequestLoggingMiddleware)

# 6. CORS (innermost)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## Key Points

1. **Order matters** - Register in reverse order of desired execution
2. **Use context vars** - For sharing data across middleware (correlation ID)
3. **Handle errors** - Middleware can catch and transform exceptions
4. **Keep it fast** - Middleware runs on every request
5. **Log with context** - Include correlation ID in all logs
6. **Security first** - Add security headers early in the chain
7. **Test thoroughly** - Middleware affects all endpoints
