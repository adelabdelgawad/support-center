"""
Application lifespan manager.

This module provides the lifespan context manager that handles
startup and shutdown events for the FastAPI application.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from core.config import settings
from db.database import get_session
from core.logging_config import LogConfig
from . import tasks


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager.
    Handles startup and shutdown events.
    """
    # Setup logging
    log_config = LogConfig(level=settings.logging.level)
    await tasks.initialize_logging(settings, log_config)

    logger = logging.getLogger("main")

    # Startup
    print("🚀 Starting Service Catalog API...")

    # Log CORS configuration for debugging
    await tasks.log_cors_configuration(settings, logger)

    # Initialize database
    await tasks.initialize_database()

    # Setup default data (admin user, lookup tables, etc.)
    await tasks.setup_default_data(get_session)

    # Initialize external services (MinIO)
    await tasks.initialize_external_services(settings)

    # Start background scheduler for periodic tasks
    await tasks.start_background_scheduler()

    # Initialize event coalescer (Feature 001)
    await tasks.initialize_event_coalescer()

    yield

    # Shutdown
    print("🛑 Shutting down Service Catalog API...")
    logger.info("🛑 Shutting down Service Catalog API...")

    # Shutdown background scheduler
    await tasks.shutdown_scheduler_task()

    # Close SignalR HTTP client
    await tasks.shutdown_signalr_client()

    # Shutdown event coalescer (Feature 001)
    await tasks.shutdown_event_coalescer()

    # Close database connections
    await tasks.shutdown_database()
