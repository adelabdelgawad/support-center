# Event Transport Configuration Guide

## Overview

This document describes the event transport system (Feature 001: Real-Time Latency Optimization) that delivers events from FastAPI to SignalR for broadcasting to connected clients. The system supports two transport backends with automatic failover:

- **HTTP Bridge** (original): FastAPI calls SignalR internal HTTP endpoints
- **Redis Streams** (new): FastAPI publishes to Redis Streams, SignalR consumes via XREADGROUP

### Architecture

```
FastAPI Event Publisher
    |
    +-- PublisherFactory (selects transport)
    |
    +-- HttpPublisher --[HTTP]--> SignalR Internal API
    |                                      |
    |                                      v
    |                                 SignalR Hubs
    |                                      |
    +-- RedisStreamsPublisher             (WebSocket)
            |                               |
            v                               v
        Redis Streams                  Clients
            (XADD)                         |
            |                              |
        SignalR Consumer                   v
        (XREADGROUP)                  Browser/Desktop
            |
            v
        SignalR Hubs
            |
        (WebSocket)
            |
            v
        Clients
```

### Benefits of Redis Streams

- **Lower latency**: ~10-50ms end-to-end vs 100-500ms for HTTP
- **Better throughput**: Batching with XREADGROUP (100 entries/block)
- **Consumer groups**: Automatic load balancing across multiple SignalR instances
- **Message persistence**: Messages retained in stream until acknowledged
- **No HTTP overhead**: No connection pooling, HTTP headers, or JSON serialization

---

## Environment Variables

All event transport settings use the `EVENT_TRANSPORT_` prefix.

### EVENT_TRANSPORT_USE_REDIS_STREAMS

**Type:** `bool`
**Default:** `false`
**Description:** Master switch for Redis Streams transport.

**Behavior:**
- `false`: All events route via HTTP bridge (original behavior)
- `true`: Events route based on `EVENT_TRANSPORT_REDIS_STREAMS_PERCENTAGE`

**Example:**
```bash
# Enable Redis Streams transport
EVENT_TRANSPORT_USE_REDIS_STREAMS=true
```

### EVENT_TRANSPORT_REDIS_STREAMS_PERCENTAGE

**Type:** `int`
**Range:** `0-100`
**Default:** `0`
**Description:** Percentage of traffic to route via Redis Streams (gradual rollout).

**Behavior:**
- `0`: All events via HTTP (when master switch enabled)
- `1-99`: Random selection per event (A/B testing)
- `100`: All events via Redis Streams

**Example:**
```bash
# Route 10% of traffic to Redis Streams
EVENT_TRANSPORT_REDIS_STREAMS_PERCENTAGE=10

# Full rollout to Redis Streams
EVENT_TRANSPORT_REDIS_STREAMS_PERCENTAGE=100
```

**Rollout Strategy:**
```bash
# Phase 1: 10% (canary)
EVENT_TRANSPORT_REDIS_STREAMS_PERCENTAGE=10

# Phase 2: 25% (limited rollout)
EVENT_TRANSPORT_REDIS_STREAMS_PERCENTAGE=25

# Phase 3: 50% (half traffic)
EVENT_TRANSPORT_REDIS_STREAMS_PERCENTAGE=50

# Phase 4: 100% (full cutover)
EVENT_TRANSPORT_REDIS_STREAMS_PERCENTAGE=100
```

### EVENT_TRANSPORT_FALLBACK_TO_HTTP

**Type:** `bool`
**Default:** `true`
**Description:** Automatically fall back to HTTP if Redis Streams publish fails.

**Behavior:**
- `true`: Try Redis Streams first, fallback to HTTP on error
- `false`: Only use Redis Streams, fail if unavailable

**Example:**
```bash
# Enable HTTP fallback (recommended during rollout)
EVENT_TRANSPORT_FALLBACK_TO_HTTP=true

# Disable fallback (after successful rollout)
EVENT_TRANSPORT_FALLBACK_TO_HTTP=false
```

**Fallback Reasons:**
- `redis_error`: Generic Redis connection error
- `timeout`: Redis operation timeout
- `connection_lost`: Redis connection dropped

### EVENT_TRANSPORT_STREAM_MAX_LEN

**Type:** `int`
**Range:** `1000-100000`
**Default:** `10000`
**Description:** Maximum approximate length of Redis Streams (memory management).

**Behavior:**
- Uses `MAXLEN ~` (approximate) for performance
- Old entries automatically evicted when limit exceeded
- Per-stream limit (applies to each stream independently)

**Example:**
```bash
# Lower memory usage (1 entry = ~1KB)
EVENT_TRANSPORT_STREAM_MAX_LEN=5000

# Higher throughput (more buffer for consumer lag)
EVENT_TRANSPORT_STREAM_MAX_LEN=20000
```

**Stream Sizing:**
```
Memory per entry: ~1KB (event_id + event_type + timestamp + room_id + payload)

Stream limits by usage:
- Low traffic (< 100 events/sec): 5000 (5MB)
- Medium traffic (100-1000 events/sec): 10000 (10MB)
- High traffic (> 1000 events/sec): 20000 (20MB)
```

