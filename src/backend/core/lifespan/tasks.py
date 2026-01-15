"""
Lifespan startup and shutdown task functions.

This module contains individual task functions for application startup
and shutdown sequences. Each function handles a specific responsibility.
"""

import asyncio
import logging


async def initialize_logging(settings, log_config):
    """Setup logging configuration."""
    from core.logging_config import setup_logging

    logger = logging.getLogger("main")
    setup_logging(log_config)
    logger.info("🚀 Starting Service Catalog API...")


async def log_cors_configuration(settings, logger):
    """Log CORS configuration for debugging."""
    print(f"🔒 CORS Allowed Origins: {settings.cors.origins}")
    logger.info(f"🔒 CORS Allowed Origins: {settings.cors.origins}")


async def initialize_database():
    """Initialize database tables."""
    from core.database import init_db

    logger = logging.getLogger("main")
    await init_db()
    print("✅ Database initialized")
    logger.info("✅ Database initialized")


async def setup_default_data(get_session):
    """Setup default database data (admin user, lookup tables, etc.)."""
    from database_setup import setup_database_default_data

    logger = logging.getLogger("main")
    logger.info("Setting up default database data...")
    async for db in get_session():
        try:
            setup_success = await setup_database_default_data(db)
            if setup_success:
                print("✅ Default data setup completed successfully")
                logger.info("✅ Default data setup completed successfully")
            else:
                print("⚠️  Default data setup failed - check logs above")
                logger.error("❌ Default data setup failed - check logs above")
        except Exception as e:
            print(f"❌ Error during default data setup: {e}")
            logger.error(f"❌ Error during default data setup: {e}")
        finally:
            break  # Only process first session


async def initialize_redis_cache(cache):
    """Initialize Redis cache connection."""
    logger = logging.getLogger("main")
    try:
        await cache.connect()
        print("✅ Redis cache connected")
        logger.info("✅ Redis cache connected")
    except Exception as e:
        print(f"⚠️  Redis cache connection failed: {e}")
        logger.warning(f"⚠️  Redis cache connection failed: {e}")


async def initialize_minio(settings):
    """Initialize MinIO storage."""
    logger = logging.getLogger("main")
    try:
        from services.minio_service import MinIOStorageService

        await MinIOStorageService.ensure_bucket_exists()
        print("✅ MinIO storage initialized")
        logger.info("✅ MinIO storage initialized")
    except Exception as e:
        print(f"⚠️  MinIO initialization failed: {e}")
        logger.warning(f"⚠️  MinIO initialization failed: {e}")


async def initialize_external_services(cache, settings):
    """Initialize all external services in parallel."""
    logger = logging.getLogger("main")
    logger.info("Initializing external services (parallel execution)...")

    # Run all external service initializations in parallel
    await asyncio.gather(
        initialize_redis_cache(cache),
        initialize_minio(settings),
        return_exceptions=True
    )


async def start_background_scheduler():
    """Start database-driven background scheduler for periodic tasks."""
    from core.scheduler_manager import get_scheduler_manager

    logger = logging.getLogger("main")
    try:
        manager = get_scheduler_manager()
        await manager.start()
        print("✅ Database-driven scheduler manager started")
        logger.info("✅ Database-driven scheduler manager started")
    except Exception as e:
        print(f"⚠️  Scheduler initialization failed: {e}")
        logger.warning(f"⚠️  Scheduler initialization failed: {e}")


async def shutdown_scheduler_task():
    """Shutdown database-driven background scheduler."""
    from core.scheduler_manager import get_scheduler_manager

    logger = logging.getLogger("main")
    try:
        manager = get_scheduler_manager()
        await manager.stop()
        print("✅ Database-driven scheduler manager shut down")
        logger.info("✅ Database-driven scheduler manager shut down")
    except Exception as e:
        print(f"⚠️  Scheduler shutdown error: {e}")
        logger.warning(f"⚠️  Scheduler shutdown error: {e}")


async def shutdown_signalr_client():
    """Close SignalR HTTP client."""
    logger = logging.getLogger("main")
    try:
        from services.signalr_client import SignalRClient

        await SignalRClient.close()
        print("✅ SignalR client closed")
        logger.info("✅ SignalR client closed")
    except Exception as e:
        print(f"⚠️  SignalR client shutdown error: {e}")
        logger.warning(f"⚠️  SignalR client shutdown error: {e}")


async def shutdown_redis_cache(cache):
    """Close Redis cache connections."""
    logger = logging.getLogger("main")
    try:
        await cache.disconnect()
        print("✅ Redis cache disconnected")
        logger.info("✅ Redis cache disconnected")
    except Exception as e:
        print(f"⚠️  Redis cache disconnect error: {e}")
        logger.warning(f"⚠️  Redis cache disconnect error: {e}")


async def shutdown_database():
    """Close database connections."""
    from core.database import close_db

    logger = logging.getLogger("main")
    await close_db()
    print("✅ Database connections closed")
    logger.info("✅ Database connections closed")
