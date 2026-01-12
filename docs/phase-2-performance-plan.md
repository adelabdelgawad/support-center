# Phase 2 — Safe Performance & Architecture Improvements Plan

## 0. Findings Verification Summary

| Finding ID | Status | Affected App(s) | Justification |
|-----------|--------|-----------------|---------------|
| F01 | Partially Valid | it-app | Multi-hop exists for client mutations (proper for cookie security); server actions use direct `serverFetch`. Rewrites add proxy hop for `/api/v1/*`. |
| F02 | Valid | it-app | 101 files with `'use client'` directive causing substantial hydration cost. |
| F03 | Valid | it-app | 6-7 nested providers (ThemeProvider, SessionContext, SignalRProvider, NavigationProgressProvider, NavigationProvider, SidebarProvider) creating re-render potential. |
| F04 | Valid | it-app | Auth checks in async layout blocking render. No middleware.ts exists. |
| F05 | Valid | it-app | `next.config.ts` rewrites and CORS headers add processing overhead. |
| F06 | Valid | it-app | jsPDF (500KB+) statically imported in client component; SignalR namespace import prevents tree-shaking. |
| F07 | Valid | it-app | 12 loading.tsx files exist but no granular Suspense boundaries for streaming. |
| F08 | Valid | it-app | Zero error.tsx files - errors crash entire pages. |
| F09 | Valid | backend | Blocking file I/O, PIL processing, MinIO calls in async methods. |
| F10 | Valid | backend | MinIO Python SDK is synchronous, blocking event loop in async methods. |
| F11 | No Action | backend | Worker config acceptable (4 in prod, 1 in debug). Docker script could specify workers. |
| F12 | No Action | backend | Database pooling well-configured with proper async engine and pool settings. |
| F14 | Valid | it-app | SWR lacks prefetch strategy; no global cache initialization with server data. |
| F15 | No Action | requester-app | 30s timeout is configurable default; perceived responsiveness handled via skeleton loading and cached auth. |
| F16 | Valid | it-app | Global fetch patching intercepts ALL client-side fetch calls. |
| F17 | Valid | it-app | 28+ repeated `cookies()`/`headers()` calls across request cycles. |
| F18 | No Action | it-app | Cannot definitively determine unused deps without full import analysis; Tauri packages correctly in optionalDependencies. |
| F19 | No Action | it-app | 204 files use named imports (tree-shakeable). No barrel re-exports found. |
| F20 | No Action | backend | Startup already parallelizes external services via `asyncio.gather()`. |
| F21 | Valid | backend | RotatingFileHandler is synchronous - blocks event loop under high log volume. |
| F22 | No Action | requester-app | IPC well optimized with caching, batching, and parallel calls. |
| F23 | No Action | requester-app | Uses sync cache for instant auth; fast startup path. |
| F24 | Valid | it-app | 155 API route files (architecturally correct for security but represents overhead). |
| F12b | **CRITICAL** | network-manager | `engine.dispose()` in finally block destroys connection pool after EVERY request. |

---

## 1. Global Execution Principles

1. **Production-first mindset**: All systems are active production environments
2. **Behavior preservation**: No user-visible behavior changes
3. **Atomic changes**: One concern per change set; easy to isolate regressions
4. **Measure before/after**: Establish baselines; validate improvements quantitatively
5. **Additive preference**: Prefer additive or isolating changes over destructive ones
6. **Fast rollback**: Every change must be revertible within minutes
7. **Staged rollout**: Apply to staging/test environment first; production after validation

---

## 2. Global Preparation (No Code Changes)

### 2.1 Metrics to Establish Baselines

**Frontend (it-app)**
- Time to First Byte (TTFB) for key pages
- Time to Interactive (TTI) / Largest Contentful Paint (LCP)
- JavaScript bundle size (total and per-route)
- Hydration time (React DevTools Profiler)
- Number of client-side fetches on initial load

**Backend (shared)**
- Request latency percentiles (p50, p95, p99) per endpoint
- Event loop blocking time (if instrumented)
- Database query latency
- Connection pool utilization
- Memory usage under load

