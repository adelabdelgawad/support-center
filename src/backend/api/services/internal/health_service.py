"""
Health check service for monitoring system health and dependencies.

Provides health status for database, Redis, and other critical components.
"""

import logging
from datetime import datetime
from typing import Any, Dict

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings

logger = logging.getLogger(__name__)


class HealthService:
    """
    Health check service for monitoring system health.

    Transaction Control:
        - All methods are read-only, no transaction control
    """

    def __init__(self, session: AsyncSession) -> None:
        """
        Initialize health service.

        Args:
            session: Async database session
        """
        self.session = session

    async def get_liveness_status(self) -> Dict[str, Any]:
        """
        Get liveness status.

        Returns:
            Dict containing liveness information
        """
        return {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "service": "support-center-backend"
        }

    async def get_readiness_status(self) -> Dict[str, Any]:
        """
        Get readiness status including database and Redis connectivity.

        Returns:
            Dict containing readiness status of all dependencies

        Raises:
            Exception: If database connection fails
        """
        # Test database connection
        db_ready = await self._check_database()

        # Test Redis connection if configured
        redis_ready = await self._check_redis()

        if not db_ready:
            raise Exception("Database connection failed")

        return {
            "status": "ready" if db_ready and redis_ready else "degraded",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "service": "support-center-backend",
            "dependencies": {
                "database": "healthy" if db_ready else "unhealthy",
                "redis": "healthy" if redis_ready else "unhealthy"
            }
        }

    async def get_detailed_status(self) -> Dict[str, Any]:
        """
        Get detailed health status with metrics for all components.

        Returns:
            Dict containing comprehensive health information
        """
        # Test database connection and get metrics
        db_status, db_metrics, db_version = await self._check_database_detailed()

        # Test Redis connection
        redis_status = await self._check_redis_detailed()

        # Overall status
        overall_status = "healthy"
        if db_status != "healthy" or redis_status not in ("healthy", "not configured"):
            overall_status = "degraded"

        return {
            "status": overall_status,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "service": "support-center-backend",
            "version": settings.api.app_version,
            "database": {
                "status": db_status,
                "pool": db_metrics,
                "version": db_version,
                "type": "PostgreSQL"
            },
            "redis": {
                "status": redis_status,
                "url": settings.redis.url
            },
            "components": {
                "api": "running",
                "database": db_status,
                "redis": redis_status
            }
        }

    async def get_database_metrics(self) -> Dict[str, Any]:
        """
        Get database connection pool metrics.

        Returns:
            Dict containing database pool metrics
        """
        from db.database import engine
        pool = engine.pool

        return {
            "pool_size": pool.size(),
            "checkedout": pool.checkedout(),
            "overflow": pool.overflow(),
            "max_overflow": pool._max_overflow  # type: ignore
        }

    async def _check_database(self) -> bool:
        """
        Check basic database connectivity.

        Returns:
            True if database is reachable
        """
        try:
            result = await self.session.execute(text("SELECT 1"))
            return bool(result.scalar())
        except Exception as e:
            logger.warning(f"Database health check failed: {e}")
            return False

    async def _check_database_detailed(self) -> tuple[str, Dict[str, Any], str | None]:
        """
        Check database connectivity and detailed metrics.

        Returns:
            Tuple of (status, metrics, version)
        """
        try:
            # Test connection with version query
            result = await self.session.execute(text("SELECT version()"))
            db_version = result.scalar()

            # Get pool metrics
            metrics = await self.get_database_metrics()

            return "healthy", metrics, db_version
        except Exception as e:
            logger.warning(f"Database detailed health check failed: {e}")
            return f"unhealthy: {str(e)}", {}, None

    async def _check_redis(self) -> bool:
        """
        Check Redis connectivity.

        Returns:
            True if Redis is reachable
        """
        try:
            if settings.redis.url == "redis://localhost:6380/0":
                # Default Redis config, assume it's available
                return True

            import redis.asyncio as redis
            redis_client = redis.Redis.from_url(
                settings.redis.url,
                **settings.redis.redis_config,
                decode_responses=True,
            )
            await redis_client.ping()
            return True
        except Exception as e:
            logger.warning(f"Redis health check failed: {e}")
            return False

    async def _check_redis_detailed(self) -> str:
        """
        Check Redis connectivity and return detailed status.

        Returns:
            Status string
        """
        try:
            if settings.redis.url == "redis://localhost:6380/0":
                return "not configured"

            import redis.asyncio as redis
            redis_client = redis.Redis.from_url(
                settings.redis.url,
                **settings.redis.redis_config,
                decode_responses=True,
            )
            await redis_client.ping()
            return "healthy"
        except Exception as e:
            logger.warning(f"Redis detailed health check failed: {e}")
            return f"unhealthy: {str(e)}"
