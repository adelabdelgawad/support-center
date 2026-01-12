"""
Application lifespan manager.

This module provides the lifespan context manager that handles
startup and shutdown events for the FastAPI application.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from core.cache import cache
from core.config import settings
from core.database import get_session
from core.logging_config import LogConfig, stop_queue_listener
from . import tasks


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager.
    Handles startup and shutdown events.
    """
    # Setup logging
    log_config = LogConfig(**settings.logging.log_config)
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

    # Initialize external services in parallel (Redis, MinIO)
    await tasks.initialize_external_services(cache, settings)

    # Start background scheduler for periodic tasks
    await tasks.start_background_scheduler()

    yield

    # Shutdown
    print("🛑 Shutting down Service Catalog API...")
    logger.info("🛑 Shutting down Service Catalog API...")

    # Stop logging queue listener (F21: async logging cleanup)
    stop_queue_listener()
    logger.info("Logging queue listener stopped")

    # Shutdown background scheduler
    await tasks.shutdown_scheduler_task()

    # Close SignalR HTTP client
    await tasks.shutdown_signalr_client()

    # Close Redis cache connections
    await tasks.shutdown_redis_cache(cache)

    # Close database connections
    await tasks.shutdown_database()
