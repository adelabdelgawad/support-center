"""
Database session management for Celery tasks.

Provides context manager for database sessions in background tasks.
Cannot use FastAPI dependency injection (Depends) in Celery.
"""

from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import AsyncSessionLocal
import logging

logger = logging.getLogger(__name__)


@asynccontextmanager
async def get_celery_session():
    """
    Async context manager for database sessions in Celery tasks.

    Usage:
        async with get_celery_session() as session:
            result = await session.execute(query)
            await session.commit()

    Yields:
        AsyncSession: Database session with automatic cleanup
    """
    session: AsyncSession = AsyncSessionLocal()
    try:
        yield session
        await session.commit()
    except Exception as e:
        await session.rollback()
        logger.error(f"Database error in Celery task: {e}")
        raise
    finally:
        await session.close()
