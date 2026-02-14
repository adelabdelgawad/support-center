"""
Redis TTL-based presence tracking service.

Writes presence keys alongside PostgreSQL heartbeats.
- On heartbeat: SET presence key with TTL
- On disconnect: DEL presence key
- On session create: SET presence key with TTL

Keys auto-expire via Redis TTL when heartbeats stop (crash, network loss).
All operations are non-blocking and fail-safe — Redis errors never break
the existing DB-based heartbeat flow.

Key schema:
    presence:desktop:{session_id} → user_id (str)
    presence:user:{user_id}       → SET of session_ids
"""

import logging
from typing import Any
from uuid import UUID

from core.config import settings

logger = logging.getLogger(__name__)


class PresenceRedisService:
    """Manages Redis TTL keys for desktop session presence."""

    def __init__(self):
        self._redis: Any = None
        self._is_available: bool = False

    @property
    def is_available(self) -> bool:
        """Check if Redis is available with health check."""
        return self._is_available

    async def _check_health(self) -> bool:
        """Check Redis health and update availability status."""
        try:
            if self._redis is None:
                # Try to initialize Redis if not done yet
                await self._get_redis()

            # Ping Redis to check connectivity
            await self._redis.ping()
            self._is_available = True
            logger.debug("Redis health check passed")
            return True
        except Exception as e:
            self._is_available = False
            logger.warning(f"Redis health check failed: {e}")
            return False

    async def _get_redis(self):
        """Lazy-initialize Redis client (follows event_publisher.py pattern)."""
        if self._redis is None:
            import redis.asyncio as redis

            self._redis = redis.Redis.from_url(
                settings.redis.url,
                **settings.redis.redis_config,
                decode_responses=True,
            )
            # Perform initial health check
            await self._check_health()
        return self._redis

    async def set_present(self, session_id: UUID, user_id: UUID) -> bool:
        """Mark a desktop session as present in Redis.

        Sets two keys:
          - presence:desktop:{session_id} → user_id (with TTL)
          - Adds session_id to presence:user:{user_id} set (with TTL)

        Returns True on success, False on failure (non-fatal).
        """
        if not await self._check_health():
            logger.warning("Redis unavailable, skipping presence SET")
            return False

        try:
            r = await self._get_redis()
            ttl = settings.presence.ttl_seconds
            sid = str(session_id)
            uid = str(user_id)

            pipe = r.pipeline(transaction=False)
            pipe.set(f"presence:desktop:{sid}", uid, ex=ttl)
            pipe.sadd(f"presence:user:{uid}", sid)
            pipe.expire(f"presence:user:{uid}", ttl)
            await pipe.execute()

            logger.debug(f"Presence SET for session {sid} user {uid} (TTL={ttl}s)")
            return True

        except Exception as e:
            logger.warning(f"Presence Redis SET failed (non-fatal): {e}")
            return False

    async def remove_present(self, session_id: UUID, user_id: UUID) -> bool:
        """Remove a desktop session from Redis presence.

        Deletes the session key and removes it from the user's session set.
        Returns True on success, False on failure (non-fatal).
        """
        try:
            r = await self._get_redis()
            sid = str(session_id)
            uid = str(user_id)

            pipe = r.pipeline(transaction=False)
            pipe.delete(f"presence:desktop:{sid}")
            pipe.srem(f"presence:user:{uid}", sid)
            await pipe.execute()

            logger.debug(f"Presence DEL for session {sid} user {uid}")
            return True

        except Exception as e:
            logger.warning(f"Presence Redis DEL failed (non-fatal): {e}")
            return False

    async def is_session_present(self, session_id: UUID) -> bool:
        """Check if a specific session is present (has a live TTL key)."""
        try:
            r = await self._get_redis()
            return await r.exists(f"presence:desktop:{str(session_id)}") > 0
        except Exception:
            return False

    async def get_user_sessions(self, user_id: UUID) -> set[str]:
        """Get all present session IDs for a user."""
        try:
            r = await self._get_redis()
            return await r.smembers(f"presence:user:{str(user_id)}")
        except Exception:
            return set()

    async def is_user_present(self, user_id: UUID) -> bool:
        """Check if a user has any present session."""
        try:
            r = await self._get_redis()
            return await r.scard(f"presence:user:{str(user_id)}") > 0
        except Exception:
            return False

    async def get_all_present_session_ids(self) -> set[str]:
        """Get all present desktop session IDs.

        Uses SCAN to avoid blocking Redis.
        """
        try:
            r = await self._get_redis()
            prefix = "presence:desktop:"
            prefix_len = len(prefix)
            result = set()
            async for key in r.scan_iter(match=f"{prefix}*", count=200):
                result.add(key[prefix_len:])
            return result
        except Exception:
            return set()

    async def count_present_sessions(self) -> int:
        """Count total present desktop sessions (via key scan).

        Uses SCAN to avoid blocking Redis. For monitoring/debugging only.
        """
        try:
            r = await self._get_redis()
            count = 0
            async for _ in r.scan_iter(match="presence:desktop:*", count=200):
                count += 1
            return count
        except Exception:
            return 0

    async def get_present_user_ids(self) -> set[str]:
        """Get all user IDs that have at least one present session.

        Uses SCAN on presence:user:* keys.
        """
        try:
            r = await self._get_redis()
            prefix = "presence:user:"
            prefix_len = len(prefix)
            result = set()
            async for key in r.scan_iter(match=f"{prefix}*", count=200):
                result.add(key[prefix_len:])
            return result
        except Exception:
            return set()

    async def close(self):
        """Close the Redis connection."""
        if self._redis is not None:
            await self._redis.close()
            self._redis = None


# Global singleton
presence_service = PresenceRedisService()
