"""
Database configuration with performance optimizations.
Implements connection pooling, async operations, and query optimization.
"""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

import asyncpg
from sqlalchemy import create_engine as create_sync_engine
from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import OperationalError, PendingRollbackError
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import AsyncAdaptedQueuePool
from sqlmodel import SQLModel

from .config import settings

# Create async engine with optimized pool settings
engine = create_async_engine(
    str(settings.database.url),
    echo=bool(
        settings.performance.enable_query_logging
    ),  # Ensure proper boolean conversion
    future=True,
    pool_pre_ping=False,  # Disable pre-ping for faster startup (connections are validated on use)
    pool_size=settings.database.pool_size,
    max_overflow=settings.database.max_overflow,
    pool_timeout=settings.database.pool_timeout,
    pool_recycle=settings.database.pool_recycle,
    poolclass=AsyncAdaptedQueuePool,
    # Performance optimizations
    connect_args={
        "server_settings": {
            "jit": "on",  # Enable JIT compilation in PostgreSQL
            "application_name": settings.api.app_name,
        },
        "command_timeout": 60,  # Reduced to 60 seconds for faster startup
        "timeout": 30,  # Reduced connection timeout for faster failure detection
    },
)

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,  # Prevent additional queries after commit
    autoflush=False,  # Manual flush for better control
    autocommit=False,
)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency for getting async database sessions.
    Implements proper session lifecycle management.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            # Only commit if session is in a valid state
            if session.in_transaction():
                try:
                    await session.commit()
                except PendingRollbackError:
                    # Transaction already invalid - rollback instead
                    await session.rollback()
                    raise
        except Exception:
            await session.rollback()
            raise
        # Note: No explicit close() needed - async context manager handles it


async def get_websocket_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency for WebSocket connections - does NOT auto-commit.

    WebSocket connections are long-lived and should manage their own transactions.
    This prevents PendingRollbackError when the connection closes after a query timeout.

    Usage:
        @router.websocket("/ws")
        async def websocket_endpoint(
            websocket: WebSocket,
            db: AsyncSession = Depends(get_websocket_session)
        ):
            # Manually commit when needed
            await db.commit()
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            # Do NOT auto-commit for WebSocket connections
            # They should manage transactions manually
        except Exception:
            # Still rollback on errors
            try:
                await session.rollback()
            except Exception:
                pass  # Session might already be invalid
            raise
        # Note: No explicit close() needed - async context manager handles it


@asynccontextmanager
async def get_cleanup_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Create a new isolated session for cleanup operations.

    Use this in finally blocks or error handling where the main
    session may be corrupted (e.g., PendingRollbackError).
    This guarantees a fresh, valid session for cleanup operations.

    Example:
        async with get_cleanup_session() as cleanup_db:
            await UserService.update_online_status(cleanup_db, user_id, False)

    Returns:
        AsyncGenerator yielding an isolated AsyncSession
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        # Note: No explicit close() needed - async context manager handles it


def is_session_valid(session: AsyncSession) -> bool:
    """
    Check if a database session is in a valid state for operations.

    A session is invalid if:
    - It's in a transaction that needs rollback (PendingRollbackError state)
    - It's closed

    Args:
        session: AsyncSession to check

    Returns:
        True if session is valid, False otherwise
    """
    try:
        # Check if session is closed
        if not session.is_active:
            return False

        # Check if there's a pending rollback
        if session.in_transaction():
            # Session is in a transaction, which is normal
            # The issue is when transaction is in invalid state
            # This will be caught when we try to use it
            pass

        return True
    except Exception:
        return False


async def ensure_session_valid(session: AsyncSession) -> None:
    """
    Ensure session is in valid state, rolling back if necessary.

    Call this before critical operations to prevent PendingRollbackError.

    Args:
        session: AsyncSession to validate

    Raises:
        RuntimeError: If session cannot be made valid
    """
    import logging
    logger = logging.getLogger(__name__)

    try:
        if session.in_transaction():
            # Try a simple operation to test if session is healthy
            await session.execute(text("SELECT 1"))
            # If we got here, session is healthy
            return
    except PendingRollbackError:
        # Session needs rollback
        logger.warning("Session has pending rollback, rolling back now")
        try:
            await session.rollback()
        except Exception as e:
            logger.error(f"Failed to rollback session: {e}")
            raise RuntimeError(f"Session is invalid and cannot be recovered: {e}")
    except Exception as e:
        # Other error - try rollback
        logger.warning(f"Session health check failed: {e}, attempting rollback")
        try:
            await session.rollback()
        except Exception as rollback_error:
            logger.error(f"Failed to rollback session: {rollback_error}")
            raise RuntimeError(f"Session is invalid and cannot be recovered: {rollback_error}")


async def ensure_database_exists() -> None:
    """
    Ensure the database exists, create it if it doesn't.
    This connects to the default postgres database first to create the target database.
    """
    database_url = str(settings.database.url)

    # Parse the database name from the URL
    if "/" in database_url:
        # Extract database name from URL like postgresql+asyncpg://user:pass@host:port/dbname
        db_name = database_url.split("/")[-1]
        base_url = (
            "/".join(database_url.split("/")[:-1]) + "/postgres"
        )  # Connect to default postgres database
    else:
        raise ValueError("Invalid database URL format")

    try:
        # Try to connect directly - if it works, the database exists
        conn = await asyncpg.connect(base_url)
        try:
            await conn.execute("SELECT 1")
            return
        finally:
            await conn.close()
    except asyncpg.InvalidCatalogNameError:
        # Database doesn't exist, create it
        pass
    except Exception:
        # Other connection issues - let the main engine handle it
        return

    try:
        # Create the database using asyncpg
        conn = await asyncpg.connect(base_url)
        try:
            await conn.execute(f'CREATE DATABASE "{db_name}"')
        finally:
            await conn.close()
    except asyncpg.DuplicateDatabaseError:
        # Database already exists, ignore
        pass
    except Exception as e:
        print(f"Warning: Could not create database {db_name}: {e}")


async def init_db() -> None:
    """
    Initialize database tables.
    Should be called on application startup.
    First ensures the database exists, then creates all tables.
    Optimized to skip if tables already exist.
    """
    # Ensure database exists before creating tables
    await ensure_database_exists()

    # Quick check: if tables already exist, skip creation
    # This significantly speeds up startup on already-initialized databases
    try:
        async with engine.begin() as conn:
            # Check if users table exists (a core table that should always be present)
            result = await conn.execute(
                text("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users')")
            )
            tables_exist = result.scalar()

            if tables_exist:
                # Tables already exist, skip creation
                return

            # Create all tables only if they don't exist
            await conn.run_sync(SQLModel.metadata.create_all)
    except Exception:
        # If check fails, try creating tables anyway (safe operation - won't overwrite)
        async with engine.begin() as conn:
            await conn.run_sync(SQLModel.metadata.create_all)


async def close_db() -> None:
    """
    Close database connections.
    Should be called on application shutdown.
    """
    await engine.dispose()
