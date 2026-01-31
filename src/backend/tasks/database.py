"""
Database session management for Celery tasks.

Provides context manager for database sessions in background tasks.
Cannot use FastAPI dependency injection (Depends) in Celery.

IMPORTANT: Creates a fresh engine per session to avoid asyncpg errors.
asyncpg connections are bound to the event loop they were created on,
and Celery tasks create new event loops, so we cannot reuse the app's
shared engine/session factory.
"""

from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from core.config import settings
import logging

logger = logging.getLogger(__name__)


def get_task_session_factory():
    """
    Create a fresh engine and session factory for a Celery task.

    Returns:
        tuple: (async_sessionmaker, engine) - caller must dispose engine when done
    """
    engine = create_async_engine(
        str(settings.database.url),
        echo=bool(settings.performance.enable_query_logging),
        future=True,
        pool_pre_ping=False,
        pool_size=2,
        max_overflow=0,
        pool_timeout=settings.database.pool_timeout,
        pool_recycle=settings.database.pool_recycle,
    )

    session_factory = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
        autocommit=False,
    )
    return session_factory, engine


@asynccontextmanager
async def get_celery_session():
    """
    Async context manager for database sessions in Celery tasks.

    Creates a fresh engine and disposes it after use to avoid
    asyncpg event loop binding issues.

    Usage:
        async with get_celery_session() as session:
            result = await session.execute(query)
            await session.commit()

    Yields:
        AsyncSession: Database session with automatic cleanup
    """
    session_factory, engine = get_task_session_factory()
    session: AsyncSession = session_factory()
    try:
        yield session
        await session.commit()
    except Exception as e:
        await session.rollback()
        logger.error(f"Database error in Celery task: {e}")
        raise
    finally:
        await session.close()
        await engine.dispose()
