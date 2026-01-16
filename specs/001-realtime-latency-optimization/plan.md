# Implementation Plan: Real-Time Messaging Latency Optimization

**Branch**: `001-realtime-latency-optimization` | **Date**: 2026-01-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-realtime-latency-optimization/spec.md`

## Summary

Replace the synchronous HTTP bridge between FastAPI and SignalR with asynchronous Redis Streams event transport to achieve P50 < 200ms, P95 < 500ms message delivery latency. Implement 100ms event coalescing for typing indicators to reduce traffic by 30%+. All changes are server-side with configuration-only rollback capability.

## Technical Context

**Language/Version**: Python 3.12+ (Backend), C# (.NET) for SignalR service
**Primary Dependencies**: FastAPI, httpx (current), redis-py with Streams support, SignalR ASP.NET Core
**Storage**: Redis (existing infrastructure at redis://localhost:6380)
**Testing**: pytest with async support, load testing with locust
**Target Platform**: Linux server (Docker containers)
**Project Type**: Web application (backend + SignalR microservice)
**Performance Goals**: P50 < 200ms, P95 < 500ms end-to-end message delivery; 30% typing indicator traffic reduction
**Constraints**: No client-side changes, configuration-only rollback, zero reliability regression
**Scale/Scope**: 100-200 concurrent users typical, 500+ peak

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. HTTPSchemaModel Inheritance | **PASS** | No new Pydantic schemas required; optimization is infrastructure-level |
| II. API Proxy Pattern | **PASS** | No client changes; server-side transport optimization only |
| III. Bun Package Manager | **N/A** | No it-app changes in scope |
| IV. Service Layer Architecture | **PASS** | Changes to signalr_client.py service; maintains service pattern |
| V. Clean Code Removal | **PASS** | HTTP bridge retained during transition; feature flag controls routing |

**Gate Result**: PASS - All applicable principles satisfied.

## Project Structure

### Documentation (this feature)

```text
specs/001-realtime-latency-optimization/
├── plan.md              # This file
├── research.md          # Phase 0 output - Redis Streams patterns
├── data-model.md        # Phase 1 output - Event schema definitions
├── quickstart.md        # Phase 1 output - Development setup
├── contracts/           # Phase 1 output - Event contracts
│   └── events.json      # Event payload schemas
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
src/backend/
├── services/
│   ├── signalr_client.py      # MODIFY: Add Redis Streams publisher
│   ├── event_coalescer.py     # NEW: 100ms coalescing for typing events
│   └── event_publisher.py     # NEW: Abstract publisher with HTTP/Redis backends
├── core/
│   ├── config.py              # MODIFY: Add Redis Streams settings
│   └── metrics.py             # MODIFY: Add latency/queue depth metrics
└── tests/
    ├── unit/
    │   └── test_event_publisher.py
    └── integration/
        └── test_redis_streams.py

# SignalR Service (external, C#)
signalr-service/
├── Services/
│   └── RedisStreamConsumer.cs  # NEW: Redis Streams subscriber
└── Program.cs                  # MODIFY: Register stream consumer
```

**Structure Decision**: Modifications to existing backend service layer with new publisher abstraction. SignalR service receives parallel implementation for Redis Streams consumption.

## Complexity Tracking

> No constitution violations requiring justification.

| Decision | Rationale | Alternative Considered |
|----------|-----------|------------------------|
| Redis Streams over NATS/RabbitMQ | Already in infrastructure, proven at scale, native consumer groups | NATS adds operational overhead; RabbitMQ not deployed |
| Dual-write during transition | Zero-downtime migration, instant rollback | Big-bang switch risks production incidents |
| Coalescing in FastAPI (not SignalR) | Reduces network traffic at source; SignalR stays stateless | SignalR coalescing adds complexity to broadcast service |

---

## Phase 0: Research

See [research.md](./research.md) for detailed findings.

### Research Tasks

1. **Redis Streams Best Practices**: Consumer groups, backpressure handling, memory limits
2. **SignalR Redis Backplane vs Custom**: Evaluate built-in vs custom stream consumer
3. **Event Coalescing Patterns**: Debounce vs throttle for typing indicators
4. **Metrics Integration**: Prometheus metrics for latency histograms

---

## Phase 1: Design

See [data-model.md](./data-model.md) for entity definitions.
See [contracts/events.json](./contracts/events.json) for event schemas.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CURRENT FLOW (HTTP)                              │
│  FastAPI → HTTP POST → SignalR Internal API → WebSocket → Clients       │
│  Latency: ~50-100ms per hop                                              │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                      OPTIMIZED FLOW (Redis Streams)                      │
│  FastAPI → Redis XADD (async) → SignalR Consumer → WebSocket → Clients  │
│  Latency: ~5-10ms publish, ~10-20ms consume                              │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Design

#### 1. Event Publisher (FastAPI)

```python
# Abstract publisher with pluggable backends
class EventPublisher(Protocol):
    async def publish(self, stream: str, event: Event) -> bool: ...

