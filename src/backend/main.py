"""
Main FastAPI application entry point.
"""

import logging
import os
import structlog
import sys
import threading
from pathlib import Path

from fastapi import Request
from core.factory import create_app
from core.config import settings

# Configure structlog for JSON logging
def setup_structured_logging():
    """Configure structured logging with JSON format."""

    # Ensure logs directory exists
    logs_dir = Path(settings.logging.file_path).parent
    logs_dir.mkdir(exist_ok=True)

    # Set up structlog
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer()  # JSON output
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    # Configure standard Python logging to use structlog
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout if settings.logging.enable_console else None,
        level=getattr(logging, settings.logging.level.upper(), logging.INFO),
    )

    # Create a logger
    logger = logging.getLogger()
    logger.setLevel(getattr(logging, settings.logging.level.upper(), logging.INFO))

    # Set up file handler for JSON logs
    if settings.logging.enable_file:
        from logging.handlers import RotatingFileHandler

        file_handler = RotatingFileHandler(
            settings.logging.file_path,
            maxBytes=settings.logging.max_file_size,
            backupCount=settings.logging.backup_count
        )
        file_handler.setLevel(getattr(logging, settings.logging.level.upper(), logging.INFO))
        logger.addHandler(file_handler)

    # Add console handler for development
    if settings.logging.enable_console and settings.api.debug:
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(logging.DEBUG)
        logger.addHandler(console_handler)

# Initialize structured logging
setup_structured_logging()

# Get a logger instance
log = structlog.get_logger()

# Add request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log HTTP requests with structured logging."""

    # Log request details
    log.info(
        "HTTP request",
        method=request.method,
        url=str(request.url),
        client_host=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        content_length=request.headers.get("content-length")
    )

    try:
        response = await call_next(request)

        # Log response details
        log.info(
            "HTTP response",
            status_code=response.status_code,
            method=request.method,
            url=str(request.url),
            response_time_ms=None  # Could be calculated if needed
        )

        return response
    except Exception as e:
        # Log errors
        log.error(
            "HTTP error",
            method=request.method,
            url=str(request.url),
            error=str(e),
            error_type=type(e).__name__
        )
        raise

# Create application instance
app = create_app()

if __name__ == "__main__":
    import uvicorn
    import threading

    from core.uvicorn_logging import LOGGING_CONFIG

    # Start Prometheus metrics server in background thread
    try:
        from core.metrics import start_http_server
        # Start in background thread
        metrics_thread = threading.Thread(target=start_http_server, daemon=True)
        metrics_thread.start()
    except ImportError as e:
        log.warning("Failed to start metrics server", error=str(e))

    # Log application startup
    log.info(
        "Application starting",
        environment=os.getenv("ENVIRONMENT", "development"),
        debug=settings.api.debug,
        port=8000,
        log_level=settings.logging.level
    )

    # Run FastAPI app directly (native WebSocket support)
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.api.debug,
        workers=1 if settings.api.debug else 4,
        log_level=settings.logging.level.lower(),
        log_config=LOGGING_CONFIG,  # Custom logging config to capture invalid requests
        access_log=True,
        timeout_graceful_shutdown=10,  # Graceful shutdown timeout
        server_header=False,            # Hide server header for security
        timeout_keep_alive=5,           # Keep-alive timeout to reduce invalid requests
    )
