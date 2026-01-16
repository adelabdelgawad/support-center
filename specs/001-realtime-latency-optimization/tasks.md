# Tasks: Real-Time Messaging Latency Optimization

**Input**: Design documents from `/specs/001-realtime-latency-optimization/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: No explicit test requirements in spec. Integration validation included in Cutover phase.

**Organization**: Tasks grouped by user story for independent implementation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Exact file paths included in descriptions

## Path Conventions

- **Backend**: `src/backend/` (FastAPI Python)
- **SignalR Service**: `signalr-service/` (ASP.NET Core C#)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Configuration and foundational event publisher abstraction

- [X] T001 Add EventTransportSettings to src/backend/core/config.py with feature flags (use_redis_streams, redis_streams_percentage, fallback_to_http)
- [X] T002 [P] Create event type enum in src/backend/services/event_types.py matching data-model.md EventType enum
- [X] T003 [P] Create StreamEvent dataclass in src/backend/services/event_models.py with event_id, event_type, timestamp, room_id, payload, metadata fields
- [X] T004 Create EventPublisher Protocol in src/backend/services/event_publisher.py defining async publish(stream, event) interface

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 Implement HttpPublisher class in src/backend/services/event_publisher.py wrapping existing SignalRClient._post() method
- [X] T006 Implement RedisStreamsPublisher class in src/backend/services/event_publisher.py using redis-py XADD with MAXLEN
- [X] T007 Create PublisherFactory in src/backend/services/event_publisher.py that selects publisher based on feature flags
- [X] T008 [P] Add Prometheus latency histogram (event_publish_duration_seconds) in src/backend/core/metrics.py
- [X] T009 [P] Add Prometheus gauge (event_queue_depth) in src/backend/core/metrics.py
- [X] T010 [P] Add Prometheus counter (events_published_total) with transport and event_type labels in src/backend/core/metrics.py
- [X] T011 Modify SignalRClient in src/backend/services/signalr_client.py to use PublisherFactory instead of direct HTTP calls
- [X] T012 Add dual-write logic to SignalRClient enabling both HTTP and Redis Streams during transition

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Instant Chat Message Delivery (Priority: P1) 🎯 MVP

**Goal**: Achieve P50 < 200ms, P95 < 500ms for chat message delivery via Redis Streams transport

**Independent Test**: Send chat message via API, verify delivery within latency targets using metrics

### Implementation for User Story 1

- [X] T013 [US1] Create events:chat stream configuration in Redis (MAXLEN ~10000, consumer group signalr-consumers)
- [X] T014 [US1] Update broadcast_chat_message() in src/backend/services/signalr_client.py to publish to events:chat stream
- [X] T015 [P] [US1] Create RedisStreamConsumer background service in signalr-service/Services/RedisStreamConsumer.cs
- [X] T016 [US1] Implement XREADGROUP blocking read loop in RedisStreamConsumer.cs with consumer group
- [X] T017 [US1] Add event deserialization for chat_message events in RedisStreamConsumer.cs
- [X] T018 [US1] Broadcast received chat events to ChatHub in signalr-service upon consumption
- [X] T019 [US1] Implement XACK acknowledgment after successful broadcast in RedisStreamConsumer.cs
- [X] T020 [US1] Register RedisStreamConsumer as hosted service in signalr-service/Program.cs
- [X] T021 [US1] Add latency instrumentation to measure publish-to-broadcast time for chat messages
- [ ] T022 [US1] Verify end-to-end chat message delivery with Redis Streams enabled

**Checkpoint**: Chat messages now flow through Redis Streams with measurable latency improvement

---

## Phase 4: User Story 2 - Reliable Typing Indicators (Priority: P2)

**Goal**: Deliver typing indicators with 100ms coalescing to reduce traffic by 30%+ while maintaining responsiveness

**Independent Test**: Rapid typing generates coalesced events; verify ~30% traffic reduction via metrics

### Implementation for User Story 2

- [X] T023 [P] [US2] Create TypingCoalescer class in src/backend/services/event_coalescer.py with 100ms window
- [X] T024 [US2] Implement per-room pending event tracking in TypingCoalescer using asyncio timers
- [X] T025 [US2] Implement trailing-edge flush logic in TypingCoalescer (emit last state after window)
- [X] T026 [P] [US2] Add events_coalesced_total Prometheus counter in src/backend/core/metrics.py
- [X] T027 [US2] Integrate TypingCoalescer into broadcast_typing_indicator() in src/backend/services/signalr_client.py
- [X] T028 [US2] Add typing_start and typing_stop event handling in RedisStreamConsumer.cs
- [X] T029 [US2] Broadcast typing events to appropriate room in ChatHub
- [ ] T030 [US2] Verify coalescing reduces typing event traffic by measuring events_coalesced_total

**Checkpoint**: Typing indicators now coalesced; traffic reduction measurable

---

## Phase 5: User Story 3 - Real-Time Ticket Status Updates (Priority: P2)

**Goal**: Deliver ticket status changes via Redis Streams with same latency targets as chat

**Independent Test**: Change ticket status; verify all subscribed users receive update via WebSocket

### Implementation for User Story 3

- [X] T031 [US3] Create events:ticket stream configuration in Redis (MAXLEN ~5000)
- [X] T032 [US3] Update broadcast_ticket_update() in src/backend/services/signalr_client.py to publish to events:ticket stream
- [X] T033 [US3] Update broadcast_task_status_changed() in src/backend/services/signalr_client.py for stream publishing
- [X] T034 [US3] Add status_change and assignment_change event handling in RedisStreamConsumer.cs
- [X] T035 [US3] Broadcast ticket events to appropriate TicketHub/ChatHub room
- [ ] T036 [US3] Verify status update delivery to all subscribed clients

**Checkpoint**: Ticket status updates flow through Redis Streams

---

## Phase 6: User Story 4 - Remote Access Session Notifications (Priority: P3)

**Goal**: Deliver remote access notifications via Redis Streams with high reliability

**Independent Test**: Agent initiates remote session; requester receives notification within latency targets

### Implementation for User Story 4

- [X] T037 [US4] Create events:remote stream configuration in Redis (MAXLEN ~1000)
- [X] T038 [US4] Update notify_remote_session_auto_start() in src/backend/services/signalr_client.py for stream publishing
- [X] T039 [US4] Update notify_remote_session_ended() in src/backend/services/signalr_client.py for stream publishing
- [X] T040 [US4] Update notify_control_mode_changed() in src/backend/services/signalr_client.py for stream publishing
- [X] T041 [US4] Add remote_session_start and remote_session_end event handling in RedisStreamConsumer.cs
- [X] T042 [US4] Broadcast remote access events to user-specific notifications
- [ ] T043 [US4] Verify remote session notifications reach requester within latency targets

**Checkpoint**: Remote access notifications flow through Redis Streams

---

## Phase 7: Cutover & Validation

**Purpose**: Enable Redis Streams for all traffic, validate success criteria, document rollback

- [ ] T044 Set EVENT_TRANSPORT_REDIS_PERCENTAGE=100 in staging environment
- [ ] T045 Run load test with 100 concurrent users; verify SC-002 (P50 < 200ms, P95 < 500ms)
- [ ] T046 Verify SC-001: 40% latency reduction compared to baseline
- [ ] T047 Verify SC-003: Consistent latency (< 20% variance) from 50 to 200 users
- [ ] T048 Verify SC-004: 30% typing indicator traffic reduction via events_coalesced_total metric
- [ ] T049 Verify SC-005: Zero message loss in reliability tests
- [ ] T050 Test rollback: Set EVENT_TRANSPORT_USE_REDIS_STREAMS=false, verify HTTP fallback works
- [ ] T051 Verify SC-007: All metrics visible in monitoring dashboard (Prometheus/Grafana)
- [X] T052 Document rollback procedure in quickstart.md

**Checkpoint**: All success criteria validated; ready for production deployment

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup, documentation, and production readiness

- [X] T053 [P] Add error handling for Redis connection failures with HTTP fallback
- [X] T054 [P] Add consumer group lag monitoring (XINFO GROUPS) to alert on backpressure
- [X] T055 [P] Update CLAUDE.md with Redis Streams architecture notes
- [X] T056 [P] Add environment variable documentation for new config options
- [X] T057 Code review: Verify constitution compliance (HTTPSchemaModel, Service Layer pattern)
- [ ] T058 Remove dual-write code after 48-hour production validation (optional, future task)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - US1 (Chat) should complete first as it proves the architecture
  - US2-US4 can proceed in parallel after US1 validation
- **Cutover (Phase 7)**: Depends on all user stories being complete
- **Polish (Phase 8)**: Depends on Cutover validation

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational - Requires coalescer (independent of US1)
- **User Story 3 (P2)**: Can start after Foundational - Shares consumer with US1 (can parallelize)
- **User Story 4 (P3)**: Can start after Foundational - Shares consumer with US1 (can parallelize)

### Within Each User Story

- Stream configuration before publishing changes
- Publishing changes before consumer implementation
- Consumer implementation before hub broadcasting
- End-to-end verification as final step

### Parallel Opportunities

- T002, T003 (Setup phase) can run in parallel
- T008, T009, T010 (Metrics) can run in parallel
- T015 (SignalR consumer) can start while T014 is being implemented
- T023, T026 (US2 coalescer and metrics) can run in parallel
- All Polish phase tasks can run in parallel

---

## Parallel Example: Foundational Phase

```bash
# Launch metrics tasks in parallel:
Task: "Add Prometheus latency histogram in src/backend/core/metrics.py"
Task: "Add Prometheus gauge in src/backend/core/metrics.py"
Task: "Add Prometheus counter in src/backend/core/metrics.py"
```

## Parallel Example: User Story 1

```bash
# While backend publishing is being updated:
Task: "Update broadcast_chat_message() in signalr_client.py"