**Network-manager**
- Request latency before/after fix
- Connection pool metrics (active, idle, overflow)

### 2.2 Baseline Measurement Process

1. **Browser DevTools** (it-app): Record Performance traces for 3 key pages (dashboard, requests list, request detail)
2. **Lighthouse CI**: Run Lighthouse on staging for performance scores
3. **Backend timing logs**: Add temporary structured timing logs if not present
4. **Load testing**: Use k6 or locust for 50 concurrent users baseline

### 2.3 Optional Temporary Diagnostics

- Add `console.time`/`console.timeEnd` around key operations (remove after measurement)
- Enable SQL query logging temporarily in backend
- Add middleware timing headers (`Server-Timing`)

---

## 3. Backend (FastAPI — Shared)

### 3.1 F09/F10: Blocking I/O and MinIO Client (HIGH PRIORITY)

**Goal**: Prevent event loop blocking from synchronous file/MinIO operations.

**Why Safe**: Uses `run_in_executor()` which is a standard asyncio pattern; no behavior change.

**Step-by-Step Plan**:

1. **Identify all blocking calls** in these files:
   - `services/minio_service.py`: `put_object()`, `get_object()`, `bucket_exists()`, `remove_object()`, `stat_object()`
   - `services/file_service.py`: `open()`, `file.read()`, `file.write()`
   - `services/screenshot_service.py`: PIL `Image.open()`, `img.thumbnail()`, `img.save()`
   - `services/chat_file_service.py`: file operations

2. **Create helper function** in `core/async_utils.py`:
   ```
   async def run_blocking(func, *args, **kwargs):
       loop = asyncio.get_running_loop()
       return await loop.run_in_executor(None, partial(func, *args, **kwargs))
   ```

3. **Wrap blocking calls** one service at a time:
   - Start with `minio_service.py` (highest impact)
   - Then `file_service.py`
   - Then `screenshot_service.py`
   - Finally `chat_file_service.py`

4. **For each service**:
   - Replace `client.put_object(...)` with `await run_blocking(client.put_object, ...)`
   - Keep return types and error handling identical

**Validation Checklist**:
- [ ] All existing tests pass
- [ ] File upload endpoint works correctly
- [ ] File download endpoint works correctly
- [ ] Screenshot capture works
- [ ] No new exceptions in logs
- [ ] Backend latency under concurrent load improved or unchanged

**Rollback Strategy**: Revert the single commit; blocking calls work correctly, just less efficiently.

---

### 3.2 F21: Synchronous Logging Handlers (MEDIUM PRIORITY)

**Goal**: Prevent log writes from blocking the event loop.

**Why Safe**: QueueHandler is a drop-in replacement; log output unchanged.

**Step-by-Step Plan**:

1. **Modify `core/logging_config.py`**:
   - Create a `QueueHandler` with a `Queue` object
   - Create a `QueueListener` with the existing `RotatingFileHandler`s
   - Start listener in `setup_logging()`
   - Ensure listener stops on shutdown

2. **Structure**:
   ```
   Logger → QueueHandler → Queue → QueueListener → RotatingFileHandler → File
   ```

3. **Add listener cleanup** in lifespan shutdown

**Validation Checklist**:
- [ ] Log files are still created and written
- [ ] Log rotation still works
- [ ] No log messages lost
- [ ] Graceful shutdown completes without hanging

**Rollback Strategy**: Revert to direct RotatingFileHandler; logs still work.

---

## 4. it-app (Next.js)

### 4.1 Low-Risk Changes (Execute First)

#### 4.1.1 F08: Add Error Boundaries (CRITICAL)

**Goal**: Prevent full-page crashes; enable graceful error recovery.

**Preconditions**: None

**Scope**: Add `error.tsx` files to key route segments

**Step-by-Step Plan**:

1. Create base error component in `components/errors/route-error-boundary.tsx`
2. Add `error.tsx` to these locations (priority order):
   - `app/(it-pages)/error.tsx` (catch-all for authenticated routes)
   - `app/(it-pages)/support-center/error.tsx`
   - `app/(it-pages)/support-center/requests/error.tsx`
   - `app/(it-pages)/support-center/requests/[id]/error.tsx`

