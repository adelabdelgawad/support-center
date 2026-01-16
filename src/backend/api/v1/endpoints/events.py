"""
Events API endpoints for monitoring Redis Streams consumer lag.

This module provides endpoints for monitoring the health and performance
of the Redis Streams event transport system, including consumer group lag
monitoring to detect backpressure.
"""

import logging
from typing import Any, Dict, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

import redis.asyncio as redis

from core.config import settings
from core.dependencies import get_current_user
from core.metrics import update_consumer_lag
from models import User

logger = logging.getLogger(__name__)
router = APIRouter()

# Constants
CONSUMER_GROUP = "signalr-consumers"

# Default stream names based on event_types.py
DEFAULT_STREAMS = [
    "events:chat",
    "events:ticket",
    "events:remote",
]


async def get_stream_lag(
    redis_client: redis.Redis,
    stream: str,
    consumer_group: str
) -> Dict[str, Any]:
    """
    Get consumer group lag information for a specific stream.

    Uses XINFO GROUPS to retrieve lag data for the consumer group.

    Args:
        redis_client: Redis async client
        stream: Stream name (e.g., "events:chat")
        consumer_group: Consumer group name (e.g., "signalr-consumers")

    Returns:
        Dictionary with lag and consumer information:
        {
            "lag": 123,  # Number of unprocessed entries
            "consumers": ["instance-1", "instance-2"]  # Active consumer names
        }
    """
    try:
        # Get consumer group info
        groups_info = await redis_client.xinfo_groups(stream)

        # Find our consumer group
        group_data = None
        for group in groups_info:
            if group.get(b"name", b"").decode() == consumer_group:
                group_data = group
                break

        if not group_data:
            # Consumer group doesn't exist yet
            logger.debug(
                f"Consumer group '{consumer_group}' not found for stream '{stream}'"
            )
            return {"lag": 0, "consumers": []}

        # Extract lag (number of unprocessed entries)
        lag = int(group_data.get(b"lag", 0))

        # Get consumer info for this group
        consumers_info = await redis_client.xinfo_consumers(stream, consumer_group)
        consumers = [
            consumer.get(b"name", b"").decode()
            for consumer in consumers_info
        ]

        return {
            "lag": lag,
            "consumers": consumers
        }

    except redis.ResponseError as e:
        if "NOGROUP" in str(e):
            # Consumer group doesn't exist
            logger.debug(
                f"Consumer group '{consumer_group}' does not exist for stream '{stream}'"
            )
            return {"lag": 0, "consumers": []}
        else:
            logger.error(
                f"Redis error getting lag for stream '{stream}': {e}",
                exc_info=True
            )
            raise

    except Exception as e:
        logger.error(
            f"Unexpected error getting lag for stream '{stream}': {e}",
            exc_info=True
        )
        raise


@router.get("/consumer-lag")
async def get_consumer_lag(
    current_user: User = Depends(get_current_user),
):
    """
    Get consumer group lag for all event streams.

    Returns lag information for each Redis Stream consumer group,
    indicating the number of unprocessed entries (backpressure).

    **Permissions**: Authenticated users

    **Response**:
        ```json
        {
            "streams": {
                "events:chat": {
                    "lag": 123,
                    "consumers": ["instance-1", "instance-2"]
                },
                "events:ticket": {
                    "lag": 45,
                    "consumers": ["instance-1"]
                },
                "events:remote": {
                    "lag": 0,
                    "consumers": ["instance-1"]
                }
            },
            "total_lag": 168,
            "stream_count": 3
        }
        ```

    **Lag Interpretation**:
    - `lag: 0` - No backpressure, consumer is up to date
    - `lag: 1-100` - Normal processing
    - `lag: 100-1000` - Elevated backpressure, monitor closely
    - `lag: >1000` - High backpressure, consumer may be overwhelmed

    **Metrics**:
    Updates Prometheus gauge `event_consumer_lag` for each stream.
    """
    # Get Redis client
    redis_client = redis.Redis.from_url(
        settings.redis.url,
        **settings.redis.redis_config,
        decode_responses=False,  # Need bytes for XINFO
    )

    try:
        result = {
            "streams": {},
            "total_lag": 0,
            "stream_count": 0,
        }

        # Hardcoded consumer group constant
        CONSUMER_GROUP = "signalr-consumers"

        # Check each stream
        for stream in DEFAULT_STREAMS:
            try:
                lag_info = await get_stream_lag(redis_client, stream, consumer_group)

                result["streams"][stream] = lag_info
                result["total_lag"] += lag_info["lag"]
                result["stream_count"] += 1

                # Update Prometheus metrics
                update_consumer_lag(
                    stream=stream,
                    consumer_group=CONSUMER_GROUP,
                    lag=lag_info["lag"]
                )

            except Exception as e:
                logger.error(
                    f"Failed to get lag for stream '{stream}': {e}",
                    exc_info=True
                )
                # Include error in response for debugging
                result["streams"][stream] = {
                    "lag": -1,  # -1 indicates error
                    "consumers": [],
                    "error": str(e)
                }

        return result

    finally:
        await redis_client.close()


