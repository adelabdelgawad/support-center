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
    from core.uvicorn_logging import setup_uvicorn_error_logging

    logger = logging.getLogger("main")
    setup_logging(log_config)

    # Setup enhanced uvicorn error logging to capture invalid HTTP requests
    setup_uvicorn_error_logging()

    logger.info("🚀 Starting Service Catalog API...")


async def log_cors_configuration(settings, logger):
    """Log CORS configuration for debugging."""
    print(f"🔒 CORS Allowed Origins: {settings.cors.origins}")
    logger.info(f"🔒 CORS Allowed Origins: {settings.cors.origins}")


async def initialize_database():
    """Initialize database tables."""
    from db.database import init_db

    logger = logging.getLogger("main")
    await init_db()
    print("✅ Database initialized")
    logger.info("✅ Database initialized")


async def setup_default_data(get_session):
    """Setup default database data (admin user, lookup tables, etc.)."""
    from db.setup import setup_database_default_data

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


async def initialize_minio(settings):
    """Initialize MinIO storage."""
    logger = logging.getLogger("main")
    try:
        from api.services.minio_service import MinIOStorageService

        await MinIOStorageService.ensure_bucket_exists()
        print("✅ MinIO storage initialized")
        logger.info("✅ MinIO storage initialized")
    except Exception as e:
        print(f"⚠️  MinIO initialization failed: {e}")
        logger.warning(f"⚠️  MinIO initialization failed: {e}")


async def initialize_external_services(settings):
    """Initialize all external services in parallel."""
    logger = logging.getLogger("main")
    logger.info("Initializing external services (parallel execution)...")

    # Run all external service initializations in parallel
    await asyncio.gather(
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
        from api.services.signalr_client import SignalRClient

        await SignalRClient.close()
        print("✅ SignalR client closed")
        logger.info("✅ SignalR client closed")
    except Exception as e:
        print(f"⚠️  SignalR client shutdown error: {e}")
        logger.warning(f"⚠️  SignalR client shutdown error: {e}")


async def shutdown_presence_service():
    """Close presence Redis client."""
    logger = logging.getLogger("main")
    try:
        from api.services.presence_service import presence_service

        await presence_service.close()
        logger.info("Presence Redis client closed")
    except Exception as e:
        logger.warning(f"Presence Redis shutdown error: {e}")


async def shutdown_database():
    """Close database connections."""
    from db.database import close_db

    logger = logging.getLogger("main")
    await close_db()
    print("✅ Database connections closed")
    logger.info("✅ Database connections closed")


async def initialize_event_coalescer():
    """Initialize typing event coalescer with publish callback."""
    from api.services.event_coalescer import typing_coalescer
    from api.services.event_models import StreamEvent

    logger = logging.getLogger("main")

    # Set up the publish callback for the coalescer
    async def publish_coalesced_event(room_id: str, event_type: str, payload: dict):
        """Callback to publish coalesced events via event transport."""
        event = StreamEvent(
            event_type=event_type,
            room_id=room_id,
            payload=payload
        )
        stream = _get_stream_name_from_type(event_type)

        # Publish directly to Redis Streams
        import time
        from core.metrics import track_event_publish

        start_time = time.time()
        # This would need to use the redis_streams_publisher directly
        # For now, we'll create a simple wrapper
        from api.services.event_publisher import redis_streams_publisher

        success = await redis_streams_publisher.publish(stream, event)
        duration = time.time() - start_time

        track_event_publish(
            transport="redis_streams",
            event_type=event_type,
            duration_seconds=duration,
            success=success
        )

    typing_coalescer.set_publish_callback(publish_coalesced_event)
    print("✅ Event coalescer initialized")
    logger.info("✅ Event coalescer initialized")


def _get_stream_name_from_type(event_type: str) -> str:
    """Get the Redis Stream name for an event type."""
    if event_type in ("chat_message", "typing_start", "typing_stop", "read_receipt"):
        return "events:chat"
    elif event_type in ("status_change", "assignment_change", "notification"):
        return "events:ticket"
    elif event_type in ("remote_session_start", "remote_session_end"):
        return "events:remote"
    else:
        return "events:chat"  # Default


async def shutdown_event_coalescer():
    """Flush pending coalesced events before shutdown."""
    from api.services.event_coalescer import typing_coalescer

    logger = logging.getLogger("main")
    try:
        await typing_coalescer.flush_all()
        print("✅ Event coalescer flushed and shut down")
        logger.info("✅ Event coalescer flushed and shut down")
    except Exception as e:
        print(f"⚠️  Event coalescer shutdown error: {e}")
        logger.warning(f"⚠️  Event coalescer shutdown error: {e}")
