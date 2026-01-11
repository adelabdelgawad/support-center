"""
Redis cache implementation with performance optimizations.
Provides caching utilities for frequently accessed data.
"""

import json
import logging
from functools import wraps
from typing import Any, Optional, Union

import redis.asyncio as redis

from .config import settings

logger = logging.getLogger(__name__)

# Sentinel value for no TTL
NO_TTL = object()


class CacheManager:
    """
    Async Redis cache manager with connection pooling.
    Implements efficient caching strategies for performance.
    """

    def __init__(self):
        self._redis: Optional[redis.Redis] = None
        self._pool: Optional[redis.ConnectionPool] = None

    async def connect(self) -> None:
        """Initialize Redis connection pool."""
        self._pool = redis.ConnectionPool.from_url(
            settings.redis.url, **settings.redis.redis_config
        )
        self._redis = redis.Redis(connection_pool=self._pool)

    async def disconnect(self) -> None:
        """Close Redis connections."""
        if self._redis:
            await self._redis.close()
        if self._pool:
            await self._pool.disconnect()

    async def get(self, key: str) -> Optional[Any]:
        """
        Get value from cache.

        Args:
            key: Cache key

        Returns:
            Cached value or None if not found
        """
        if not self._redis:
            logger.warning("Redis not connected - cannot get cache key: %s", key)
            return None

        try:
            value = await self._redis.get(key)
            if value:
                return json.loads(value)
        except Exception as e:
            logger.error("Failed to get cache key '%s': %s", key, str(e), exc_info=True)
            return None
        return None

    async def set(
        self, key: str, value: Any, ttl: Optional[Union[int, object]] = None
    ) -> bool:
        """
        Set value in cache with optional TTL.

        Args:
            key: Cache key
            value: Value to cache
            ttl: Time to live in seconds. If not provided, uses default.
                 Pass NO_TTL to disable TTL (persistent cache).

        Returns:
            True if successful, False otherwise
        """
        if not self._redis:
            logger.warning("Redis not connected - cannot set cache key: %s", key)
            return False

        try:
            serialized = json.dumps(value)

            if ttl is NO_TTL:
                # No TTL - persist indefinitely
                await self._redis.set(key, serialized)
            elif ttl is None:
                # Use default TTL
                await self._redis.setex(key, settings.performance.cache_ttl, serialized)
            else:
                # Use specified TTL
                await self._redis.setex(key, ttl, serialized)

            return True
        except Exception as e:
            logger.error("Failed to set cache key '%s': %s", key, str(e), exc_info=True)
            return False

    async def delete(self, key: str) -> bool:
        """
        Delete key from cache.

        Args:
            key: Cache key to delete

        Returns:
            True if successful, False otherwise
        """
        if not self._redis:
            logger.warning("Redis not connected - cannot delete cache key: %s", key)
            return False

        try:
            await self._redis.delete(key)
            return True
        except Exception as e:
            logger.error("Failed to delete cache key '%s': %s", key, str(e), exc_info=True)
            return False

    async def delete_pattern(self, pattern: str) -> int:
        """
        Delete all keys matching pattern.

        Args:
            pattern: Key pattern (e.g., "user:*")

        Returns:
            Number of keys deleted
        """
        if not self._redis:
            return 0

        try:
            keys = []
            async for key in self._redis.scan_iter(match=pattern):
                keys.append(key)

            if keys:
                return await self._redis.delete(*keys)
            return 0
        except Exception:
            return 0

    async def exists(self, key: str) -> bool:
        """
        Check if key exists in cache.

        Args:
            key: Cache key

        Returns:
            True if key exists, False otherwise
        """
        if not self._redis:
            return False

        try:
            return await self._redis.exists(key) > 0
        except Exception:
            return False

    async def increment(self, key: str, amount: int = 1) -> Optional[int]:
        """
        Increment counter in cache.

        Args:
            key: Cache key
            amount: Amount to increment by

        Returns:
            New value or None if failed
        """
        if not self._redis:
            return None

        try:
            return await self._redis.incrby(key, amount)
        except Exception:
            return None

    async def set_hash(
        self, key: str, mapping: dict, ttl: Optional[int] = None
    ) -> bool:
        """
        Set hash in cache.

        Args:
            key: Cache key
            mapping: Dictionary to store
            ttl: Time to live in seconds

        Returns:
            True if successful, False otherwise
        """
        if not self._redis:
            return False

        try:
            await self._redis.hset(key, mapping=mapping)
            if ttl:
                await self._redis.expire(key, ttl)
            return True
        except Exception:
            return False

    async def get_hash(self, key: str) -> Optional[dict]:
        """
        Get hash from cache.

        Args:
            key: Cache key

        Returns:
            Dictionary or None if not found
        """
        if not self._redis:
            return None

        try:
            return await self._redis.hgetall(key)
        except Exception:
            return None


# Global cache instance
cache = CacheManager()


def cached(
    key_prefix: str,
    ttl: Optional[int] = None,
    key_builder: Optional[callable] = None,
):
    """
    Decorator for caching function results.

    Args:
        key_prefix: Prefix for cache key
        ttl: Time to live in seconds
        key_builder: Optional function to build cache key from args

    Example:
        @cached("user", ttl=300)
        async def get_user(user_id: int):
            return await db.get(user_id)
    """

    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Build cache key
            if key_builder:
                cache_key = f"{key_prefix}:{key_builder(*args, **kwargs)}"
            else:
                # Default: use first argument as key
                cache_key = f"{key_prefix}:{args[0] if args else 'default'}"

            # Try to get from cache
            cached_value = await cache.get(cache_key)
            if cached_value is not None:
                return cached_value

            # Execute function
            result = await func(*args, **kwargs)

            # Cache result
            if result is not None:
                await cache.set(cache_key, result, ttl)

            return result

        return wrapper

    return decorator
