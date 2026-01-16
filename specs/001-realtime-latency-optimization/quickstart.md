# Quickstart: Real-Time Messaging Latency Optimization

**Feature**: 001-realtime-latency-optimization
**Date**: 2026-01-16

## Prerequisites

- Python 3.12+ with `uv` package manager
- Redis 7.0+ (already running at `redis://localhost:6380`)
- .NET 8+ SDK (for SignalR service modifications)
- Docker & Docker Compose

## Development Setup

### 1. Verify Redis Streams Support

```bash
# Connect to Redis
redis-cli -p 6380

# Test Streams commands
XINFO STREAM events:test 2>/dev/null || echo "Stream doesn't exist yet (OK)"

# Create test stream
XADD events:test * message "hello"
XREAD STREAMS events:test 0

# Cleanup
DEL events:test
```

### 2. Backend Setup

```bash
cd src/backend

# Install dependencies
uv sync

# Verify Redis connection
python -c "import redis; r = redis.from_url('redis://localhost:6380'); print('Redis OK:', r.ping())"

# Run backend with auto-reload
uvicorn main:app --reload --port 8000
```

### 3. Run Tests

```bash
cd src/backend

# Unit tests
pytest tests/unit/ -v

# Integration tests (requires Redis)
pytest tests/integration/ -v

# Specific test file (when implemented)
pytest tests/unit/test_event_publisher.py -v
```

## Feature Flag Configuration

The optimization is controlled by environment variables. Default is HTTP transport (current behavior).

### Environment Variables

```bash
# .env file additions for this feature

# Master switch for Redis Streams transport
EVENT_TRANSPORT_USE_REDIS_STREAMS=false

# Gradual rollout percentage (0-100)
EVENT_TRANSPORT_REDIS_PERCENTAGE=0

# Fallback to HTTP if Redis fails
EVENT_TRANSPORT_FALLBACK_TO_HTTP=true

# Coalescing settings
EVENT_COALESCING_ENABLED=true
EVENT_COALESCING_WINDOW_MS=100
```

### Enabling Redis Streams (Development)

```bash
# Full Redis Streams mode
EVENT_TRANSPORT_USE_REDIS_STREAMS=true
EVENT_TRANSPORT_REDIS_PERCENTAGE=100

# Or gradual rollout (10% of events)
EVENT_TRANSPORT_USE_REDIS_STREAMS=true
EVENT_TRANSPORT_REDIS_PERCENTAGE=10
```

## Monitoring & Debugging

### View Redis Streams

```bash
# Monitor all events in real-time
redis-cli -p 6380 MONITOR

# Check stream info
redis-cli -p 6380 XINFO STREAM events:chat

# View pending messages
redis-cli -p 6380 XINFO GROUPS events:chat

# Read recent events
redis-cli -p 6380 XREVRANGE events:chat + - COUNT 10
```

### Prometheus Metrics

After implementation, these metrics will be available at `/metrics`:

```
# Publish latency histogram
event_publish_duration_seconds_bucket{transport="redis",event_type="chat_message",le="0.1"}

# Queue depth
event_queue_depth{stream="events:chat"}

# Events coalesced
events_coalesced_total{event_type="typing"}
```

### Log Levels

```bash
# Enable debug logging for event transport
LOG_LEVEL=DEBUG PYTHONPATH=. uvicorn main:app --reload
```

## Manual Testing

### 1. Test Event Publishing (HTTP baseline)

```bash
# Send a chat message via API
curl -X POST http://localhost:8000/api/v1/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"request_id": "test-123", "content": "Hello"}'
```

### 2. Test Event Publishing (Redis Streams)

```bash
# Enable Redis Streams
export EVENT_TRANSPORT_USE_REDIS_STREAMS=true

# Send message and verify in Redis
redis-cli -p 6380 XREAD BLOCK 5000 STREAMS events:chat $

# In another terminal, send the message
curl -X POST http://localhost:8000/api/v1/messages ...
```

### 3. Test Coalescing

```bash
# Send rapid typing events
for i in {1..10}; do
  curl -X POST http://localhost:8000/api/v1/requests/test-123/typing \
    -H "Authorization: Bearer $TOKEN" &
done
wait

# Verify only ~1-2 events published (not 10)
redis-cli -p 6380 XLEN events:chat
```

## Rollback Procedure

If issues occur in production:

```bash
# Immediate rollback - no deployment needed
# Set in environment or .env:
EVENT_TRANSPORT_USE_REDIS_STREAMS=false

# Restart services to pick up new config
docker-compose restart backend

# Redis Streams consumer will idle (no impact)
```

## File Structure

```
src/backend/
├── services/
│   ├── signalr_client.py      # Modified: uses EventPublisher
│   ├── event_publisher.py     # New: abstract publisher
│   └── event_coalescer.py     # New: typing coalescing
├── core/
│   ├── config.py              # Modified: EventTransportSettings
│   └── metrics.py             # Modified: latency metrics
└── tests/
    ├── unit/
    │   └── test_event_publisher.py
    └── integration/
        └── test_redis_streams.py
```

## Common Issues

### Redis Connection Failed

```
Error: Connection refused to redis://localhost:6380
Solution: Ensure Redis is running: docker-compose up -d redis
```

### Stream Not Created

```
Error: NOGROUP No such key 'events:chat'
Solution: Consumer group auto-created on first read. No action needed.
```

### Metrics Not Showing

```
Problem: /metrics endpoint missing new metrics
Solution: Restart backend after code changes. Metrics registered on import.
```

## Next Steps

1. Review `plan.md` for implementation phases
2. Run `/speckit.tasks` to generate task breakdown
3. Begin with Phase 2.1: Instrumentation (baseline metrics)
