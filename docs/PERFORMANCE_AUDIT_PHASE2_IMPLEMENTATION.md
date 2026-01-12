# Performance Audit Phase 2 - Implementation Plan

**Generated**: 2026-01-11
**Scope**: support_center vs network-manager comparative analysis
**Target**: All high-impact findings from Phase 1

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Implementation Priority Matrix](#implementation-priority-matrix)
3. [Finding Implementations](#finding-implementations)
   - [F01: SWR Revalidation Configuration](#f01-swr-revalidation-configuration)
   - [F02: Server Fetch Timeout](#f02-server-fetch-timeout)
   - [F03: Retry Logic with Backoff](#f03-retry-logic-with-backoff)
   - [F04: Client Fetch Timeout](#f04-client-fetch-timeout)
   - [F05: Database Connection Pre-Ping](#f05-database-connection-pre-ping)
   - [F06: Database Pool Overflow](#f06-database-pool-overflow)
   - [F08: Middleware Optimization](#f08-middleware-optimization)
   - [F09: Startup Optimization](#f09-startup-optimization)
   - [F10: Navigation Fallback Non-Blocking](#f10-navigation-fallback-non-blocking)
   - [F15: Token Refresh Locking](#f15-token-refresh-locking)
4. [Validation Procedures](#validation-procedures)
5. [Rollback Procedures](#rollback-procedures)
6. [Deployment Sequence](#deployment-sequence)

---

## Executive Summary

This document provides step-by-step implementation details for the high-impact performance findings identified in Phase 1. Each finding includes:

- **Current State**: What exists today
- **Target State**: What network-manager does (the reference implementation)
- **Implementation Steps**: Exact code changes required
- **Validation**: How to verify the fix works
- **Rollback**: How to revert if issues arise

**Affected Components**:
| Component | Findings | Risk Level |
|-----------|----------|------------|
| it-app (Next.js) | F01, F02, F03, F04, F10, F15 | Low |
| backend (FastAPI) | F05, F06, F08, F09 | Medium |

---

## Implementation Priority Matrix

| Priority | Finding | Impact | Effort | Dependencies |
|----------|---------|--------|--------|--------------|
| 1 | F02 + F03 | High | Low | None |
| 2 | F05 | High | Low | None |
| 3 | F01 | High | Low | None |
| 4 | F09 | High | Medium | Deployment window |
| 5 | F04 | Medium | Low | F02 (shares pattern) |
| 6 | F06 | Medium | Low | None |
| 7 | F08 | Medium | Low | None |
| 8 | F10 | Medium | Medium | None |
| 9 | F15 | Medium | Medium | None |

---

## Finding Implementations

---

### F01: SWR Revalidation Configuration

**Affected App**: `it-app`
**File**: `src/it-app/lib/hooks/use-global-metadata.ts`
**Risk**: Low

#### Current State

```typescript
const METADATA_SWR_CONFIG = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  revalidateOnMount: true,  // <-- PROBLEM: Always revalidates even with fallbackData
  revalidateIfStale: true,
  dedupingInterval: 300000,
  focusThrottleInterval: 300000,
};
```

#### Target State (network-manager pattern)

```typescript
const METADATA_SWR_CONFIG = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  revalidateOnMount: false,  // <-- Don't refetch if we have fallbackData
  revalidateIfStale: true,   // <-- Will refetch if data is stale (after dedupingInterval)
  dedupingInterval: 300000,
  focusThrottleInterval: 300000,
};
```

#### Implementation Steps

**Step 1**: Update SWR configuration in `use-global-metadata.ts`

```typescript
// File: src/it-app/lib/hooks/use-global-metadata.ts
// Line: 31-38

/**
 * SWR configuration for global metadata
 * Uses longer cache times and disabled revalidation since this data changes infrequently
 *
 * OPTIMIZATION: revalidateOnMount is disabled when fallbackData exists.
 * This prevents redundant API calls on every component mount.
 * Data will still be revalidated if stale (after dedupingInterval).
 */
const METADATA_SWR_CONFIG = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  revalidateOnMount: false,  // Changed: Don't refetch if we have fallbackData
  revalidateIfStale: true,
  dedupingInterval: 300000,  // 5 minutes
  focusThrottleInterval: 300000,
};
```

**Step 2**: The hooks already correctly use `fallbackData` from SSR, so no changes needed there.

#### Validation

1. Open browser DevTools Network tab
2. Navigate to a page that uses metadata (e.g., ticket details)
3. **Before**: Multiple `/api/priorities`, `/api/metadata/statuses` calls on mount
4. **After**: Zero redundant calls if data already loaded from SSR

#### Rollback

Revert the single line change: `revalidateOnMount: true`

---

### F02: Server Fetch Timeout

**Affected App**: `it-app`
**File**: `src/it-app/lib/api/server-fetch.ts`
**Risk**: Low

#### Current State

```typescript
// No timeout implementation - fetch can hang indefinitely
const response = await fetch(fullUrl, fetchOptions);
```

#### Target State (network-manager pattern)

```typescript
// 30-second timeout with AbortController
const DEFAULT_TIMEOUT = 30000;

const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), options?.timeout || DEFAULT_TIMEOUT);

try {
  const response = await fetch(fullUrl, { ...fetchOptions, signal: controller.signal });
  // ... handle response
} catch (error) {
  if (error instanceof Error && error.name === 'AbortError') {
    throw new ServerApiError('Request timeout', 408, 'Request timed out after 30 seconds');
  }
  throw error;
} finally {
  clearTimeout(timeoutId);
}
```

#### Implementation Steps

**Step 1**: Add timeout constants at the top of the file

```typescript
// File: src/it-app/lib/api/server-fetch.ts
// Add after line 17

const DEFAULT_TIMEOUT = 30000; // 30 seconds
```

**Step 2**: Update `serverFetch` function

```typescript
// File: src/it-app/lib/api/server-fetch.ts
// Replace lines 61-125 (the serverFetch function)

export async function serverFetch<T>(
  endpoint: string,
  options?: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    headers?: Record<string, string>;
    revalidate?: number | false;
    tags?: string[];
    timeout?: number;
    cache?: RequestCache;
  }
): Promise<T> {
  const fullUrl = `${API_URL}${API_BASE_PATH}${endpoint}`;
  const method = options?.method || 'GET';
  const timeout = options?.timeout || DEFAULT_TIMEOUT;

  const accessToken = await getAccessToken();
  const forwardedHeaders = await getForwardingHeaders();

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...forwardedHeaders,
    ...options?.headers,
  };

  if (accessToken) {
    requestHeaders['Authorization'] = `Bearer ${accessToken}`;
  }

  // Setup timeout with AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const fetchOptions: RequestInit = {
    method,
    headers: requestHeaders,
    signal: controller.signal,
  };

  if (options?.body !== undefined) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  if (options?.cache) {
    fetchOptions.cache = options.cache;
  } else if (options?.revalidate !== undefined || options?.tags) {
    fetchOptions.next = {
      revalidate: options.revalidate,
      tags: options.tags,
    };
  }

  try {
    const response = await fetch(fullUrl, fetchOptions);

    if (!response.ok) {
      let errorData: unknown = {};
      try { errorData = await response.json(); } catch {}
      throw new ServerApiError(
        extractErrorMessage(errorData),
        response.status,
        typeof (errorData as Record<string, unknown>)?.detail === 'string'
          ? (errorData as Record<string, unknown>).detail as string
          : undefined,
        fullUrl,
        method
      );
    }

    if (response.status === 204) return undefined as T;
    return response.json();
  } catch (error) {
    // Handle timeout
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ServerApiError(
        'Request timeout',
        408,
        `Request to ${endpoint} timed out after ${timeout / 1000} seconds`,
        fullUrl,
        method
      );
    }
    // Re-throw other errors
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

**Step 3**: Update `makePublicRequest` with same pattern

```typescript
// File: src/it-app/lib/api/server-fetch.ts
// Replace lines 130-159 (the makePublicRequest function)

export async function makePublicRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  endpoint: string,
  data?: unknown,
  config?: {
    headers?: Record<string, string>;
    timeout?: number;
  }
): Promise<T> {
  const fullUrl = `${API_URL}${API_BASE_PATH}${endpoint}`;
  const timeout = config?.timeout || DEFAULT_TIMEOUT;
  const forwardedHeaders = await getForwardingHeaders();

  // Setup timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(fullUrl, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...forwardedHeaders,
        ...config?.headers,
      },
      body: data !== undefined ? JSON.stringify(data) : undefined,
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorData: unknown = {};
      try { errorData = await response.json(); } catch {}
      throw new ServerApiError(extractErrorMessage(errorData), response.status, undefined, fullUrl, method);
    }

    return response.json();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ServerApiError('Request timeout', 408, `Request timed out after ${timeout / 1000} seconds`, fullUrl, method);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

#### Validation

1. Temporarily reduce timeout to 100ms in dev
2. Make a request to a slow endpoint
3. Verify 408 error is thrown after timeout
4. Restore timeout to 30000ms

#### Rollback

Revert the file to previous version (timeout logic is additive, no data loss risk).

---

### F03: Retry Logic with Backoff

**Affected App**: `it-app`
**File**: `src/it-app/lib/api/server-fetch.ts`
**Risk**: Low

#### Current State

No retry logic exists. Transient failures (429, 503) cause immediate errors.

#### Target State (network-manager pattern)

```typescript
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

// Retry on 429 (rate limit) or 503 (service unavailable)
if ((response.status === 429 || response.status === 503) && attempt < MAX_RETRIES) {
  clearTimeout(timeoutId);
  await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
  return serverFetchWithRetry<T>(endpoint, options, attempt + 1);
}
```

#### Implementation Steps

**Step 1**: Add retry constants

```typescript
// File: src/it-app/lib/api/server-fetch.ts
// Add after DEFAULT_TIMEOUT constant

const MAX_RETRIES = 2;
const RETRY_DELAY = 1000; // 1 second base delay
```

**Step 2**: Create a retry wrapper function (internal)

```typescript
// File: src/it-app/lib/api/server-fetch.ts
// Add as an internal function before the exported serverFetch

async function serverFetchInternal<T>(
  endpoint: string,
  options?: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    headers?: Record<string, string>;
    revalidate?: number | false;
    tags?: string[];
    timeout?: number;
    cache?: RequestCache;
  },
  attempt: number = 1
): Promise<T> {
  const fullUrl = `${API_URL}${API_BASE_PATH}${endpoint}`;
  const method = options?.method || 'GET';
  const timeout = options?.timeout || DEFAULT_TIMEOUT;

  const accessToken = await getAccessToken();
  const forwardedHeaders = await getForwardingHeaders();

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...forwardedHeaders,
    ...options?.headers,
  };

  if (accessToken) {
    requestHeaders['Authorization'] = `Bearer ${accessToken}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  const fetchOptions: RequestInit = {
    method,
    headers: requestHeaders,
    signal: controller.signal,
  };

  if (options?.body !== undefined) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  if (options?.cache) {
    fetchOptions.cache = options.cache;
  } else if (options?.revalidate !== undefined || options?.tags) {
    fetchOptions.next = {
      revalidate: options.revalidate,
      tags: options.tags,
    };
  }

  try {
    const response = await fetch(fullUrl, fetchOptions);

    // Retry on transient errors
    if ((response.status === 429 || response.status === 503) && attempt < MAX_RETRIES) {
      clearTimeout(timeoutId);
      // Exponential backoff: 1s, 2s
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
      return serverFetchInternal<T>(endpoint, options, attempt + 1);
    }

    if (!response.ok) {
      let errorData: unknown = {};
      try { errorData = await response.json(); } catch {}
      throw new ServerApiError(
        extractErrorMessage(errorData),
        response.status,
        typeof (errorData as Record<string, unknown>)?.detail === 'string'
          ? (errorData as Record<string, unknown>).detail as string
          : undefined,
        fullUrl,
        method
      );
    }

    if (response.status === 204) return undefined as T;
    return response.json();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ServerApiError(
        'Request timeout',
        408,
        `Request to ${endpoint} timed out after ${timeout / 1000} seconds`,
        fullUrl,
        method
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Unified server-side fetch with timeout and retry
 */
export async function serverFetch<T>(
  endpoint: string,
  options?: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    headers?: Record<string, string>;
    revalidate?: number | false;
    tags?: string[];
    timeout?: number;
    cache?: RequestCache;
  }
): Promise<T> {
  return serverFetchInternal<T>(endpoint, options, 1);
}
```

#### Validation

1. Temporarily return 503 from an API endpoint
2. Watch logs for retry attempts
3. Verify 2 retry attempts with 1s, 2s delays
4. Verify error is thrown after max retries

#### Rollback

Remove retry logic; function still works without it.

---

### F04: Client Fetch Timeout

**Affected App**: `it-app`
**File**: `src/it-app/lib/api/client-fetch.ts`
**Risk**: Low

#### Current State

```typescript
// No timeout - relies on browser's default (which varies)
const response = await fetch(url, {
  method: 'GET',
  credentials: 'include',
});
```

#### Target State

Add AbortController with 30-second timeout (matching server pattern).

#### Implementation Steps

**Step 1**: Add constants and update apiClient methods

```typescript
// File: src/it-app/lib/api/client-fetch.ts
// Replace the entire apiClient object (lines 133-201)

const DEFAULT_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

/**
 * Internal fetch with timeout and retry
 */
async function clientFetchInternal<T>(
  url: string,
  options: {
    method: string;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
  },
  attempt: number = 1
): Promise<T> {
  const timeout = options.timeout || DEFAULT_TIMEOUT;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
      credentials: 'include',
      signal: controller.signal,
    });

    // Retry on transient errors
    if ((response.status === 429 || response.status === 503) && attempt < MAX_RETRIES) {
      clearTimeout(timeoutId);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
      return clientFetchInternal<T>(url, options, attempt + 1);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      handleErrorResponse(response, errorData);
    }

    return response.json();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ClientFetchError('Request timeout', 408, `Request timed out after ${timeout / 1000} seconds`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Convenience wrapper for fetch with standard options
 * Includes timeout (30s default) and retry on 429/503
 */
export const apiClient = {
  async get<T>(url: string, options?: { timeout?: number }): Promise<T> {
    return clientFetchInternal<T>(url, { method: 'GET', ...options });
  },

  async post<T>(url: string, data?: unknown, options?: { timeout?: number }): Promise<T> {
    return clientFetchInternal<T>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    });
  },

  async put<T>(url: string, data?: unknown, options?: { timeout?: number }): Promise<T> {
    return clientFetchInternal<T>(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    });
  },

  async patch<T>(url: string, data?: unknown, options?: { timeout?: number }): Promise<T> {
    return clientFetchInternal<T>(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    });
  },

  async delete<T>(url: string, data?: unknown, options?: { timeout?: number }): Promise<T> {
    return clientFetchInternal<T>(url, {
      method: 'DELETE',
      headers: data ? { 'Content-Type': 'application/json' } : undefined,
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    });
  },
};
```

#### Validation

Same as F02 - test with reduced timeout.

#### Rollback

Revert to previous version without timeout/retry.

---

### F05: Database Connection Pre-Ping

**Affected App**: `backend (shared)`
**File**: `src/backend/core/database.py`
**Risk**: Medium (affects all clients)

#### Current State

```python
engine = create_async_engine(
    str(settings.database.url),
    pool_pre_ping=False,  # Disabled - stale connections not detected until query fails
    # ...
)
```

#### Target State (network-manager pattern)

```python
engine = create_async_engine(
    str(settings.database.url),
    pool_pre_ping=True,  # Enabled - validates connections before use
    # ...
)
```

#### Implementation Steps

**Step 1**: Update database.py

```python
# File: src/backend/core/database.py
# Line 31: Change pool_pre_ping from False to True

engine = create_async_engine(
    str(settings.database.url),
    echo=bool(settings.performance.enable_query_logging),
    future=True,
    pool_pre_ping=True,  # CHANGED: Enable pre-ping to detect stale connections
    pool_size=settings.database.pool_size,
    max_overflow=settings.database.max_overflow,
    pool_timeout=settings.database.pool_timeout,
    pool_recycle=settings.database.pool_recycle,
    poolclass=AsyncAdaptedQueuePool,
    connect_args={
        "server_settings": {
            "jit": "on",
            "application_name": settings.api.app_name,
        },
        "command_timeout": 60,
        "timeout": 30,
    },
)
```

**Step 2**: Update comment to reflect the change

```python
# Remove the old comment about "Disable pre-ping for faster startup"
# Add: "Enable pre-ping to validate connections before use (prevents stale connection errors)"
```

#### Validation

1. Start backend
2. Kill and restart PostgreSQL (simulate connection drop)
3. Make API request
4. **Before**: Query fails with connection error
5. **After**: Connection is automatically refreshed, query succeeds

#### Rollback

Set `pool_pre_ping=False` (single line change).

---

### F06: Database Pool Overflow

**Affected App**: `backend (shared)`
**File**: `src/backend/core/config.py`
**Risk**: Low

#### Current State

```python
class DatabaseSettings(BaseSettings):
    pool_size: int = 10
    max_overflow: int = 5  # Only 5 additional connections under load
```

#### Target State (network-manager pattern)

```python
class DatabaseSettings(BaseSettings):
    pool_size: int = 10
    max_overflow: int = 20  # 20 additional connections for traffic spikes
```

#### Implementation Steps

**Step 1**: Update config.py

```python
# File: src/backend/core/config.py
# Find DatabaseSettings class, update max_overflow

class DatabaseSettings(BaseSettings):
    # ... other fields ...
    pool_size: int = 10
    max_overflow: int = 20  # CHANGED: Increased from 5 to handle traffic spikes
```

#### Validation

1. Load test with 50 concurrent requests
2. Monitor `pg_stat_activity` for connection count
3. **Before**: Connections exhaust at 15, requests queue
4. **After**: Connections scale to 30, no queuing

#### Rollback

Set `max_overflow: int = 5`

---

### F08: Middleware Optimization

**Affected App**: `backend (shared)`
**File**: `src/backend/app/factory.py`
**Risk**: Low

#### Current State

5 middleware layers:
1. Rate Limiting
2. Debug Logging (even when disabled)
3. CORS
4. Security Headers
5. Origin Validation

#### Target State

Optimize middleware order and skip debug logging when disabled.

#### Implementation Steps

**Step 1**: Ensure debug middleware is skipped when not needed

```python
# File: src/backend/app/factory.py
# Wrap debug middleware in conditional (if not already)

if settings.api.debug:
    from core.middleware.debug import DebugLoggingMiddleware
    app.add_middleware(DebugLoggingMiddleware)
```

**Step 2**: Verify middleware order (most efficient order)

```python
# Optimal order (outermost to innermost):
# 1. Rate Limiting (early rejection of abusive requests)
# 2. CORS (preflight handling)
# 3. Origin Validation (CSRF protection)
# 4. Security Headers (response headers)
# 5. Debug Logging (only if enabled)
```

#### Validation

1. Time API requests before/after
2. Expected improvement: 2-10ms per request

#### Rollback

Revert middleware order changes.

---

### F09: Startup Optimization

**Affected App**: `backend (shared)`
**File**: `docker/backend/Dockerfile`
**Risk**: Medium (requires deployment window)

#### Current State

```dockerfile
CMD python init_db.py && alembic stamp head && uvicorn main:app --host 0.0.0.0 --port 8000
```

This runs on EVERY container start, blocking first request by 10-30 seconds.

#### Target State

Run migrations only when needed (during deployment, not restart).

#### Implementation Steps

**Step 1**: Create a startup script

```bash
# File: docker/backend/start.sh

#!/bin/bash
set -e

# Check if this is a fresh deployment (migrations needed)
if [ "$RUN_MIGRATIONS" = "true" ]; then
    echo "Running database initialization..."
    python init_db.py
    echo "Stamping alembic head..."
    alembic stamp head
fi

# Start the server
exec uvicorn main:app --host 0.0.0.0 --port 8000
```

**Step 2**: Update Dockerfile

```dockerfile
# File: docker/backend/Dockerfile
# Replace CMD with:

COPY docker/backend/start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Default: skip migrations on restart (set RUN_MIGRATIONS=true for deploys)
ENV RUN_MIGRATIONS=false

CMD ["/app/start.sh"]
```

**Step 3**: Update docker-compose for deployments

```yaml
# File: docker-compose.yml
# Add environment variable for deployment runs

backend-1:
  environment:
    - RUN_MIGRATIONS=false  # Set to true during deploy
```

#### Validation

1. Start container with `RUN_MIGRATIONS=false`
2. Measure time to first request
3. **Before**: 10-30 seconds
4. **After**: 1-3 seconds

#### Rollback

Set `RUN_MIGRATIONS=true` or revert to old CMD.

---

### F10: Navigation Fallback Non-Blocking

**Affected App**: `it-app`
**File**: `src/it-app/app/(it-pages)/layout.tsx`
**Risk**: Low

#### Current State

If navigation cookie cache misses, the fallback API fetch blocks the initial render.

#### Target State

Use Suspense or parallel fetching to prevent blocking.

#### Implementation Steps

This requires more extensive refactoring. Consider:

1. Wrap navigation component in Suspense
2. Use loading skeleton while navigation loads
3. Pre-fetch navigation in middleware

**Minimal Implementation**:

```typescript
// File: src/it-app/app/(it-pages)/layout.tsx
// Wrap SidebarNavWrapper in Suspense

import { Suspense } from 'react';
import { SidebarNavSkeleton } from './_components/sidebar-nav-skeleton';

// In the layout return:
<SidebarProvider>
  <PageRedirectWrapper>
    <Suspense fallback={<SidebarNavSkeleton />}>
      <SidebarNavWrapper navigation={navigation} />
    </Suspense>
  </PageRedirectWrapper>
  {/* ... rest */}
</SidebarProvider>
```

#### Validation

1. Clear navigation cookie
2. Navigate to protected page
3. **Before**: Page loads slowly while navigation fetches
4. **After**: Page loads immediately with skeleton, navigation fills in

#### Rollback

Remove Suspense wrapper.

---

### F15: Token Refresh Locking

**Affected App**: `it-app`
**File**: `src/it-app/lib/auth/auth-service.ts`
**Risk**: Low

#### Current State

Note: The support_center backend uses 30-day tokens without refresh. This finding is less critical but included for completeness.

If refresh tokens are added in the future, implement refresh locking:

```typescript
// network-manager pattern (lines 272-293)
private static refreshPromise: Promise<string | null> | null = null;

static async refreshAccessToken(): Promise<string | null> {
  // If a refresh is already in progress, wait for it
  if (this.refreshPromise) {
    return this.refreshPromise;
  }

  this.refreshPromise = this.performRefresh();

  try {
    return await this.refreshPromise;
  } finally {
    this.refreshPromise = null;
  }
}
```

#### Implementation Steps

Not applicable currently (30-day tokens, no refresh). Document for future reference.

---

## Validation Procedures

### Pre-Implementation Checklist

- [ ] Backup current code (git branch or tag)
- [ ] Run existing test suite, ensure all pass
- [ ] Document current performance baseline
- [ ] Set up monitoring for API response times

### Post-Implementation Validation

#### Frontend Validation (F01, F02, F03, F04)

```bash
# Terminal 1: Start dev server
cd src/it-app && bun run dev

# Terminal 2: Run validation
# 1. Open http://localhost:3010 in browser
# 2. Open DevTools > Network tab
# 3. Navigate between pages
# 4. Verify:
#    - No redundant API calls (F01)
#    - Requests complete or timeout in 30s (F02, F04)
#    - Retry headers visible on 429/503 (F03)
```

#### Backend Validation (F05, F06, F08, F09)

```bash
# Terminal 1: Start backend
cd src/backend && uvicorn main:app --reload

# Terminal 2: Run validation
# Test pre-ping (F05):
curl http://localhost:8000/health

# Test pool (F06):
# Use load testing tool (locust, k6, or ab)
ab -n 100 -c 50 http://localhost:8000/api/v1/health

# Monitor PostgreSQL connections:
psql -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'servicecatalog';"
```

### Performance Metrics to Collect

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| Time to First Byte (TTFB) | ? ms | ? ms | < 200ms |
| API Response Time (p50) | ? ms | ? ms | < 100ms |
| API Response Time (p99) | ? ms | ? ms | < 500ms |
| Redundant API Calls | X/page | 0/page | 0/page |
| Container Start Time | ? s | ? s | < 5s |

---

## Rollback Procedures

### Quick Rollback (< 5 minutes)

All changes are isolated to specific files. To rollback any finding:

```bash
# Frontend changes (F01, F02, F03, F04, F10, F15)
cd src/it-app
git checkout HEAD~1 -- lib/api/server-fetch.ts
git checkout HEAD~1 -- lib/api/client-fetch.ts
git checkout HEAD~1 -- lib/hooks/use-global-metadata.ts

# Backend changes (F05, F06, F08, F09)
cd src/backend
git checkout HEAD~1 -- core/database.py
git checkout HEAD~1 -- core/config.py
git checkout HEAD~1 -- app/factory.py
```

### Full Rollback

If all changes need to be reverted:

```bash
git revert HEAD  # Creates a new commit reversing all changes
```

---

## Deployment Sequence

### Recommended Order

1. **Phase A: Frontend (Low Risk)**
   - Deploy F01, F02, F03, F04 together
   - Validation: DevTools Network tab
   - Rollback if needed: Immediate (frontend only)

2. **Phase B: Backend Config (Low Risk)**
   - Deploy F05, F06
   - Validation: Health check + load test
   - Rollback if needed: Config change only

3. **Phase C: Backend Startup (Medium Risk)**
   - Deploy F09 during maintenance window
   - Validation: Container restart time
   - Rollback if needed: Environment variable change

4. **Phase D: Middleware (Low Risk)**
   - Deploy F08
   - Validation: API timing
   - Rollback if needed: Middleware order change

### Timeline

| Phase | Duration | Window |
|-------|----------|--------|
| Phase A | 30 min | Any time |
| Phase B | 30 min | Any time |
| Phase C | 1 hour | Maintenance window |
| Phase D | 30 min | Any time |

---

## Appendix: File Change Summary

| File | Findings | Lines Changed |
|------|----------|---------------|
| `src/it-app/lib/api/server-fetch.ts` | F02, F03 | ~80 lines |
| `src/it-app/lib/api/client-fetch.ts` | F04 | ~60 lines |
| `src/it-app/lib/hooks/use-global-metadata.ts` | F01 | 1 line |
| `src/backend/core/database.py` | F05 | 1 line |
| `src/backend/core/config.py` | F06 | 1 line |
| `src/backend/app/factory.py` | F08 | ~5 lines |
| `docker/backend/Dockerfile` | F09 | ~10 lines |
| `docker/backend/start.sh` (new) | F09 | ~15 lines |

---

## Approval Checklist

Before implementation, confirm:

- [ ] All stakeholders notified
- [ ] Maintenance window scheduled (for F09)
- [ ] Backup verified
- [ ] Rollback procedure tested
- [ ] Monitoring dashboards ready

---

**Document Version**: 1.0
**Last Updated**: 2026-01-11
**Author**: Claude (Performance Audit Agent)
