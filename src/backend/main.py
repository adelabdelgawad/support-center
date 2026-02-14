"""
Main FastAPI application entry point.
"""

import logging
import os
import sys

from core.factory import create_app
from core.config import settings

# Simple logging configuration - errors/warnings only to console
logging.basicConfig(
    format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
    stream=sys.stdout,
    level=logging.WARNING,  # Only log warnings and errors
)

# Create application instance
app = create_app()

if __name__ == "__main__":
    import uvicorn
    import threading

    # Start Prometheus metrics server in background thread
    try:
        from core.metrics import start_http_server
        metrics_thread = threading.Thread(target=start_http_server, daemon=True)
        metrics_thread.start()
    except ImportError:
        pass  # Metrics optional

    print(f"🚀 Starting {settings.api.app_name} v{settings.api.app_version}")
    print(f"📊 Environment: {os.getenv('ENVIRONMENT', 'development')}")
    print(f"🔍 Debug mode: {settings.api.debug}")

    # Run FastAPI app directly (native WebSocket support)
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.api.debug,
        workers=1 if settings.api.debug else 4,
        log_level="warning",  # Only warnings and errors
        access_log=False,  # Disable access logs - use database audit instead
        timeout_graceful_shutdown=10,
        server_header=False,
        timeout_keep_alive=5,
    )
