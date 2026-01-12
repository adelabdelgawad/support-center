# Quickstart: Performance Optimization Validation

**Feature**: 002-performance-optimization
**Purpose**: Guide for validating performance optimizations after implementation

## Prerequisites

- Backend running: `cd src/backend && uvicorn main:app --reload`
- Frontend running: `cd src/it-app && bun run dev`
- Database and Redis available (Docker services)

## Validation Checklist

### Phase A: Frontend Optimizations

#### A1: Server-Side Timeout (FR-001)

**Test**: Simulate slow backend response

1. Temporarily add delay in a backend endpoint:
   ```python
   import asyncio
   await asyncio.sleep(35)  # 35 seconds, exceeds 30s timeout
   ```
2. Make request from frontend
3. Verify request times out after ~30 seconds
4. Verify error message shows "Request timeout"

**Expected**: 408 error with clear timeout message

#### A2/A3: Retry Logic (FR-003)

**Test**: Simulate transient failure

1. Temporarily return 503 from backend endpoint (first 2 calls)
2. Watch Network tab for retry attempts
3. Verify delays between retries (~1s, ~2s)
4. Verify third attempt succeeds

**Expected**: Automatic recovery after 2 retries

#### A4: Client-Side Timeout (FR-002)

**Test**: Same as A1, but for client-initiated requests

**Expected**: Same timeout behavior as server-side

#### A5: SWR Cache (FR-004)

**Test**: Verify no redundant metadata calls

1. Open DevTools Network tab
2. Navigate to ticket list page
3. Note API calls for `/api/priorities`, `/api/metadata/statuses`
4. Navigate to ticket detail page
5. Navigate back to ticket list

**Expected**: Zero additional metadata API calls after initial load

### Phase B: Backend Reliability

#### B1: Database Pre-Ping (FR-006)

**Test**: Simulate stale connection

1. Start backend
2. Make initial request (success)
3. Restart PostgreSQL: `docker-compose restart postgres`
4. Wait for PostgreSQL to be ready
5. Make another request

**Expected**: Request succeeds without manual intervention

#### B2: Pool Overflow (FR-007)

**Test**: Concurrent request handling

```bash
# Install ab (Apache Benchmark) if needed
ab -n 100 -c 50 http://localhost:8000/api/v1/health
```

**Expected**: All 100 requests succeed (no connection pool exhaustion)

#### B3: Conditional Middleware (FR-008)

**Test**: Verify debug middleware conditional loading

1. Set `API_DEBUG=false` in environment
2. Start backend
3. Verify no debug logging output for requests

**Expected**: No debug output when disabled

### Phase C: Infrastructure

#### C1/C2: Container Startup (FR-009, FR-010)

**Test 1**: Non-migration restart

```bash
# Set RUN_MIGRATIONS=false (default)
docker-compose restart backend-1
time curl http://localhost:8000/health
```

**Expected**: Health check responds within 5 seconds

**Test 2**: Migration deployment

```bash
# Set RUN_MIGRATIONS=true
docker-compose up -d backend-1
# Watch logs for migration output
docker-compose logs -f backend-1
```

**Expected**: Migrations run before server starts

## Performance Metrics Collection

### Before Implementation

Record baseline metrics:

| Metric | Value | Method |
|--------|-------|--------|
| Page navigation time | ___ ms | DevTools Performance |
| Redundant API calls | ___ count | Network tab |
| Container restart time | ___ s | `time docker-compose restart` |

### After Implementation

Record post-implementation metrics:

| Metric | Value | Improvement |
|--------|-------|-------------|
| Page navigation time | ___ ms | ___% |
| Redundant API calls | ___ count | ___% |
| Container restart time | ___ s | ___% |

## Rollback Verification

If issues are detected:

### Rollback Frontend Changes
```bash
cd src/it-app
git checkout HEAD~1 -- lib/api/server-fetch.ts lib/api/client-fetch.ts lib/hooks/use-global-metadata.ts
bun run dev  # Restart dev server
```

### Rollback Backend Changes
```bash
cd src/backend
git checkout HEAD~1 -- core/database.py core/config.py app/factory.py
# Restart uvicorn
```

### Rollback Infrastructure Changes
```bash
# Just set RUN_MIGRATIONS=true in docker-compose.yml
docker-compose up -d
```

## Success Criteria Summary

| Criteria | Target | Verified |
|----------|--------|----------|
| SC-001: Page navigation | < 2s p95 | [ ] |
| SC-002: Redundant calls | 0 | [ ] |
| SC-003: Timeout behavior | 30s max | [ ] |
| SC-004: Transient recovery | 90%+ | [ ] |
| SC-005: DB reconnection | Automatic | [ ] |
| SC-006: Concurrent handling | 50+ | [ ] |
| SC-007: Container restart | < 5s | [ ] |
| SC-008: Zero regressions | All tests pass | [ ] |

## Troubleshooting

### Timeout Not Working

- Check if AbortController is properly attached to fetch signal
- Verify timeout value is in milliseconds (30000, not 30)
- Check for error handling catching AbortError

### Retry Not Triggering

- Verify response status is exactly 429 or 503
- Check MAX_RETRIES constant value
- Verify attempt counter is being passed through recursion

### SWR Still Making Redundant Calls

- Verify `revalidateOnMount: false` in config
- Check if `fallbackData` is being provided from SSR
- Verify `dedupingInterval` is set appropriately

### Pre-Ping Connection Errors

- Verify `pool_pre_ping=True` in database.py
- Check PostgreSQL is fully ready before requests
- Verify connection string is correct

### Container Still Slow to Start

- Check `RUN_MIGRATIONS` environment variable value
- Verify start.sh script has execute permissions
- Check Dockerfile CMD is using start.sh
