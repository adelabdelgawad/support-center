# Tasks: Performance Optimization

**Input**: Design documents from `/specs/002-performance-optimization/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md

**Tests**: NO automated tests required per user instruction. Manual validation via quickstart.md.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Frontend**: `src/it-app/`
- **Backend**: `src/backend/`
- **Infrastructure**: `docker/backend/`

---

## Phase 1: Setup

**Purpose**: No setup needed - working within existing project structure

- [x] T001 Project structure already exists
- [x] T002 Dependencies already configured

**Checkpoint**: Setup complete - proceed to implementation

---

## Phase 2: Foundational

**Purpose**: No foundational infrastructure needed - all changes are additive to existing utilities

- [x] T003 Existing fetch utilities ready for enhancement
- [x] T004 Existing database configuration ready for enhancement

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Faster Page Navigation (Priority: P1)

**Goal**: IT agents experience faster page loads with no redundant API calls and proper timeout handling

**Independent Test**: Navigate between ticket list and detail pages - observe zero redundant metadata API calls in DevTools Network tab

### Implementation for User Story 1

- [x] T005 [P] [US1] Add 30s timeout with AbortController to `src/it-app/lib/api/server-fetch.ts`
  - Add `DEFAULT_TIMEOUT = 30000` constant
  - Create AbortController with setTimeout
  - Pass signal to fetch options
  - Handle AbortError with clear "Request timeout" message
  - Clean up timeout in finally block

- [x] T006 [P] [US1] Add 30s timeout with AbortController to `src/it-app/lib/api/client-fetch.ts`
  - Same implementation pattern as T005
  - Ensure timeout works for both GET and POST/PUT/DELETE operations

- [x] T007 [US1] Change SWR config in `src/it-app/lib/hooks/use-global-metadata.ts`
  - Set `revalidateOnMount: false` (currently true)
  - Keep `revalidateIfStale: true` to ensure data freshness when stale
  - Verify `dedupingInterval` is set appropriately (5 minutes recommended)

**Checkpoint**: Page navigation should show no redundant metadata calls and requests timeout after 30s

---

## Phase 4: User Story 2 - Resilient Request Handling (Priority: P2)

**Goal**: Transient failures (429, 503) automatically retry with exponential backoff

**Independent Test**: Simulate 503 response - system should retry and succeed without user intervention

### Implementation for User Story 2

- [x] T008 [P] [US2] Add retry logic to `src/it-app/lib/api/server-fetch.ts`
  - Add `MAX_RETRIES = 2` and `RETRY_DELAY = 1000` constants
  - Check for HTTP 429 (Rate Limit) and 503 (Service Unavailable) responses
  - Implement exponential backoff: delay * attempt (1s, 2s)
  - Create recursive retry function with attempt counter
  - Each retry gets its own timeout (30s)

- [x] T009 [P] [US2] Add retry logic to `src/it-app/lib/api/client-fetch.ts`
  - Same implementation pattern as T008
  - Ensure retry counter is shared across all attempts
  - User only sees error if all retry attempts fail

- [x] T010 [US2] Add user-friendly error messages for timeout scenarios
  - Return HTTP 408 equivalent for timeout errors
  - Display clear "Request timed out - please try again" message
  - Distinguish timeout errors from other network errors

**Checkpoint**: Requests should automatically retry on 429/503 and show clear timeout messages

---

## Phase 5: User Story 3 - Stable Database Connections (Priority: P2)

**Goal**: Database connections are validated before use and pool handles traffic spikes

**Independent Test**: After database restart, requests should succeed without manual intervention

### Implementation for User Story 3

- [x] T011 [P] [US3] Enable pre-ping in `src/backend/core/database.py`
  - Change `pool_pre_ping=False` to `pool_pre_ping=True` in create_async_engine
  - This validates connections before use, catching stale connections

- [x] T012 [P] [US3] Increase pool overflow in `src/backend/core/config.py`
  - Change `max_overflow` from 5 to 20 in DatabaseSettings
  - This allows up to 30 total connections (10 base + 20 overflow)

- [x] T013 [US3] Verify conditional middleware loading in `src/backend/app/factory.py`
  - Ensure debug middleware is wrapped in `if settings.api.debug:` conditional
  - Import debug middleware only when needed (lazy import inside conditional)

**Checkpoint**: System should handle 50 concurrent requests and reconnect automatically after DB restart

---

## Phase 6: User Story 4 - Faster Container Startup (Priority: P3)

**Goal**: Backend container starts and serves requests within 5 seconds on restart

**Independent Test**: Restart backend container - health check should respond within 5 seconds

### Implementation for User Story 4

- [x] T014 [US4] Create startup script at `docker/backend/start.sh`
  - Add shebang `#!/bin/bash`
  - Check `RUN_MIGRATIONS` environment variable
  - If "true": run `python init_db.py && alembic stamp head`
  - If not set or "false": skip migrations
  - Execute uvicorn with `exec` to replace shell process
  - Make script executable with chmod +x