### EVENT_TRANSPORT_CONSUMER_GROUP

**Type:** `str`
**Default:** `"signalr-consumers"`
**Description:** Redis Streams consumer group name for SignalR service.

**Behavior:**
- Must match between FastAPI and SignalR service
- Created automatically by SignalR consumer on startup
- Multiple consumers in group share load (each entry delivered once)

**Example:**
```bash
# Custom consumer group (if running multiple environments)
EVENT_TRANSPORT_CONSUMER_GROUP=signalr-consumers-prod

# Shared consumer group (A/B testing)
EVENT_TRANSPORT_CONSUMER_GROUP=signalr-consumers-v2
```

**Important:** Do not change this value unless migrating to a new consumer group. Changing causes messages published to old group to be unprocessed.

### EVENT_TRANSPORT_PUBLISH_TIMEOUT_MS

**Type:** `int`
**Range:** `10-5000`
**Default:** `100`
**Description:** Timeout for Redis Streams XADD operation in milliseconds.

**Behavior:**
- How long to wait for Redis response before failing
- Only affects `RedisStreamsPublisher`, not `HttpPublisher`
- Lower values fail fast on overloaded Redis

**Example:**
```bash
# Fast fail (high traffic)
EVENT_TRANSPORT_PUBLISH_TIMEOUT_MS=50

# Allow slower Redis (high latency network)
EVENT_TRANSPORT_PUBLISH_TIMEOUT_MS=250
```

---

## Example Configurations

### Development (HTTP Only)

```bash
# .env
EVENT_TRANSPORT_USE_REDIS_STREAMS=false
```

### Canary Rollout (10% Redis Streams)

```bash
# .env
EVENT_TRANSPORT_USE_REDIS_STREAMS=true
EVENT_TRANSPORT_REDIS_STREAMS_PERCENTAGE=10
EVENT_TRANSPORT_FALLBACK_TO_HTTP=true
EVENT_TRANSPORT_STREAM_MAX_LEN=10000
```

### Gradual Rollout (50/50 Split)

```bash
# .env
EVENT_TRANSPORT_USE_REDIS_STREAMS=true
EVENT_TRANSPORT_REDIS_STREAMS_PERCENTAGE=50
EVENT_TRANSPORT_FALLBACK_TO_HTTP=true
EVENT_TRANSPORT_STREAM_MAX_LEN=10000
```

### Full Redis Streams Production

```bash
# .env
EVENT_TRANSPORT_USE_REDIS_STREAMS=true
EVENT_TRANSPORT_REDIS_STREAMS_PERCENTAGE=100
EVENT_TRANSPORT_FALLBACK_TO_HTTP=false
EVENT_TRANSPORT_STREAM_MAX_LEN=20000
EVENT_TRANSPORT_PUBLISH_TIMEOUT_MS=100
```

### A/B Testing (New Consumer Group)

```bash
# .env (FastAPI)
EVENT_TRANSPORT_USE_REDIS_STREAMS=true
EVENT_TRANSPORT_REDIS_STREAMS_PERCENTAGE=100
EVENT_TRANSPORT_CONSUMER_GROUP=signalr-consumers-v2
```

```csharp
// RedisStreamConsumer.cs (SignalR service)
private const string ConsumerGroupName = "signalr-consumers-v2";
```

---

## Rollback Procedure

To immediately revert to HTTP transport:

### 1. FastAPI Configuration Change

```bash
# Edit .env
EVENT_TRANSPORT_USE_REDIS_STREAMS=false

# Restart FastAPI
docker-compose restart backend
# OR
systemctl restart support-center-backend
```

### 2. Verify Rollback

```bash
# Check logs for HTTP publisher
tail -f /var/log/support-center/backend.log | grep "HttpPublisher"

# Check metrics
curl http://localhost:9090/metrics | grep events_published_total
```

### 3. Clean Up (Optional)

After successful rollback, optionally delete Redis Streams:

```bash
# Connect to Redis
redis-cli -p 6380

# Delete streams (WARNING: irreversible)
DEL events:chat events:ticket events:notification events:remote

# Delete consumer groups
XGROUP DESTROY events:chat signalr-consumers
XGROUP DESTROY events:ticket signalr-consumers
XGROUP DESTROY events:notification signalr-consumers
XGROUP DESTROY events:remote signalr-consumers
```

---

## Monitoring Metrics

All metrics are exposed at `/metrics` (Prometheus format).

### Publish Metrics

```prometheus
# Time to publish event to transport layer
event_publish_duration_seconds{transport="http|redis_streams",event_type="chat_message"}

# Total events published
events_published_total{transport="http|redis_streams",event_type="typing_start",status="success|failure"}
```

### Delivery Metrics

```prometheus
# End-to-end latency (publish to SignalR broadcast)
event_delivery_duration_seconds{event_type="chat_message",transport="redis_streams"}

# Events coalesced (merged into single event)
events_coalesced_total{event_type="typing_start"}
```

### Consumer Metrics

```prometheus
# Number of unprocessed entries in consumer group
event_consumer_lag{stream="events:chat",consumer_group="signalr-consumers"}

# Current queue depth per stream
event_queue_depth{stream="events:ticket"}
```

