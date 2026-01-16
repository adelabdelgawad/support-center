# Consumer Lag Monitoring - Code Snippets

## Core Implementation

### Main Endpoint Function

```python
@router.get("/consumer-lag")
async def get_consumer_lag(
    current_user: User = Depends(get_current_user),
):
    """
    Get consumer group lag for all event streams.
    
    Returns lag information for each Redis Stream consumer group,
    indicating the number of unprocessed entries (backpressure).
    """
    # Get Redis client
    redis_client = redis.Redis.from_url(
        settings.redis.url,
        **settings.redis.redis_config,
        decode_responses=False,
    )

    try:
        result = {
            "streams": {},
            "total_lag": 0,
            "stream_count": 0,
        }

        consumer_group = settings.event_transport.consumer_group

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
                    consumer_group=consumer_group,
                    lag=lag_info["lag"]
                )

            except Exception as e:
                logger.error(f"Failed to get lag for stream '{stream}': {e}")
                result["streams"][stream] = {
                    "lag": -1,
                    "consumers": [],
                    "error": str(e)
                }

        return result

    finally:
        await redis_client.close()
```

### Redis XINFO Helper Function

```python
async def get_stream_lag(
    redis_client: redis.Redis,
    stream: str,
    consumer_group: str
) -> Dict[str, Any]:
    """
    Get consumer group lag information for a specific stream.
    
    Uses XINFO GROUPS to retrieve lag data for the consumer group.
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
            return {"lag": 0, "consumers": []}
        else:
            logger.error(f"Redis error getting lag for stream '{stream}': {e}")
            raise
```

### Health Check Endpoint

```python
@router.get("/health")
async def events_health_check(
    current_user: User = Depends(get_current_user),
):
    """
    Health check for the Redis Streams event transport system.
    
    Returns overall health status and lag summary for all event streams.
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
        logger.error(f"Redis connection failed: {e}")
        return {
            "status": "unhealthy",
            "redis_connected": False,
            "error": "Cannot connect to Redis"
        }

    try:
        consumer_group = settings.event_transport.consumer_group
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
            "transport_mode": "redis_streams" if settings.event_transport.use_redis_streams else "http",
            "streams": stream_status,
            "max_lag": max_lag,
            "total_lag": total_lag,
            "consumer_group": consumer_group
        }

    finally:
        await redis_client.close()
```

## Router Registration

```python
# api/v1/__init__.py

from .endpoints import (
    # ... other imports ...
    events,
)

api_router = APIRouter()

# ... other routers ...

# Events Monitoring (Redis Streams)
api_router.include_router(
    events.router, prefix="/events", tags=["Events"]
)
```

## Stream Configuration

```python
# api/v1/endpoints/events.py

# Default stream names based on event_types.py
DEFAULT_STREAMS = [
    "events:chat",     # Chat messages, typing indicators
    "events:ticket",   # Status changes, assignments
    "events:remote",   # Remote access session events
]
```

## Metrics Update

```python
# From core.metrics.py

def update_consumer_lag(stream: str, consumer_group: str, lag: int):
    """Update consumer group lag gauge.
    
    Args:
        stream: Stream name
        consumer_group: Consumer group name
        lag: Number of unprocessed entries
    """
    event_consumer_lag.labels(
        stream=stream,
        consumer_group=consumer_group
    ).set(lag)
```

## Configuration

```python
# From core/config.py

class EventTransportSettings(BaseSettings):
    """Event transport configuration for Redis Streams vs HTTP."""
    
    consumer_group: str = Field(
        default="signalr-consumers",
        description="Redis Streams consumer group name"
    )
    
    use_redis_streams: bool = Field(
        default=False,
        description="Enable Redis Streams event transport"
    )
    
    redis_streams_percentage: int = Field(
        default=0,
        ge=0,
        le=100,
        description="Percentage of traffic to route via Redis Streams"
    )
```

## Usage Example

```python
import httpx

async def check_consumer_lag():
    """Check consumer lag for all event streams."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "http://localhost:8000/api/v1/events/consumer-lag",
            headers={"Authorization": "Bearer <token>"}
        )
        data = response.json()

        # Check each stream
        for stream, info in data["streams"].items():
            lag = info["lag"]
            consumers = info["consumers"]

            if lag < 100:
                status = "✅ Healthy"
            elif lag < 1000:
                status = "⚠️ Degraded"
            else:
                status = "🔴 Unhealthy"

            print(f"{stream}: {status}")
            print(f"  Lag: {lag}")
            print(f"  Consumers: {consumers}")

        print(f"\nTotal lag: {data['total_lag']}")
```

## Redis Commands

### Check Stream Info
```bash
redis-cli XINFO STREAM events:chat
```

### Check Consumer Groups
```bash
redis-cli XINFO GROUPS events:chat
```

### Check Consumers
```bash
redis-cli XINFO CONSUMERS events:chat signalr-consumers
```

### Check Pending Entries
```bash
redis-cli XPENDING events:chat signalr-consumers
```

## Prometheus Queries

```promql
# Current lag per stream
event_consumer_lag

# Total lag across all streams
sum(event_consumer_lag)

# Streams with high lag
event_consumer_lag > 1000

# Lag rate of change
rate(event_consumer_lag[5m])

# Alert rule
ALERT HighEventConsumerLag
  IF event_consumer_lag > 1000
  FOR 5m
  LABELS { severity = "warning" }
  ANNOTATIONS {
    summary = "High consumer lag on stream {{ $labels.stream }}",
    description = "{{ $value }} unprocessed entries"
  }
```