# Start SignalR consumer in parallel:
Task: "Create RedisStreamConsumer in signalr-service/Services/"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (~2 tasks)
2. Complete Phase 2: Foundational (~8 tasks)
3. Complete Phase 3: User Story 1 (~10 tasks)
4. **STOP and VALIDATE**: Test chat message delivery latency
5. If P50 < 200ms, P95 < 500ms achieved → proceed to US2-US4

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 (Chat) → Validate latency → Deploy
3. Add User Story 2 (Typing) → Validate coalescing → Deploy
4. Add User Story 3 (Status) → Validate delivery → Deploy
5. Add User Story 4 (Remote) → Validate delivery → Deploy
6. Cutover validation → Production rollout

### Rollback at Any Point

1. Set `EVENT_TRANSPORT_USE_REDIS_STREAMS=false`
2. All traffic routes to HTTP bridge
3. No code deployment required

---

## Summary

| Phase | Task Count | Purpose |
|-------|------------|---------|
| Phase 1: Setup | 4 | Configuration and abstractions |
| Phase 2: Foundational | 8 | Publisher infrastructure and metrics |
| Phase 3: US1 (Chat) | 10 | MVP - chat message delivery |
| Phase 4: US2 (Typing) | 8 | Coalescing for typing indicators |
| Phase 5: US3 (Status) | 6 | Ticket status updates |
| Phase 6: US4 (Remote) | 7 | Remote access notifications |
| Phase 7: Cutover | 9 | Validation and rollback testing |
| Phase 8: Polish | 6 | Cleanup and documentation |
| **Total** | **58** | |

### Tasks Per User Story

- US1 (Chat Messages): 10 tasks
- US2 (Typing Indicators): 8 tasks
- US3 (Status Updates): 6 tasks
- US4 (Remote Access): 7 tasks

### Parallel Opportunities

- 6 tasks in Foundational can run in groups of 3
- SignalR consumer development can parallel backend changes
- All 4 user stories can proceed in parallel after Foundational
- All 6 Polish tasks can run in parallel

### Suggested MVP Scope

Complete **Phase 1 + Phase 2 + Phase 3 (User Story 1)** for MVP:
- 22 tasks total
- Proves Redis Streams architecture
- Delivers measurable latency improvement for chat
- Full rollback capability
