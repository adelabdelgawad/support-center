# Events Monitoring - Quick Start Guide

## What Was Implemented

Redis Streams consumer group lag monitoring endpoints to detect backpressure in the event transport system.

## Endpoints

### 1. Consumer Lag Monitoring
```
GET /api/v1/events/consumer-lag
```

Returns lag information for all event streams:
```json
{
  "streams": {
    "events:chat": {"lag": 123, "consumers": ["instance-1"]},
    "events:ticket": {"lag": 45, "consumers": ["instance-1"]},
    "events:remote": {"lag": 0, "consumers": ["instance-1"]}
  },
  "total_lag": 168,
  "stream_count": 3
}
```

### 2. List Streams
```
GET /api/v1/events/streams
```

Lists all streams with metadata:
```json
{
  "streams": [
    {"name": "events:chat", "length": 1234, "groups": 1},
    {"name": "events:ticket", "length": 567, "groups": 1}
  ]
}
```

### 3. Health Check
```
GET /api/v1/events/health
```

Returns overall health status:
```json
{
  "status": "healthy",
  "redis_connected": true,
  "transport_mode": "redis_streams",
  "max_lag": 123,
  "total_lag": 168
}
```

## Lag Interpretation

| Lag | Status | Action |
|-----|--------|--------|
| 0-100 | ✅ Healthy | Normal |
| 100-1000 | ⚠️ Degraded | Monitor |
| >1000 | 🔴 Unhealthy | Investigate |

## Files Created

- `/backend/api/v1/endpoints/events.py` - API endpoints
- `/backend/docs/EVENTS_CONSUMER_LAG_MONITORING.md` - Full documentation
- `/backend/docs/IMPLEMENTATION_SUMMARY.md` - Implementation details

## Files Modified

- `/backend/api/v1/__init__.py` - Registered events router

## Prometheus Metrics

Updates `event_consumer_lag` gauge with labels:
- `stream` (events:chat, events:ticket, events:remote)
- `consumer_group` (signalr-consumers)

## Usage

```bash
# Check consumer lag
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/v1/events/consumer-lag

# Health check
curl -H "Authorization: Bearer <token>" \
  http://localhost:8000/api/v1/events/health
```

## Configuration

Uses existing settings from `core/config.py`:
- `EVENT_TRANSPORT_CONSUMER_GROUP` (default: "signalr-consumers")
- `REDIS_URL` (default: "redis://localhost:6380/0")

Monitors these streams:
- `events:chat` - Chat messages
- `events:ticket` - Ticket updates
- `events:remote` - Remote access events

## Testing

All endpoints require authentication. Use valid JWT token from `/api/v1/auth/login`.

## Documentation

See `/backend/docs/EVENTS_CONSUMER_LAG_MONITORING.md` for:
- Architecture details
- Troubleshooting guide
- Redis commands
- Alerting rules
- Performance considerations
