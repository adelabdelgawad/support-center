"""
Main FastAPI application entry point.
"""

from app import create_app

# Create application instance
app = create_app()


if __name__ == "__main__":
    import uvicorn

    from core.config import settings
    from core.uvicorn_logging import LOGGING_CONFIG

    # Run FastAPI app directly (native WebSocket support)
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.api.debug,
        workers=1 if settings.api.debug else 4,
        log_level="info",
        log_config=LOGGING_CONFIG,  # Custom logging config to capture invalid requests
        access_log=True,
        timeout_graceful_shutdown=10,  # Graceful shutdown timeout
        server_header=False,            # Hide server header for security
        timeout_keep_alive=5,           # Keep-alive timeout to reduce invalid requests
    )
