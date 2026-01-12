# Research: Performance Optimization

**Feature**: 002-performance-optimization
**Date**: 2026-01-11

## Overview

This research documents the technical decisions and patterns adopted from the network-manager codebase to improve support_center performance. All patterns have been validated in production through the network-manager deployment.

## Research Findings

### R1: Request Timeout Implementation

**Decision**: Use AbortController with 30-second timeout

**Rationale**:
- AbortController is the standard Web API for request cancellation
- 30 seconds balances between allowing slow operations and preventing indefinite hangs
- Compatible with both server-side (Next.js) and client-side (browser) fetch
- Proven pattern in network-manager (`lib/fetch/server.ts` lines 68-71)

**Alternatives Considered**:
- `axios` with timeout option: Would require adding new dependency
- Custom Promise.race: Less clean, doesn't properly cancel the underlying request
- Shorter timeout (10s): Risk of prematurely terminating legitimate slow operations

**Implementation Pattern**:
```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), timeout);
try {
  const response = await fetch(url, { signal: controller.signal });
} catch (error) {
  if (error.name === 'AbortError') {
    throw new Error('Request timeout', { cause: error });
  }
} finally {
  clearTimeout(timeoutId);
}
```

### R2: Retry Logic with Exponential Backoff

**Decision**: Retry 2 times with 1s, 2s delays for HTTP 429 and 503 responses

**Rationale**:
- 429 (Rate Limit) and 503 (Service Unavailable) are transient by nature
- 2 retries provides good recovery without excessive delays
- Exponential backoff (1s, 2s) prevents thundering herd on recovery
- Proven pattern in network-manager (`lib/fetch/client.ts` lines 80-84)

**Alternatives Considered**:
- Fixed delay: Less effective at preventing synchronized retries
- 3+ retries: Longer total delay, diminishing returns after 2 attempts
- Retry all 5xx: Some 5xx errors (500, 501) indicate permanent failures
- Circuit breaker: Overkill for current scale

**Implementation Pattern**:
```typescript
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

if ((response.status === 429 || response.status === 503) && attempt < MAX_RETRIES) {
  await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
  return fetchWithRetry(url, options, attempt + 1);
}
```

### R3: SWR Revalidation Configuration

**Decision**: Set `revalidateOnMount: false` when `fallbackData` is provided

**Rationale**:
- Server-side rendering provides fresh data as `fallbackData`
- `revalidateOnMount: true` triggers redundant API calls
- `revalidateIfStale: true` still ensures data freshness when stale
- 5-minute `dedupingInterval` prevents excessive refetches during navigation

**Alternatives Considered**:
- Keep `revalidateOnMount: true`: Causes unnecessary API traffic
- Disable all revalidation: Risk of stale data
- Different cache library: Major refactoring, not justified

**Implementation Pattern**:
```typescript
const METADATA_SWR_CONFIG = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  revalidateOnMount: false,  // Changed from true
  revalidateIfStale: true,   // Still refreshes stale data
  dedupingInterval: 300000,  // 5 minutes
};
```

### R4: Database Connection Pre-Ping

**Decision**: Enable `pool_pre_ping=True` for SQLAlchemy async engine

**Rationale**:
- Pre-ping validates connections before use
- Catches stale connections from network interruptions, DB restarts
- Overhead is minimal (<1ms per connection validation)
- Prevents user-facing connection errors
- Standard practice in network-manager (`db/database.py` line 24)

**Alternatives Considered**:
- Keep disabled: Faster startup but stale connection errors at runtime
- Shorter pool recycle: Doesn't catch sudden disconnections
- Application-level retry: More complex, pre-ping is simpler

**Implementation**:
```python
engine = create_async_engine(
    database_url,
    pool_pre_ping=True,  # Enable connection validation
)
```

### R5: Connection Pool Overflow

**Decision**: Increase `max_overflow` from 5 to 20

**Rationale**:
- Base pool size of 10 is appropriate for normal load
- Traffic spikes can exceed 15 concurrent connections
- 20 overflow allows up to 30 total connections
- Prevents "connection pool exhausted" errors during peaks
- Matches network-manager configuration

**Alternatives Considered**:
- Increase base pool size: Uses more resources at idle
- PgBouncer only: Already in place, overflow provides additional buffer
- Queue requests: Adds latency, worse user experience

**Implementation**:
```python
class DatabaseSettings(BaseSettings):
    pool_size: int = 10
    max_overflow: int = 20  # Changed from 5
```

### R6: Conditional Middleware Loading

**Decision**: Load debug middleware only when `settings.api.debug` is True

**Rationale**:
- Debug middleware adds overhead even when not actively logging
- Import cost for unused middleware affects startup time
- Conditional loading is standard practice
- Already partially implemented but needs verification

**Alternatives Considered**:
- Always load, conditional logging: Still has import overhead
- Remove debug middleware: Loses debugging capability in development

**Implementation**:
```python
if settings.api.debug:
    from core.middleware.debug import DebugLoggingMiddleware
    app.add_middleware(DebugLoggingMiddleware)
```

### R7: Startup Optimization

**Decision**: Make database migration execution conditional via `RUN_MIGRATIONS` environment variable

**Rationale**:
- `init_db.py && alembic stamp head` runs on every container start
- This blocks first request by 10-30 seconds
- Migrations only needed for fresh deployments, not restarts
- Environment variable provides explicit control
- Default `false` preserves fast restart behavior

**Alternatives Considered**:
- Always run migrations: Slow restarts
- Detect if migrations needed: Complex, error-prone
- Separate migration job: More infrastructure complexity

**Implementation**:
```bash
#!/bin/bash
if [ "$RUN_MIGRATIONS" = "true" ]; then
    python init_db.py
    alembic stamp head
fi
exec uvicorn main:app --host 0.0.0.0 --port 8000
```

## Risk Assessment

| Decision | Risk Level | Mitigation |
|----------|------------|------------|
| R1: Timeout | Low | Graceful error handling, timeout is configurable |
| R2: Retry | Low | Exponential backoff prevents thundering herd |
| R3: SWR config | Low | revalidateIfStale ensures freshness |
| R4: Pre-ping | Low | Minimal overhead, prevents worse failures |
| R5: Pool overflow | Low | Matches production-proven configuration |
| R6: Conditional middleware | Low | Only affects debug mode |
| R7: Startup optimization | Medium | Environment variable provides explicit control |

## Validation Approach

Each decision will be validated using:

1. **Unit tests**: Verify timeout and retry behavior in isolation
2. **Integration tests**: End-to-end request flow with simulated failures
3. **Manual testing**: DevTools Network tab observation
4. **Load testing**: ab or k6 for concurrent request handling
5. **Restart testing**: Container restart time measurement

## References

- network-manager source: `/home/adel/workspace/network-manager/`
- Performance audit: `docs/PERFORMANCE_AUDIT_PHASE2_IMPLEMENTATION.md`
- Phase 1 findings: `docs/PERFORMANCE_AUDIT_PHASE1_FINDINGS.md`