class RedisStreamsPublisher(EventPublisher):
    # XADD with MAXLEN for bounded memory
    # Async, non-blocking, fire-and-forget semantics

class HttpPublisher(EventPublisher):
    # Current SignalR HTTP client (fallback)
```

#### 2. Event Coalescer

```python
class TypingCoalescer:
    # 100ms window for typing indicators
    # Drops intermediate states, keeps latest
    # Per-room coalescing to avoid cross-talk
```

#### 3. Redis Stream Consumer (SignalR)

```csharp
// Consumer group with automatic failover
// XREADGROUP with blocking read
// Broadcasts to SignalR hub on receipt
```

### Feature Flag Strategy

```python
# In config.py
class EventTransportSettings:
    use_redis_streams: bool = False  # Feature flag
    redis_streams_percentage: int = 0  # Gradual rollout
    fallback_to_http: bool = True  # Keep HTTP as backup
```

### Rollback Strategy

1. Set `use_redis_streams = False` in environment
2. All traffic immediately routes to HTTP bridge
3. No code deployment required
4. Redis Streams consumer idles (no impact)

---

## Phase 2: Implementation Phases

### Phase 2.1: Instrumentation (Baseline)

- Add latency metrics to current HTTP path
- Establish P50/P95 baseline measurements
- Add queue depth monitoring

### Phase 2.2: Redis Streams Publisher

- Implement `RedisStreamsPublisher`
- Add feature flag control
- Dual-write: both HTTP and Redis Streams
- Verify events arrive in stream

### Phase 2.3: SignalR Consumer

- Implement `RedisStreamConsumer` in SignalR service
- Consumer group with single consumer initially
- Broadcast to appropriate hub on event receipt
- Verify end-to-end delivery

### Phase 2.4: Event Coalescing

- Implement `TypingCoalescer` with 100ms window
- Apply to typing indicator events only
- Measure traffic reduction

### Phase 2.5: Cutover & Validation

- Route 100% traffic to Redis Streams
- Keep HTTP as passive fallback (not actively used)
- Validate P50/P95 targets met
- Monitor for 48 hours before cleanup

---

## Verification Plan

### Pre-Implementation

- [ ] Baseline metrics collected (current P50/P95)
- [ ] Redis Streams connectivity verified
- [ ] Load test environment prepared

### Post-Implementation

- [ ] SC-001: 40% latency reduction verified
- [ ] SC-002: P50 < 200ms, P95 < 500ms confirmed
- [ ] SC-003: Consistent latency under scaling load
- [ ] SC-004: 30% typing traffic reduction measured
- [ ] SC-005: Zero message loss in reliability tests
- [ ] SC-006: Rollback tested (config change only)
- [ ] SC-007: Metrics visible in monitoring dashboard

### Test Scenarios

1. **Happy Path**: Send message, verify delivery within latency targets
2. **Coalescing**: Rapid typing, verify single event per 100ms window
3. **Reconnection**: Disconnect/reconnect, verify message fetch from DB
4. **Transport Failure**: Redis unavailable, verify HTTP fallback
5. **Load Test**: 200 concurrent users, verify latency consistency

---

## Next Steps

1. Run `/speckit.tasks` to generate task breakdown
2. Begin Phase 2.1 (Instrumentation) to establish baseline
3. Proceed through phases sequentially with validation gates
