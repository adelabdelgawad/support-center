# Research: Real-Time Messaging Latency Optimization

**Feature**: 001-realtime-latency-optimization
**Date**: 2026-01-16

## Research Questions

1. Redis Streams best practices for event transport
2. SignalR Redis Backplane vs custom stream consumer
3. Event coalescing patterns for typing indicators
4. Metrics integration for latency monitoring

---

## 1. Redis Streams for Event Transport

### Decision: Use Redis Streams with Consumer Groups

**Rationale**:
- Already in infrastructure (redis://localhost:6380) - no new dependencies
- Consumer groups provide automatic load balancing and failover
- XADD is O(1) for publish, XREADGROUP is efficient for consumption
- Built-in backpressure via MAXLEN and blocking reads
- Message persistence until acknowledged (at-least-once delivery)

**Alternatives Considered**:

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| Redis Pub/Sub | Simple, fast | No persistence, message loss on disconnect | Rejected |
| Redis Streams | Persistence, consumer groups, backpressure | Slightly more complex | **Selected** |
| NATS | Purpose-built messaging | New infrastructure, operational overhead | Rejected |
| RabbitMQ | Mature, feature-rich | Not deployed, heavyweight | Rejected |

### Implementation Pattern

```python
# Publisher (FastAPI)
async def publish_event(stream: str, event: dict) -> str:
    return await redis.xadd(
        stream,
        event,
        maxlen=10000,  # Bounded memory
        approximate=True  # Performance optimization
    )

# Consumer (SignalR) - pseudo-code
while True:
    events = await redis.xreadgroup(
        group="signalr-consumers",
        consumer="instance-1",
        streams={"events:chat": ">"},
        count=100,
        block=5000  # 5s blocking read
    )
    for event in events:
        await broadcast_to_hub(event)
        await redis.xack(stream, group, event.id)
```

### Stream Configuration

| Setting | Value | Rationale |
|---------|-------|-----------|
| MAXLEN | 10,000 | ~5 minutes of events at peak load |
| Consumer Group | `signalr-consumers` | Single group, multiple consumers |
| Block Time | 5000ms | Balance between latency and CPU |
| Count | 100 | Batch size for efficiency |

---

## 2. SignalR Redis Backplane vs Custom Consumer

### Decision: Custom Redis Streams Consumer

**Rationale**:
- SignalR Redis Backplane is for multi-instance SignalR scaling (Pub/Sub)
- We need FastAPI → SignalR transport, not SignalR → SignalR
- Custom consumer gives full control over event processing
- Can implement idempotency and metrics at consumer level

**Alternatives Considered**:

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| SignalR Redis Backplane | Built-in, well-tested | Wrong use case (hub-to-hub, not external) | Rejected |
| Custom Pub/Sub Consumer | Simple implementation | Message loss on disconnect | Rejected |
| Custom Streams Consumer | Full control, persistence | More code to write | **Selected** |

### Consumer Architecture (C#)

```csharp
public class RedisStreamConsumer : BackgroundService
{
    private readonly IHubContext<ChatHub> _chatHub;
    private readonly IConnectionMultiplexer _redis;

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        var db = _redis.GetDatabase();

        // Ensure consumer group exists
        try {
            await db.StreamCreateConsumerGroupAsync(
                "events:chat", "signalr-consumers", "0");
        } catch { /* Group already exists */ }

        while (!ct.IsCancellationRequested)
        {
            var entries = await db.StreamReadGroupAsync(
                "events:chat",
                "signalr-consumers",
                Environment.MachineName,
                ">",
                count: 100
            );

            foreach (var entry in entries)
            {
                await ProcessEvent(entry);
                await db.StreamAcknowledgeAsync(
                    "events:chat", "signalr-consumers", entry.Id);
            }
        }
    }
}
```

---

## 3. Event Coalescing Patterns

### Decision: Throttle with Trailing Edge (100ms window)

**Rationale**:
- Typing indicators should show "latest state" not "every keystroke"
- 100ms window captures rapid typing without noticeable delay
- Trailing edge ensures final state is always sent
- Per-room isolation prevents cross-talk

**Alternatives Considered**:

| Pattern | Behavior | Pros | Cons | Verdict |
|---------|----------|------|------|---------|
| Debounce | Wait for silence, then emit | Fewer events | Delays first indicator | Rejected |
| Throttle (leading) | Emit first, ignore rest | Responsive first event | May miss "stopped typing" | Rejected |
| Throttle (trailing) | Emit last state after window | Captures final state | Slight delay | **Selected** |
| Sample | Emit at fixed intervals | Predictable | May miss state changes | Rejected |

### Implementation Pattern

```python
class TypingCoalescer:
    """Coalesces typing events per room with 100ms window."""

    def __init__(self, window_ms: int = 100):
        self.window_ms = window_ms
        self._pending: dict[str, asyncio.Task] = {}
        self._latest: dict[str, dict] = {}

    async def submit(self, room_id: str, event: dict) -> None:
        """Submit event for coalescing. Latest wins."""
        self._latest[room_id] = event

        if room_id not in self._pending:
            self._pending[room_id] = asyncio.create_task(
                self._flush_after_window(room_id)
            )

    async def _flush_after_window(self, room_id: str) -> None:
        await asyncio.sleep(self.window_ms / 1000)
        event = self._latest.pop(room_id, None)
        self._pending.pop(room_id, None)
        if event:
            await self._publish(event)
```

### Coalescing Rules

| Event Type | Coalesced | Window | Rationale |
|------------|-----------|--------|-----------|
| `typing_start` | Yes | 100ms | High frequency, latest state matters |
| `typing_stop` | Yes | 100ms | Paired with start |
| `chat_message` | **No** | - | Every message must be delivered |
| `status_change` | **No** | - | Critical business events |
| `read_receipt` | Yes | 100ms | Batch multiple reads |

---

## 4. Metrics Integration

### Decision: Prometheus Histograms with Standard Buckets

**Rationale**:
- Prometheus already used for backend metrics
- Histograms give P50/P95/P99 directly
- Standard buckets cover expected latency range
- Labels enable per-event-type analysis

**Metrics to Add**:

| Metric | Type | Labels | Purpose |
|--------|------|--------|---------|
| `event_publish_duration_seconds` | Histogram | `transport`, `event_type` | Measure publish latency |
| `event_delivery_duration_seconds` | Histogram | `event_type` | End-to-end latency |
| `event_queue_depth` | Gauge | `stream` | Backpressure indicator |
| `events_coalesced_total` | Counter | `event_type` | Measure coalescing effectiveness |
| `events_published_total` | Counter | `transport`, `event_type` | Throughput tracking |

### Implementation Pattern

```python
from prometheus_client import Histogram, Counter, Gauge

event_publish_duration = Histogram(
    'event_publish_duration_seconds',
    'Time to publish event to transport',
    ['transport', 'event_type'],
    buckets=[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0]
)

event_queue_depth = Gauge(
    'event_queue_depth',
    'Number of events pending in stream',
    ['stream']
)

async def publish_with_metrics(transport: str, event_type: str, event: dict):
    with event_publish_duration.labels(transport, event_type).time():
        await publisher.publish(event)
```

### Alerting Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| P95 publish latency | > 100ms | > 200ms | Check Redis connectivity |
| Queue depth | > 1000 | > 5000 | Scale consumers |
| Coalescing ratio | < 20% | N/A | Review coalescing logic |

---

## Summary of Decisions

| Research Question | Decision | Confidence |
|-------------------|----------|------------|
| Event Transport | Redis Streams with Consumer Groups | High |
| SignalR Integration | Custom stream consumer (not backplane) | High |
| Coalescing Pattern | Throttle with trailing edge, 100ms | High |
| Metrics | Prometheus histograms | High |

All NEEDS CLARIFICATION items resolved. Ready to proceed to Phase 1: Design.
