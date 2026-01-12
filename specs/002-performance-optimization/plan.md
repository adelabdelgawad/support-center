# Implementation Plan: Performance Optimization

**Branch**: `002-performance-optimization` | **Date**: 2026-01-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-performance-optimization/spec.md`

## Summary

Implement proven performance optimization patterns from the network-manager codebase into support_center. This includes adding request timeouts and retry logic to frontend fetch utilities, enabling database connection pre-ping, increasing connection pool overflow capacity, optimizing middleware loading, and streamlining container startup. All changes are additive configuration updates with independent rollback capability.

## Technical Context

**Language/Version**: Python 3.13 (Backend), TypeScript 5.9 (Frontend)
**Primary Dependencies**: FastAPI 0.121, Next.js 16.1, SQLAlchemy 2.0, SWR 2.3
**Storage**: PostgreSQL with asyncpg, Redis for caching
**Testing**: pytest (backend), Playwright (frontend)
**Target Platform**: Linux server (Docker containers), Web browsers
**Project Type**: Web application (backend + frontend)
**Performance Goals**: Page navigation < 2s, API response p50 < 100ms, Container startup < 5s
**Constraints**: Zero functional regressions, independent rollback per change
**Scale/Scope**: Production system with active users, ~50 concurrent requests peak

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. HTTPSchemaModel Inheritance | N/A | No new schemas created |
| II. API Proxy Pattern | PASS | No changes to API routing pattern |
| III. Bun Package Manager | PASS | All frontend commands use bun |
| IV. Service Layer Architecture | N/A | No new business logic |
| V. Clean Code Removal | PASS | No deprecated code patterns introduced |

**Gate Status**: PASS - All applicable principles satisfied

## Project Structure

### Documentation (this feature)

```text
specs/002-performance-optimization/
├── plan.md              # This file
├── research.md          # Phase 0 output - completed
├── data-model.md        # Phase 1 output - N/A (no new data models)
├── quickstart.md        # Phase 1 output - validation guide
├── contracts/           # Phase 1 output - N/A (no new API contracts)
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
# Files to be modified:

src/it-app/
├── lib/
│   ├── api/
│   │   ├── server-fetch.ts      # Add timeout + retry (FR-001, FR-003)
│   │   └── client-fetch.ts      # Add timeout + retry (FR-002, FR-003)
│   └── hooks/
│       └── use-global-metadata.ts  # SWR config change (FR-004)

src/backend/
├── core/
│   ├── database.py              # Enable pre-ping (FR-006)
│   └── config.py                # Increase pool overflow (FR-007)
└── app/
    └── factory.py               # Conditional middleware (FR-008)

docker/
└── backend/
    ├── Dockerfile               # Conditional startup (FR-009)
    └── start.sh                 # New startup script (FR-009, FR-010)
```

**Structure Decision**: Web application with existing backend/frontend separation. Changes are isolated to specific utility files and configuration, no structural changes required.

## Complexity Tracking

No constitution violations. All changes are minimal configuration updates or additive enhancements to existing utilities.

## Implementation Phases

### Phase A: Frontend Optimizations (Low Risk)

**Findings**: F01, F02, F03, F04
**Requirements**: FR-001, FR-002, FR-003, FR-004, FR-005

| Task | File | Change |
|------|------|--------|
| A1 | `lib/api/server-fetch.ts` | Add 30s timeout with AbortController |
| A2 | `lib/api/server-fetch.ts` | Add retry logic (2x, exponential backoff) |
| A3 | `lib/api/client-fetch.ts` | Add 30s timeout with AbortController |
| A4 | `lib/api/client-fetch.ts` | Add retry logic (2x, exponential backoff) |
| A5 | `lib/hooks/use-global-metadata.ts` | Change `revalidateOnMount: false` |

**Validation**: DevTools Network tab - verify no redundant calls, timeout behavior

### Phase B: Backend Reliability (Low Risk)

**Findings**: F05, F06, F08
**Requirements**: FR-006, FR-007, FR-008

| Task | File | Change |
|------|------|--------|
| B1 | `core/database.py` | Set `pool_pre_ping=True` |
| B2 | `core/config.py` | Set `max_overflow=20` |
| B3 | `app/factory.py` | Wrap debug middleware in conditional |

**Validation**: Health check after DB restart, load test with 50 concurrent requests

### Phase C: Infrastructure (Medium Risk)

**Findings**: F09
**Requirements**: FR-009, FR-010

| Task | File | Change |
|------|------|--------|
| C1 | `docker/backend/start.sh` | Create conditional startup script |
| C2 | `docker/backend/Dockerfile` | Use startup script, add RUN_MIGRATIONS env |
| C3 | `docker-compose.yml` | Add RUN_MIGRATIONS environment variable |

**Validation**: Container restart time measurement, migration behavior verification

## Dependencies Between Phases

```
Phase A (Frontend) ──────┐
                         ├──► Can deploy independently
Phase B (Backend) ───────┤
                         │
Phase C (Infrastructure) ┘ ──► Requires maintenance window
```

All phases are independent and can be deployed in any order. Phase C is recommended for a maintenance window due to container restart behavior change.

## Rollback Procedures

### Per-Phase Rollback

**Phase A**:
```bash
cd src/it-app
git checkout HEAD~1 -- lib/api/server-fetch.ts lib/api/client-fetch.ts lib/hooks/use-global-metadata.ts
```

**Phase B**:
```bash
cd src/backend
git checkout HEAD~1 -- core/database.py core/config.py app/factory.py
```

**Phase C**:
```bash
# Set environment variable
docker-compose up -d -e RUN_MIGRATIONS=true
```

### Full Rollback

```bash
git revert HEAD  # Creates new commit reversing all changes
```

## Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| Page navigation time | Variable | < 2s p95 | DevTools timing |
| Redundant API calls | Multiple per page | 0 | Network tab observation |
| Request timeout | Infinite | 30s | Simulated slow response |
| Transient failure recovery | 0% | 90% | 429/503 simulation |
| DB connection after restart | Failure | Success | DB restart test |
| Concurrent request handling | 15 | 50+ | Load test |
| Container restart time | 30s+ | < 5s | Time measurement |
