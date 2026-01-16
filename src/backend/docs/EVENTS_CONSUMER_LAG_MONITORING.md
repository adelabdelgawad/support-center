# Redis Streams Consumer Lag Monitoring

## Overview

This document describes the consumer group lag monitoring implementation for the Redis Streams event transport system. The monitoring endpoints provide visibility into backpressure and consumer health.

## Architecture

### Redis Streams Consumer Groups

The event transport system uses Redis Streams with consumer groups:

```
Stream: events:chat
├── Consumer Group: signalr-consumers
│   ├── Consumers: [instance-1, instance-2, ...]
│   └── Lag: Number of unprocessed entries
│
Stream: events:ticket
├── Consumer Group: signalr-consumers
│   └── ...
│
Stream: events:remote
├── Consumer Group: signalr-consumers
│   └── ...
```

### Lag Calculation

Lag is calculated using `XINFO GROUPS`:

```
XINFO GROUPS events:chat
→ [
    {
      "name": "signalr-consumers",
      "lag": 123,        # Unprocessed entries
      "consumers": 2     # Active consumers
    }
  ]
```

## API Endpoints

### 1. Get Consumer Lag

**Endpoint:** `GET /api/v1/events/consumer-lag`

**Authentication:** Required (Bearer token)

**Response:**
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

**Lag Interpretation:**

| Lag Range | Status | Action |
|-----------|--------|--------|
| 0 | Healthy | No backpressure |
| 1-100 | Healthy | Normal processing |
| 100-1000 | Degraded | Monitor closely |
| >1000 | Unhealthy | Consumer overwhelmed |

**Metrics:**
- Updates Prometheus gauge `event_consumer_lag` for each stream
- Labels: `stream`, `consumer_group`

### 2. List Streams

**Endpoint:** `GET /api/v1/events/streams`

**Authentication:** Required

**Response:**
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

### 3. Health Check

**Endpoint:** `GET /api/v1/events/health`

**Authentication:** Required

**Response:**
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
  "total_lag": 168,
  "consumer_group": "signalr-consumers"
}
```

**Status Criteria:**
- `healthy`: All streams have lag < 100
- `degraded`: Any stream has lag 100-1000
- `unhealthy`: Any stream has lag > 1000

## Implementation Details

### File Structure

```
backend/
├── api/v1/endpoints/
│   └── events.py              # New monitoring endpoints
├── core/
│   ├── config.py              # Event transport settings
│   └── metrics.py             # Prometheus metrics (update_consumer_lag)
└── services/
    └── event_publisher.py     # Redis Streams publisher
```

### Key Functions

#### `get_stream_lag()`

Retrieves consumer group lag for a specific stream using `XINFO GROUPS` and `XINFO CONSUMERS`.

**Parameters:**
- `redis_client`: Redis async client
- `stream`: Stream name (e.g., "events:chat")
- `consumer_group`: Consumer group name (from settings)

**Returns:**
```python
{
    "lag": 123,              # Unprocessed entries
    "consumers": ["instance-1"]  # Active consumer names
}
```

**Error Handling:**
- `NOGROUP`: Consumer group doesn't exist → returns lag=0
- Connection errors: Logged and re-raised
- Other errors: Logged and re-raised

#### `get_consumer_lag()`

Main endpoint handler that aggregates lag across all streams.

**Flow:**
1. Create Redis client
2. For each stream in `DEFAULT_STREAMS`:
   - Call `get_stream_lag()`
   - Update Prometheus metrics via `update_consumer_lag()`
   - Aggregate results
3. Return summary with total_lag and stream_count

**Error Handling:**
- Per-stream errors are captured in response with `lag: -1` and error message
- Logs detailed error for debugging
- Continues processing other streams on failure

## Configuration

### Environment Variables

```bash
# Event Transport Settings
EVENT_TRANSPORT_USE_REDIS_STREAMS=true
EVENT_TRANSPORT_REDIS_STREAMS_PERCENTAGE=100
EVENT_TRANSPORT_FALLBACK_TO_HTTP=true
EVENT_TRANSPORT_STREAM_MAX_LEN=10000
EVENT_TRANSPORT_CONSUMER_GROUP=signalr-consumers
EVENT_TRANSPORT_PUBLISH_TIMEOUT_MS=100

# Redis Settings
REDIS_URL=redis://localhost:6380/0
REDIS_MAX_CONNECTIONS=30
```

### Default Streams

Defined in `events.py`:
```python
DEFAULT_STREAMS = [
    "events:chat",     # Chat messages, typing indicators
    "events:ticket",   # Status changes, assignments
    "events:remote",   # Remote access session events
]
```

## Prometheus Metrics

### event_consumer_lag

Gauge metric tracking unprocessed entries per stream.

**Labels:**
- `stream`: Stream name (events:chat, events:ticket, events:remote)
- `consumer_group`: Consumer group name (signalr-consumers)

**Example Queries:**

```promql
# Current lag per stream
event_consumer_lag