3. Each error.tsx must:
   - Be a client component (`'use client'`)
   - Accept `error` and `reset` props
   - Display user-friendly message
   - Provide "Try again" button calling `reset()`
   - Log error to console (or error service)

**Validation**:
- [ ] Trigger an error in each route; boundary catches it
- [ ] Reset button recovers the page
- [ ] Parent routes still work when child errors

**Rollback**: Delete error.tsx files; behavior returns to full-page crashes.

---

#### 4.1.2 F06: Dynamic Import for jsPDF (HIGH IMPACT)

**Goal**: Remove 500KB+ from initial bundle.

**Preconditions**: Identify exact usage location

**Scope**: `components/reports/export-button.tsx`

**Step-by-Step Plan**:

1. Replace static import:
   ```
   // Before
   import { jsPDF } from 'jspdf';
   import autoTable from 'jspdf-autotable';

   // After
   const generatePDF = async () => {
     const { jsPDF } = await import('jspdf');
     const autoTable = (await import('jspdf-autotable')).default;
     // ... rest of PDF generation
   };
   ```

2. Add loading state to export button during dynamic import

3. Measure bundle size before/after

**Validation**:
- [ ] PDF export still works correctly
- [ ] Initial bundle size reduced by ~500KB
- [ ] Button shows loading state during import

**Rollback**: Revert to static import.

---

#### 4.1.3 F06: Fix SignalR Import for Tree-Shaking

**Goal**: Enable tree-shaking for SignalR client.

**Scope**: `lib/signalr/signalr-manager.ts`

**Step-by-Step Plan**:

1. Replace namespace import with named imports:
   ```
   // Before
   import * as signalR from '@microsoft/signalr';

   // After
   import { HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
   ```

2. Update all usages from `signalR.X` to direct `X`

3. Verify all needed exports are imported

**Validation**:
- [ ] SignalR connections still work
- [ ] Real-time notifications function correctly
- [ ] Bundle analyzer shows reduced signalr footprint

**Rollback**: Revert to namespace import.

---

#### 4.1.4 F07: Add Suspense Boundaries for Streaming

**Goal**: Enable partial page streaming; improve perceived performance.

**Scope**: Key pages with multiple data sections

**Step-by-Step Plan**:

1. Identify data-heavy server components in:
   - Dashboard page
   - Requests list page
   - Request detail page

2. Wrap independent data sections with `<Suspense fallback={<Skeleton />}>`

3. Ensure each Suspense child is an async component that fetches its own data

**Validation**:
- [ ] Page streams progressively (visible in network waterfall)
- [ ] Skeletons appear for slow sections
- [ ] Full page still renders correctly

**Rollback**: Remove Suspense wrappers.

---

### 4.2 Medium-Risk Changes

#### 4.2.1 F04: Add Middleware for Auth (HIGH IMPACT)

**Goal**: Move auth checks to edge; unblock layout rendering.

**Preconditions**: Understand current auth flow completely

**Scope**: Create `middleware.ts` in app root

**Step-by-Step Plan**:

1. **Create `middleware.ts`** in `/src/it-app/`:
   ```
   - Check for auth cookie presence
   - If missing and route requires auth → redirect to /login
   - If present → allow request to proceed
   - Configure matcher for protected routes
   ```

2. **Simplify layout auth check**:
   - Keep user data fetching for UI (name, role)
   - Remove redirect logic (now in middleware)

3. **Test authentication flows**:
   - Direct URL access when logged out → redirect works
   - Direct URL access when logged in → page loads faster
   - Login flow → redirect to original URL works

**Validation**:
- [ ] Unauthenticated access redirects correctly
- [ ] Authenticated pages load faster (TTFB improved)
- [ ] User context still available in layout
- [ ] Login redirect preserves intended URL

**Failure Indicators**:
- Authenticated users see login page
- Auth state inconsistent between middleware and layout