- [x] T015 [US4] Update `docker/backend/Dockerfile`
  - Copy start.sh to container
  - Set RUN_MIGRATIONS default to "false"
  - Change CMD to use start.sh instead of direct uvicorn call

- [x] T016 [US4] Update `docker-compose.yml` for backend service
  - Add `RUN_MIGRATIONS` environment variable (default: false)
  - Document: set to "true" for fresh deployments with migrations

**Checkpoint**: Container restart (non-migration) should be ready in under 5 seconds

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validation and documentation

- [x] T017 Run quickstart.md validation checklist
  - Phase A: Verify frontend optimizations (timeout, retry, SWR)
  - Phase B: Verify backend reliability (pre-ping, pool, middleware)
  - Phase C: Verify infrastructure (startup time)

- [x] T018 Update CLAUDE.md with any new patterns discovered

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Complete - no action needed
- **Foundational (Phase 2)**: Complete - no action needed
- **User Stories (Phase 3-6)**: All can proceed in parallel
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: No dependencies - can start immediately
- **User Story 2 (P2)**: No dependencies - can start immediately (shares files with US1 but different functions)
- **User Story 3 (P2)**: No dependencies - different files (backend)
- **User Story 4 (P3)**: No dependencies - different files (infrastructure)

### Within Each User Story

- Tasks marked [P] within a story can run in parallel
- T005 and T006 can be parallel (different files)
- T008 and T009 can be parallel (different files)
- T011 and T012 can be parallel (different files)
- T014 → T015 → T016 must be sequential (dependencies)

### Parallel Opportunities

```
Frontend Tasks (can be parallel):
├── T005 [US1] server-fetch.ts timeout
├── T006 [US1] client-fetch.ts timeout
├── T007 [US1] use-global-metadata.ts SWR config
├── T008 [US2] server-fetch.ts retry
├── T009 [US2] client-fetch.ts retry
└── T010 [US2] error messages

Backend Tasks (can be parallel with frontend):
├── T011 [US3] database.py pre-ping
├── T012 [US3] config.py pool overflow
└── T013 [US3] factory.py middleware

Infrastructure Tasks (sequential):
├── T014 [US4] Create start.sh
├── T015 [US4] Update Dockerfile
└── T016 [US4] Update docker-compose.yml
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T005, T006, T007 (timeout + SWR)
2. **VALIDATE**: DevTools shows no redundant calls, timeout works
3. Deploy if ready

### Incremental Delivery

1. Add User Story 1 → Validate → Deploy (MVP!)
2. Add User Story 2 → Validate retry behavior → Deploy
3. Add User Story 3 → Validate DB resilience → Deploy
4. Add User Story 4 → Validate startup time → Deploy

### Rollback Strategy

Each phase can be rolled back independently:

**Frontend (US1, US2)**:
```bash
git checkout HEAD~1 -- src/it-app/lib/api/server-fetch.ts src/it-app/lib/api/client-fetch.ts src/it-app/lib/hooks/use-global-metadata.ts
```

**Backend (US3)**:
```bash
git checkout HEAD~1 -- src/backend/core/database.py src/backend/core/config.py src/backend/app/factory.py
```

**Infrastructure (US4)**:
```bash
# Set RUN_MIGRATIONS=true in docker-compose.yml to restore old behavior
```

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently testable via quickstart.md validation
- No automated tests required - manual validation per quickstart.md
- Commit after each task or logical group
- All changes are additive - no breaking changes to existing functionality