@router.get("/streams")
async def list_streams(
    current_user: User = Depends(get_current_user),
):
    """
    List all event streams and their basic information.

    Returns a list of all known event streams with their current
    length and consumer group information.

    **Permissions**: Authenticated users

    **Response**:
        ```json
        {
            "streams": [
                {
                    "name": "events:chat",
                    "length": 1234,
                    "groups": 1,
                    "consumer_group": "signalr-consumers"
                },
                {
                    "name": "events:ticket",
                    "length": 567,
                    "groups": 1,
                    "consumer_group": "signalr-consumers"
                }
            ]
        }
        ```
    """
    redis_client = redis.Redis.from_url(
        settings.redis.url,
        **settings.redis.redis_config,
        decode_responses=False,
    )

    try:
        streams_info = []
        consumer_group = "signalr-consumers"

        for stream in DEFAULT_STREAMS:
            try:
                # Get stream info
                info = await redis_client.xinfo_stream(stream)

                stream_data = {
                    "name": stream,
                    "length": info.get(b"length", 0),
                    "groups": info.get(b"groups", 0),
                    "consumer_group": consumer_group,
                }
                streams_info.append(stream_data)

            except redis.ResponseError as e:
                if "NOGROUP" in str(e) or "ERR" in str(e):
                    # Stream doesn't exist or has no groups
                    stream_data = {
                        "name": stream,
                        "length": 0,
                        "groups": 0,
                        "consumer_group": consumer_group,
                        "note": "Stream does not exist or has no consumer groups"
                    }
                    streams_info.append(stream_data)
                else:
                    raise

        return {"streams": streams_info}

    finally:
        await redis_client.close()


@router.get("/health")
async def events_health_check(
    current_user: User = Depends(get_current_user),
):
    """
    Health check for the Redis Streams event transport system.

    Returns overall health status and lag summary for all event streams.

    **Permissions**: Authenticated users

    **Response**:
        ```json
        {
            "status": "healthy",
            "redis_connected": true,
            "transport_mode": "redis_streams",
            "streams": {
                "healthy": 3,
                "degraded": 0,
                "unhealthy": 0
            },
            "max_lag": 123,
            "total_lag": 168
        }
        ```

    **Status Criteria**:
    - `healthy`: All streams have lag < 100
    - `degraded`: Any stream has lag 100-1000
    - `unhealthy`: Any stream has lag > 1000
    """
    redis_client = redis.Redis.from_url(
        settings.redis.url,
        **settings.redis.redis_config,
        decode_responses=False,
    )

    try:
        # Test Redis connection
        await redis_client.ping()
        redis_connected = True

    except Exception as e:
        logger.error(f"Redis connection failed: {e}", exc_info=True)
        return {
            "status": "unhealthy",
            "redis_connected": False,
            "transport_mode": "redis_streams",
            "error": "Cannot connect to Redis"
        }

    try:
        consumer_group = "signalr-consumers"
        stream_status = {"healthy": 0, "degraded": 0, "unhealthy": 0}
        max_lag = 0
        total_lag = 0

        # Check each stream
        for stream in DEFAULT_STREAMS:
            try:
                lag_info = await get_stream_lag(redis_client, stream, consumer_group)
                lag = lag_info["lag"]

                total_lag += lag
                max_lag = max(max_lag, lag)

                # Categorize stream health
                if lag < 100:
                    stream_status["healthy"] += 1
                elif lag < 1000:
                    stream_status["degraded"] += 1
                else:
                    stream_status["unhealthy"] += 1

            except Exception as e:
                logger.error(f"Health check failed for stream '{stream}': {e}")
                stream_status["unhealthy"] += 1

        # Determine overall status
        if stream_status["unhealthy"] > 0:
            overall_status = "unhealthy"
        elif stream_status["degraded"] > 0:
            overall_status = "degraded"
        else:
            overall_status = "healthy"

        return {
            "status": overall_status,
            "redis_connected": redis_connected,
            "transport_mode": "redis_streams",
            "streams": stream_status,
            "max_lag": max_lag,
            "total_lag": total_lag,
            "consumer_group": consumer_group
        }

    finally:
        await redis_client.close()