**Rollback**: Delete middleware.ts; restore full auth check in layout.

---

#### 4.2.2 F17: Consolidate cookies()/headers() Calls

**Goal**: Reduce async overhead from repeated calls.

**Scope**: `lib/api/server-fetch.ts`, `app/(it-pages)/layout.tsx`, `lib/auth/check-token.ts`

**Step-by-Step Plan**:

1. **In layout.tsx**: Call `cookies()` once, pass to helper functions
   ```
   const cookieStore = await cookies();
   const user = getCurrentUser(cookieStore);
   const theme = getTheme(cookieStore);
   ```

2. **In server-fetch.ts**: Accept optional pre-fetched cookies as parameter

3. **In check-token.ts**: Accept cookieStore as parameter

**Validation**:
- [ ] All functionality preserved
- [ ] Reduced async operations per request
- [ ] No cookie access errors

**Rollback**: Revert to individual calls.

---

#### 4.2.3 F14: Add SWR Prefetch Strategy

**Goal**: Initialize SWR cache with server data; reduce client-side fetches.

**Scope**: Provider setup and key pages

**Step-by-Step Plan**:

1. **Add SWRConfig with fallback** in layout or page:
   ```
   <SWRConfig value={{ fallback: { [cacheKey]: serverData } }}>
   ```

2. **For key data** (user metadata, categories, priorities):
   - Fetch in server component
   - Pass as fallback to SWRConfig
   - Client hooks use cached data immediately

**Validation**:
- [ ] First render shows data without loading state
- [ ] Network tab shows reduced initial fetches
- [ ] Data still refreshes on revalidation

**Rollback**: Remove fallback configuration.

---

#### 4.2.4 F16: Scope Fetch Interception

**Goal**: Reduce overhead by only intercepting necessary requests.

**Scope**: `lib/api/fetch-interceptor.ts`

**Step-by-Step Plan**:

1. **Add URL filtering** to interceptor:
   - Only intercept requests to `/api/*` or backend URL
   - Pass through other requests unchanged

2. **Measure overhead** before/after

**Validation**:
- [ ] API requests still intercepted correctly
- [ ] Third-party fetches unaffected
- [ ] Auth refresh flow works

**Rollback**: Remove URL filter; intercept all.

---

### 4.3 Higher-Risk / Architectural Changes (Execute Last)

#### 4.3.1 F03: Flatten Provider Hierarchy

**Goal**: Reduce reconciliation overhead from nested providers.

**Preconditions**: Understand provider dependencies

**Scope**: `components/auth/client-app-wrapper.tsx`, `app/(it-pages)/layout.tsx`

**Step-by-Step Plan**:

1. **Audit provider dependencies**:
   - Which providers depend on others?
   - Which can be siblings instead of nested?

2. **Compose providers** in a single wrapper:
   ```
   function AppProviders({ children }) {
     return (
       <ThemeProvider>
         <SessionProvider>
           <SignalRProvider>
             <NavigationProvider>
               {children}
             </NavigationProvider>
           </SignalRProvider>
         </SessionProvider>
       </ThemeProvider>
     );
   }
   ```

3. **Move independent providers** out of nesting where possible

4. **Consider lazy provider initialization** for SignalR (only when needed)

**Validation**:
- [ ] All context values accessible
- [ ] No provider dependency errors
- [ ] React DevTools shows flatter component tree

**Failure Indicators**:
- Context undefined errors
- Provider value stale or missing

**Rollback**: Revert to original nesting.

---

#### 4.3.2 F01/F05: Request Path Optimization (CAREFUL)

**Goal**: Reduce request hops where safe.

**Preconditions**: Full understanding of auth cookie flow

**Scope**: `next.config.ts`, select API routes

**Step-by-Step Plan**:

1. **Evaluate rewrites necessity**:
   - Current: `/api/v1/*` → FastAPI (adds Next.js processing)
   - If cookies not needed: could use direct backend calls from client
   - If cookies needed: keep proxy (security requirement)

2. **For server actions**: Already optimal (direct to backend)

