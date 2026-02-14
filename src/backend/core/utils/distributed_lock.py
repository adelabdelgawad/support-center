import asyncio
import time
from typing import Optional, ClassVar
import redis.asyncio as redis
import uuid
from fastapi import HTTPException, status
from core.config import settings


class DistributedLock:
    """
    A distributed lock implementation using Redis with Lua scripting for atomic operations.

    This lock ensures that only one instance can acquire the lock at a time,
    preventing race conditions in distributed environments.
    """

    def __init__(self, redis_client: redis.Redis, lock_key: str, ttl: int = 30):
        """
        Initialize the distributed lock.

        Args:
            redis_client: Redis client instance
            lock_key: Key name for the lock
            ttl: Time to live for the lock in seconds (default: 30)
        """
        self.redis = redis_client
        self.lock_key = lock_key
        self.ttl = ttl
        self.lock_id = str(uuid.uuid4())
        self._acquired = False

    async def acquire(self, blocking_timeout: Optional[float] = None) -> bool:
        """
        Acquire the distributed lock.

        Args:
            blocking_timeout: Maximum time to wait for the lock (None for non-blocking)

        Returns:
            True if lock was acquired, False otherwise
        """
        if self._acquired:
            return True

        # Lua script for atomic "get and set" operation
        acquire_script = """
        if redis.call('exists', KEYS[1]) == 0 then
            redis.call('set', KEYS[1], ARGV[1], 'EX', ARGV[2])
            return 1
        else
            return 0
        end
        """

        if blocking_timeout is None:
            # Non-blocking - try once
            result = await self.redis.eval(
                acquire_script, 1, self.lock_key, self.lock_id, str(self.ttl)
            )
            if int(result) == 1:
                self._acquired = True
                return True
            return False

        # Blocking - retry until timeout
        start_time = time.time()
        while True:
            result = await self.redis.eval(
                acquire_script, 1, self.lock_key, self.lock_id, str(self.ttl)
            )
            if int(result) == 1:
                self._acquired = True
                return True

            # Check timeout
            if time.time() - start_time > blocking_timeout:
                return False

            # Wait a bit before retrying
            await asyncio.sleep(0.1)

    async def release(self) -> bool:
        """
        Release the distributed lock.

        Returns:
            True if lock was released, False if lock was not owned
        """
        if not self._acquired:
            return False

        # Lua script for atomic "delete if owned" operation
        release_script = """
        if redis.call('get', KEYS[1]) == ARGV[1] then
            redis.call('del', KEYS[1])
            return 1
        else
            return 0
        end
        """

        result = await self.redis.eval(
            release_script, 1, self.lock_key, self.lock_id
        )

        if int(result) == 1:
            self._acquired = False
            return True

        # Lock was not owned (possibly expired or another process acquired it)
        self._acquired = False
        return False

    async def __aenter__(self) -> 'DistributedLock':
        """Async context manager entry - acquire the lock."""
        if not await self.acquire():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Could not acquire lock for {self.lock_key}"
            )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        """Async context manager exit - release the lock."""
        if self._acquired:
            await self.release()


# Module-level Redis client instance
_redis_client: Optional[redis.Redis] = None

# Factory function to create distributed locks
async def get_distributed_lock(lock_key: str, ttl: int = 30) -> DistributedLock:
    """
    Create a distributed lock instance.

    Args:
        lock_key: Unique identifier for the lock
        ttl: Time to live in seconds

    Returns:
        DistributedLock instance
    """
    global _redis_client

    # Create Redis client if not already available
    if _redis_client is None:
        _redis_client = redis.from_url(
            settings.redis.url,
            encoding='utf-8',
            decode_responses=True
        )

    return DistributedLock(
        redis_client=_redis_client,
        lock_key=lock_key,
        ttl=ttl
    )