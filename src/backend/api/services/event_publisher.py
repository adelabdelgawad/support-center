"""
Redis Streams publisher for real-time event transport.

Publishes events to Redis Streams for low-latency delivery to SignalR service.
"""

import logging
import time
from typing import Any, Dict

from core.config import settings
from core.metrics import track_event_publish, track_transport_fallback
from api.services.event_models import StreamEvent

logger = logging.getLogger(__name__)

# Constants
STREAM_MAX_LEN = 10000
CONSUMER_GROUP = "signalr-consumers"
PUBLISH_TIMEOUT_MS = 100


class RedisStreamsPublisher:
    """Publishes events to Redis Streams for low-latency delivery.

    Uses XADD with MAXLEN for bounded memory and async fire-and-forget
    semantics. Events are consumed by SignalR service via XREADGROUP.
    """

    def __init__(self):
        self._redis: Any = None
        self._redis: Any = None

    async def _get_redis(self):
        """Get Redis client from cache manager."""
        if self._redis is None:
            import redis.asyncio as redis

            self._redis = redis.Redis.from_url(
                settings.redis.url,
                **settings.redis.redis_config,
                decode_responses=False,  # We need bytes for XREAD consistency
            )
        return self._redis

    async def publish(self, stream: str, event: StreamEvent) -> bool:
        """Publish event to Redis Stream via XADD.

        Args:
            stream: Stream name (e.g., "events:chat")
            event: StreamEvent to publish

        Returns:
            True if successful, False otherwise
        """
        try:
            redis = await self._get_redis()

            # Convert event to XADD format (all values must be strings)
            stream_data = event.to_stream_dict()

            # Publish with MAXLEN for bounded memory
            entry_id = await redis.xadd(
                stream,
                stream_data,
                maxlen=STREAM_MAX_LEN,
                approximate=True,  # Performance optimization
            )

            logger.debug(
                f"RedisStreamsPublisher: Published {event.event_type} to {stream} "
                f"(entry_id: {entry_id})"
            )
            return True

        except Exception as e:
            # Import redis to check for specific exception types
            import redis.asyncio as redis_lib

            # Handle specific Redis connection errors
            if isinstance(e, (redis_lib.ConnectionError, redis_lib.TimeoutError)):
                error_type = "timeout" if isinstance(e, redis_lib.TimeoutError) else "redis_error"

                logger.error(
                    f"RedisStreamsPublisher: Redis connection failed while publishing "
                    f"{event.event_type} to {stream} - {type(e).__name__}: {e}"
                )

                # Track the fallback metric
                track_transport_fallback(reason=error_type)

                return False
            else:
                # Handle other Redis errors
                logger.error(
                    f"RedisStreamsPublisher: Failed to publish {event.event_type} to {stream} "
                    f"- {type(e).__name__}: {e}",
                    exc_info=True
                )
                return False

    async def close(self):
        """Close Redis connection."""
        if self._redis is not None:
            await self._redis.close()
            self._redis = None


# Global publisher instance
redis_streams_publisher = RedisStreamsPublisher()


async def publish_event(event_type: str, room_id: str, payload: Dict[str, Any]) -> bool:
    """
    Publish event to Redis Streams.

    Args:
        event_type: Event type (e.g., "chat_message", "typing_start")
        room_id: Target room ID
        payload: Event payload

    Returns:
        True if successful, False otherwise
    """
    if not settings.signalr.enabled:
        logger.debug("SignalR broadcasting is disabled, skipping event publish")
        return False

    # Create StreamEvent
    event = StreamEvent(
        event_type=event_type,
        room_id=room_id,
        payload=payload,
    )

    # Determine stream name from event type
    stream = _get_stream_name(event_type)

    # Publish via Redis Streams
    start_time = time.time()
    success = await redis_streams_publisher.publish(stream, event)
    duration = time.time() - start_time

    # Track metrics
    track_event_publish(
        transport="redis_streams",
        event_type=event_type,
        duration_seconds=duration,
        success=success
    )

    return success


def _get_stream_name(event_type: str) -> str:
    """Get the Redis Stream name for an event type.

    Args:
        event_type: Event type string

    Returns:
        Redis Stream key (e.g., "events:chat")
    """
    if event_type in ("chat_message", "typing_start", "typing_stop", "read_receipt"):
        return "events:chat"
    elif event_type in ("status_change", "assignment_change", "notification"):
        return "events:ticket"
    elif event_type in ("remote_session_start", "remote_session_end"):
        return "events:remote"
    else:
        return "events:chat"  # Default