3. **Potential optimization for read-only public endpoints**:
   - Allow direct backend calls (if any exist)
   - Keep authenticated endpoints through API routes

4. **DO NOT remove rewrites if**:
   - Any endpoint requires httpOnly cookie handling
   - CORS would break without Next.js proxy

**Validation**:
- [ ] All endpoints still work
- [ ] Auth flow unbroken
- [ ] No CORS errors in browser

**Rollback**: Restore original rewrites.

---

#### 4.3.3 F02: Reduce Client Component Usage (LONG-TERM)

**Goal**: Convert suitable client components to server components.

**Scope**: Gradual, component-by-component

**Step-by-Step Plan**:

1. **Audit candidates** (no state, no effects, no browser APIs):
   - Static display components
   - List renderers without interactivity
   - Layout components

2. **Convert one component at a time**:
   - Remove `'use client'`
   - Move any interactive parts to child client components
   - Test thoroughly

3. **Start with lowest-risk components**:
   - Footer
   - Static headers
   - Display-only cards

**Validation per component**:
- [ ] Component renders correctly
- [ ] No hydration mismatch errors
- [ ] Bundle size reduced

**Rollback**: Re-add `'use client'` directive.

---

#### 4.3.4 F24: API Route Consolidation Strategy (LONG-TERM, LOW PRIORITY)

**Note**: The 155 API routes are architecturally correct for httpOnly cookie security. This is NOT a bug to fix but an area for potential future consolidation.

**Assessment**:
- Routes serve as security boundary (correct pattern)
- Overhead is per-request processing, not architectural flaw
- Consolidation would require careful auth flow analysis

**Recommendation**: No immediate action. Consider only if:
- Specific routes identified as bottlenecks
- Auth pattern changes in future

---

## 5. requester-app (Tauri + SolidJS)

### Findings Assessment

All three requester-app findings verified as **No Action Required**:

| Finding | Why No Action |
|---------|---------------|
| F15 (30s timeout) | Configurable default; perceived responsiveness handled via skeleton loading and cached auth |
| F22 (IPC design) | Already well-optimized with caching, batching, and parallel calls |
| F23 (Startup path) | Uses sync cache for instant auth; fast startup confirmed |

### What Must NOT Be Touched

- Do NOT change IPC patterns (already optimal)
- Do NOT modify auth caching strategy
- Do NOT alter startup sequence
- Do NOT add complexity from it-app patterns

### Desktop-Specific Notes

- requester-app performance is good because it:
  - Uses sync cache for instant state
  - Batches IPC calls
  - Caches screen dimensions and IP
  - Has optimized image processing (SIMD)

- These patterns should remain isolated from it-app changes

---

## 6. network-manager (Critical Fix Only)

### F12b: Database Connection Pool Disposal Bug

**Severity**: CRITICAL

**Location**: `/home/adel/workspace/network-manager/src/backend/db/database.py`, line 43

**Current Code**:
```python
async def get_application_session():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await engine.dispose()  # <-- BUG: Destroys entire pool!
            await session.close()
```

**Why Critical**:
1. `engine.dispose()` destroys ALL pooled connections after EVERY request
2. Subsequent requests must establish new connections (slow)
3. Under load, causes connection exhaustion and latency spikes
4. Completely negates connection pooling benefits

**Why Safe to Fix**:
- Simple code removal
- No behavior change from user perspective
- Database operations work correctly
- Only changes internal connection lifecycle

**Step-by-Step Plan**:

1. **Remove the dispose call**:
   ```python
   async def get_application_session():
       async with AsyncSessionLocal() as session:
           try:
               yield session
           finally:
               await session.close()  # Keep only session close
   ```

2. **Ensure engine disposal happens only at shutdown**:
   - Verify lifespan handler calls `engine.dispose()` on app shutdown
   - If not present, add to shutdown handler

3. **Test thoroughly**:
   - Run load test with 50 concurrent requests
   - Monitor connection pool metrics
   - Verify latency improvement