# Total lag across all streams
sum(event_consumer_lag)

# Streams with high lag (>1000)
event_consumer_lag > 1000

# Lag rate of change (entries/second)
rate(event_consumer_lag[5m])
```

### Alerting Rules

```yaml
groups:
  - name: event_transport
    rules:
      - alert: HighEventConsumerLag
        expr: event_consumer_lag > 1000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High consumer lag on stream {{ $labels.stream }}"
          description: "{{ $value }} unprocessed entries"

      - alert: CriticalEventConsumerLag
        expr: event_consumer_lag > 5000
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Critical consumer lag on stream {{ $labels.stream }}"
          description: "{{ $value }} unprocessed entries, consumer may be stuck"
```

## Troubleshooting

### High Lag Scenarios

**Symptoms:**
- Lag consistently > 1000
- Increasing lag trend
- Health status: unhealthy

**Possible Causes:**
1. **SignalR consumer is down**
   - Check SignalR service health
   - Verify consumer instances are running
   - Check consumer logs for errors

2. **Slow event processing**
   - Check SignalR handler performance
   - Profile broadcast latency
   - Check network bandwidth

3. **Event burst**
   - Temporary spike in event volume
   - Monitor if lag decreases over time
   - Consider scaling consumers

4. **Redis connection issues**
   - Check Redis connection pool
   - Verify network connectivity
   - Check Redis slowlog

### Debugging Commands

**Check stream info:**
```bash
redis-cli XINFO STREAM events:chat
```

**Check consumer groups:**
```bash
redis-cli XINFO GROUPS events:chat
```

**Check consumer details:**
```bash
redis-cli XINFO CONSUMERS events:chat signalr-consumers
```

**Read pending entries:**
```bash
redis-cli XPENDING events:chat signalr-consumers
```

**Read entries for specific consumer:**
```bash
redis-cli XPENDING events:chat signalr-consumers - + 10 instance-1
```

### Recovery Actions

**If consumer is stuck:**
1. Restart SignalR consumer service
2. Check for blocking operations in handlers
3. Verify consumer group name matches
4. Check consumer claim lag (idle time)

**If Redis is overwhelmed:**
1. Increase `EVENT_TRANSPORT_STREAM_MAX_LEN`
2. Add Redis memory
3. Check for memory-intensive operations
4. Monitor Redis `used_memory` metric

## Testing

### Manual Testing

```bash
# 1. Check health
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/v1/events/health

# 2. Get consumer lag
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/v1/events/consumer-lag

# 3. List streams
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/v1/events/streams
```

### Load Testing

Generate test events to create lag:

```python
import asyncio
import redis.asyncio as redis

async def generate_test_events():
    r = await redis.from_url("redis://localhost:6380")

    # Add 1000 test events
    for i in range(1000):
        await r.xadd("events:chat", {
            "event_type": "test_message",
            "data": f"test_{i}"
        })

    await r.close()

asyncio.run(generate_test_events())
```

Then check lag:
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/v1/events/consumer-lag
```

## Performance Considerations

### Endpoint Overhead

- **Per-stream latency:** ~5-10ms (local Redis)
- **Total latency:** ~15-30ms for 3 streams
- **Redis operations:** 2 per stream (XINFO GROUPS + XINFO CONSUMERS)

### Caching Strategy

Consider caching results for:
- Health checks: 5-10 seconds
- Consumer lag: 1-5 seconds (real-time monitoring)

### Rate Limiting

For production, consider:
- Rate limit to 10 requests/second per user
- Cache results for all users
- Use WebSocket for real-time updates

## Future Enhancements

1. **Historical Lag Tracking**
   - Store lag metrics in database
   - Provide lag trends over time
   - Predict lag growth patterns

2. **Consumer-Specific Metrics**
   - Per-consumer lag breakdown
   - Consumer health scores
   - Automatic consumer scaling recommendations

3. **Alerting Integration**
   - Webhook alerts for high lag
   - Slack/email notifications
   - Auto-remediation triggers

4. **Dashboard**
   - Real-time lag visualization
   - Stream throughput graphs
   - Consumer instance health

## References

- [Redis Streams Documentation](https://redis.io/docs/data-types/streams/)
- [XINFO Command Reference](https://redis.io/commands/xinfo/)
- [Consumer Groups](https://redis.io/docs/data-types/streams/#consumer-groups)
- [Event Transport Architecture](../docs/001-realtime-latency-optimization/)
