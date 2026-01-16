# Data Model: Real-Time Messaging Latency Optimization

**Feature**: 001-realtime-latency-optimization
**Date**: 2026-01-16

## Overview

This feature introduces a new event transport layer between FastAPI and SignalR. The data model focuses on event structures for Redis Streams transport, not persistent database entities (which remain unchanged).

---

## Entities

### 1. StreamEvent

The base event structure for all real-time events published to Redis Streams.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `event_id` | string (UUID) | Yes | Unique identifier for idempotency |
| `event_type` | string (enum) | Yes | Type discriminator for event handling |
| `timestamp` | string (ISO8601) | Yes | Event creation time |
| `room_id` | string | Yes | Target room/group for broadcast |
| `payload` | object | Yes | Event-specific data |
| `metadata` | object | No | Optional tracing/debugging info |

**Validation Rules**:
- `event_id` must be unique per event (UUID v4)
- `timestamp` must be valid ISO8601 format
- `room_id` must be non-empty string (typically request UUID)
- `payload` structure depends on `event_type`

### 2. EventType (Enum)

| Value | Description | Coalesced | Priority |
|-------|-------------|-----------|----------|
| `chat_message` | New chat message | No | High |
| `typing_start` | User started typing | Yes (100ms) | Low |
| `typing_stop` | User stopped typing | Yes (100ms) | Low |
| `read_receipt` | Messages marked as read | Yes (100ms) | Low |
| `status_change` | Ticket status updated | No | High |
| `assignment_change` | Ticket assigned/reassigned | No | High |
| `notification` | Generic notification | No | Medium |
| `remote_session_start` | Remote access initiated | No | High |
| `remote_session_end` | Remote access ended | No | High |

### 3. ChatMessagePayload

Payload structure for `chat_message` events.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string (UUID) | Yes | Message ID from database |
| `request_id` | string (UUID) | Yes | Parent request ID |
| `sender_id` | string (UUID) | No | Null for system messages |
| `sender` | SenderInfo | No | Sender details |
| `content` | string | Yes | Message content |
| `sequence_number` | integer | Yes | Ordering within request |
| `is_screenshot` | boolean | Yes | Screenshot attachment flag |
| `created_at` | string (ISO8601) | Yes | Message creation time |
| `client_temp_id` | string | No | Client-side optimistic ID |

### 4. TypingPayload

Payload structure for `typing_start` and `typing_stop` events.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `user_id` | string (UUID) | Yes | User who is typing |
| `username` | string | Yes | Display name |
| `is_typing` | boolean | Yes | Current typing state |

### 5. StatusChangePayload

Payload structure for `status_change` events.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `request_id` | string (UUID) | Yes | Affected request |
| `old_status` | string | Yes | Previous status name |
| `new_status` | string | Yes | New status name |
| `changed_by` | string | Yes | User who made the change |
| `changed_at` | string (ISO8601) | Yes | Time of change |

### 6. EventMetadata

Optional metadata for tracing and debugging.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `trace_id` | string | No | Distributed tracing ID |
| `source_instance` | string | No | FastAPI instance identifier |
| `coalesced_count` | integer | No | Events merged (for coalesced) |

---

## Stream Topology

### Redis Streams

| Stream Name | Purpose | Consumer Group |
|-------------|---------|----------------|
| `events:chat` | Chat messages, typing, read receipts | `signalr-consumers` |
| `events:ticket` | Status changes, assignments | `signalr-consumers` |
| `events:notification` | Generic notifications | `signalr-consumers` |
| `events:remote` | Remote access session events | `signalr-consumers` |

### Stream Configuration

```
Stream: events:chat
├── MAXLEN: ~10000 (approximate)
├── Consumer Group: signalr-consumers
│   ├── Consumer: signalr-instance-1
│   └── Consumer: signalr-instance-2 (optional, for HA)
└── Retention: Until acknowledged
```

---

## State Transitions

### Event Lifecycle

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Created   │────▶│  Published  │────▶│   Consumed  │
│  (FastAPI)  │     │  (Stream)   │     │  (SignalR)  │
└─────────────┘     └─────────────┘     └─────────────┘
                           │                    │
                           ▼                    ▼
                    ┌─────────────┐     ┌─────────────┐
                    │   Expired   │     │ Acknowledged│
                    │  (MAXLEN)   │     │   (XACK)    │
                    └─────────────┘     └─────────────┘
```

### Coalescing State Machine (Typing Events)

```
┌─────────────┐
│    Idle     │◀──────────────────────────────────────┐
└──────┬──────┘                                       │
       │ typing event                                 │
       ▼                                              │
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Pending    │────▶│  Flushing   │────▶│  Published  │
│ (100ms wait)│     │ (send last) │     │  (to stream)│
└─────────────┘     └─────────────┘     └─────────────┘
       ▲
       │ new event (update latest)
       └──────────────────────────────────────────────
```

---

## Relationships

```
StreamEvent
├── 1:1 EventType (discriminator)
├── 1:1 Payload (typed by EventType)
└── 0:1 EventMetadata (optional)

Redis Stream
├── 1:N StreamEvent (ordered by ID)
└── 1:1 ConsumerGroup
    └── 1:N Consumer (signalr instances)
```

---

## Indexes & Performance

### Stream Keys

| Key Pattern | Purpose | Example |
|-------------|---------|---------|
| `events:{type}` | Event stream by type | `events:chat` |
| `coalesce:{room}:{type}` | Coalescing state | `coalesce:abc123:typing` |

### Memory Considerations

| Stream | Max Length | Est. Memory | Retention |
|--------|------------|-------------|-----------|
| `events:chat` | 10,000 | ~5MB | ~5 min at peak |
| `events:ticket` | 5,000 | ~2MB | ~30 min |
| `events:notification` | 5,000 | ~2MB | ~30 min |
| `events:remote` | 1,000 | ~500KB | ~1 hour |

---

## Validation Rules Summary

1. **Event ID Uniqueness**: Each event must have a unique UUID
2. **Room ID Required**: All events must target a specific room
3. **Payload Type Match**: Payload structure must match event_type
4. **Timestamp Freshness**: Events older than 5 minutes may be dropped
5. **Idempotency**: Duplicate event_id within 5 minutes is ignored