**Validation Checklist**:
- [ ] All database operations work correctly
- [ ] Connection pool maintains connections between requests
- [ ] Latency under load significantly improved
- [ ] No connection leaks (pool size stable)
- [ ] Graceful shutdown still disposes engine

**Rollback Strategy**: Re-add `await engine.dispose()` line (though this restores the bug).

### Explicit Confirmation

**No other changes planned for network-manager.** This fix is isolated to the single bug identified.

---

## 7. Rollout Strategy

### Execution Order

| Phase | Scope | Changes | Duration |
|-------|-------|---------|----------|
| 1 | network-manager | F12b: Connection pool fix | Immediate |
| 2 | backend | F09/F10: Blocking I/O wrappers | Per-service |
| 3 | it-app low-risk | F08 error boundaries, F06 dynamic imports | Parallel |
| 4 | it-app medium-risk | F04 middleware, F17 cookie consolidation, F14 SWR | Sequential |
| 5 | backend | F21: Async logging | After stability confirmed |
| 6 | it-app architectural | F03 providers, F02 client components | Gradual |

### Safe Deployment Approach

1. **All changes to staging first**
2. **Automated tests must pass** before proceeding
3. **Manual QA verification** of key flows
4. **Gradual production rollout**:
   - Deploy to single instance/canary
   - Monitor for 1 hour
   - Full rollout if stable

### Rollback Triggers

Immediate rollback if:
- Error rate increases > 1%
- P95 latency increases > 20%
- Any critical functionality broken
- User-reported issues spike

### Success Criteria

- P95 latency reduced or unchanged
- No increase in error rates
- Bundle size reduced (for frontend changes)
- Connection pool utilization stable (for backend/network-manager)
- All existing tests pass

---

## 8. Explicit Non-Goals

The following are explicitly OUT OF SCOPE:

1. **No feature changes** - Functionality remains identical
2. **No UI redesign** - Visual appearance unchanged
3. **No behavior changes** - User workflows identical
4. **No dependency upgrades** - Unless required for security
5. **No documentation generation** - Focus on code changes only
6. **No new testing frameworks** - Use existing test infrastructure
7. **No infrastructure changes** - Docker, deployment unchanged
8. **No database schema changes** - Models unchanged
9. **No API contract changes** - Endpoints unchanged

---

## 9. Final Safety Confirmation

This plan is:

- **Conservative**: Each change is minimal and targeted
- **Production-safe**: All changes are reversible within minutes
- **Isolated per application**:
  - it-app changes don't affect requester-app
  - Backend changes benefit all clients equally
  - network-manager fix is completely isolated
- **Incremental**: Changes can be applied one at a time
- **Measurable**: Clear before/after metrics defined

**requester-app will NOT inherit it-app complexity** - the desktop app's optimized patterns (sync caching, batched IPC, fast startup) remain untouched.

**Backend improvements benefit all clients equally** - the blocking I/O fixes improve response times for both it-app and requester-app.

**network-manager fix is critical and isolated** - the connection pool bug fix has no side effects and dramatically improves performance.

---

## Files to Modify (Summary)

### network-manager (1 file)
- `src/backend/db/database.py` - Remove engine.dispose() from request handler

### backend (4-6 files)
- `core/async_utils.py` - New helper (or add to existing utils)
- `services/minio_service.py` - Wrap blocking calls
- `services/file_service.py` - Wrap blocking calls
- `services/screenshot_service.py` - Wrap blocking calls
- `services/chat_file_service.py` - Wrap blocking calls
- `core/logging_config.py` - Add QueueHandler

### it-app (10-15 files)
- `middleware.ts` - New file for auth
- `app/(it-pages)/error.tsx` - New error boundary
- `app/(it-pages)/support-center/error.tsx` - New error boundary
- `components/reports/export-button.tsx` - Dynamic import
- `lib/signalr/signalr-manager.ts` - Named imports
- `lib/api/server-fetch.ts` - Cookie consolidation
- `lib/api/fetch-interceptor.ts` - URL filtering
- `app/(it-pages)/layout.tsx` - Simplified auth, Suspense, cookies
- Various loading.tsx files - Suspense boundaries