### Fallback Metrics

```prometheus
# Number of HTTP fallbacks triggered
event_transport_fallback_total{reason="redis_error|timeout|connection_lost"}

# Dual-write status (if enabled)
event_dual_write_status
dual_write_success_total{transport="http|redis_streams"}
dual_write_failure_total{transport="http|redis_streams"}
```

### Example Prometheus Queries

```promql
# Redis Streams publish success rate
rate(events_published_total{transport="redis_streams",status="success"}[5m])
  / rate(events_published_total{transport="redis_streams"}[5m])

# P95 end-to-end latency for chat messages
histogram_quantile(0.95,
  rate(event_delivery_duration_seconds{event_type="chat_message"}[5m])
)

# Consumer lag across all streams
max(event_consumer_lag) by (stream)

# Fallback rate (should be < 1% in production)
rate(event_transport_fallback_total[5m])
  / rate(events_published_total{transport="redis_streams"}[5m])
```

---

## Troubleshooting

### High Consumer Lag

**Symptoms:**
- `event_consumer_lag{stream="events:chat"}` increasing
- Delayed message delivery to clients

**Causes:**
1. SignalR consumer not running
2. SignalR consumer overloaded (slow broadcast)
3. Redis connection issues

**Solutions:**
```bash
# Check SignalR consumer is running
docker ps | grep signalr-service
docker logs signalr-service --tail 100 | grep "RedisStreamConsumer"

# Check consumer group info
redis-cli -p 6380 XINFO GROUPS events:chat

# Scale SignalR service (horizontal)
docker-compose up -d --scale signalr-service=3

# Increase batch size in RedisStreamConsumer.cs
count: 100,  // Increase to 200
```

### Frequent HTTP Fallbacks

**Symptoms:**
- `event_transport_fallback_total{reason="..."}` increasing
- Events still delivered but via HTTP (higher latency)

**Causes:**
1. Redis connection dropped
2. Redis operation timeout
3. Redis server overloaded

**Solutions:**
```bash
# Check Redis connectivity
redis-cli -p 6380 PING

# Check Redis connection pool
redis-cli -p 6380 INFO clients

# Increase timeout
EVENT_TRANSPORT_PUBLISH_TIMEOUT_MS=250

# Check Redis server load
redis-cli -p 6380 INFO stats
```

### Messages Not Delivered

**Symptoms:**
- Clients not receiving events
- No errors in logs

**Diagnosis:**
```bash
# Check transport selection
grep "PublisherFactory" /var/log/support-center/backend.log | tail 20

# Check Redis Streams have entries
redis-cli -p 6380 XRANGE events:chat - +

# Check consumer group pending entries
redis-cli -p 6380 XPENDING events:chat signalr-consumers

# Check SignalR consumer logs
docker logs signalr-service --tail 100 | grep "ProcessStreamEntry"
```

**Solutions:**
1. Verify `EVENT_TRANSPORT_USE_REDIS_STREAMS=true`
2. Verify SignalR consumer is running
3. Check consumer group exists: `XINFO GROUPS events:chat`
4. Verify Redis URL in SignalR service configuration

### High Memory Usage

**Symptoms:**
- Redis memory increasing
- `used_memory_human` in `INFO memory` high

**Causes:**
1. Stream `MAXLEN` too high
2. Consumer not reading fast enough
3. Streams not being trimmed

**Solutions:**
```bash
# Check current stream lengths
redis-cli -p 6380 XLEN events:chat
redis-cli -p 6380 XLEN events:ticket
redis-cli -p 6380 XLEN events:notification
redis-cli -p 6380 XLEN events:remote

# Manually trim streams (if needed)
redis-cli -p 6380 XTRIM events:chat MAXLEN ~ 5000

# Reduce stream max length
EVENT_TRANSPORT_STREAM_MAX_LEN=5000

# Check Redis memory
redis-cli -p 6380 INFO memory | grep used_memory_human
```

---

## Related Files

### Backend (FastAPI)

- **Configuration:** `/src/backend/core/config.py` - `EventTransportSettings`
- **Publisher:** `/src/backend/services/event_publisher.py` - `PublisherFactory`, `RedisStreamsPublisher`, `HttpPublisher`
- **Metrics:** `/src/backend/core/metrics.py` - Event transport metrics

### SignalR Service (C#)

- **Consumer:** `/src/signalr-service/Services/RedisStreamConsumer.cs` - `RedisStreamConsumer` background service
- **Configuration:** `appsettings.json` - Redis connection string

### Documentation

- **CLAUDE.md:** Real-Time Event Transport (Feature 001) section
- **Architecture:** See `/docs/` for related architecture docs

---

## Additional Resources

- **Redis Streams:** https://redis.io/docs/data-types/streams/
- **redis-py async:** https://redis-py.readthedocs.io/en/stable/examples/asyncio_examples.html
- **StackExchange.Redis:** https://stackexchange.github.io/StackExchange.Redis/
- **Prometheus Metrics:** https://prometheus.io/docs/practices/naming/
