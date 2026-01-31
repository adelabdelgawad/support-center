# Fix for Duplicate API Requests - Implementation Summary

## Problem
The request details page was making duplicate API calls (4x each) for:
- `/api/requests/{id}/sub-tasks?skip=0&limit=20`
- `/api/users/{id}/status`

This caused unnecessary network traffic, increased latency, and poor performance.

## Root Causes
1. **Context Re-render Cascade**: Session state was initialized in `useEffect` after mount, causing full context re-renders
2. **Unstable Object References**: Context values weren't properly memoized
3. **Raw fetch() Without Deduplication**: Components used manual `fetch()` calls without SWR deduplication
4. **Redundant Data Fetching**: Sub-tasks were fetched both at page level (SSR) and in component

## Implementation

### Phase 1: Stabilize Context Values

#### 1.1 Fixed Session Initialization in RequestDetailProvider
**File**: `src/it-app/app/(it-pages)/support-center/requests/(details)/[id]/_context/request-detail-context.tsx`

**Change**: Initialize session synchronously using `useState` initializer function instead of `useEffect`

```typescript
// BEFORE: Caused re-render after mount
const [session, setSession] = useState<{ user: any } | null>(null);
useEffect(() => {
  setSession(getSessionFromCookie());
}, []);

// AFTER: Synchronous initialization, no re-render
const [session] = useState<{ user: any } | null>(() => {
  // Initialization logic here
  return getSessionFromCookie();
});
```

**Impact**: Eliminates one full context re-render cycle on mount

#### 1.2 Fixed Session Initialization in RequestDetailMetadataProvider
**File**: `src/it-app/app/(it-pages)/support-center/requests/(details)/[id]/_context/request-detail-metadata-context.tsx`

**Change**: Same synchronous initialization pattern for metadata context

**Impact**: Prevents cascading re-renders in child components

### Phase 2: Convert to SWR Hooks

#### 2.1 Created useUserStatus Hook
**File**: `src/it-app/lib/hooks/use-user-status.ts` (NEW)

**Features**:
- Automatic request deduplication (30s window)
- Auto-refresh every 30s
- No refetch on window focus
- Graceful error handling (returns offline state)

**API**:
```typescript
const { status, userStatus, isLoading, error, mutate } = useUserStatus(
  userId,
  enabled
);
```

#### 2.2 Created useSubTasks Hook
**File**: `src/it-app/lib/hooks/use-sub-tasks.ts` (NEW)

**Features**:
- Automatic request deduplication (30s window)
- Uses initial SSR data (no refetch if data exists)
- Fetches both tasks and stats in parallel
- Combined mutate function for refreshing both

**API**:
```typescript
const { tasks, total, stats, isLoading, error, mutate } = useSubTasks(
  requestId,
  initialData,
  { enabled: true }
);
```

#### 2.3 Updated UserInfoSidebar
**File**: `src/it-app/app/(it-pages)/support-center/requests/(details)/[id]/_components/user-info-sidebar.tsx`

**Changes**:
- Removed manual `fetch()` call in `useEffect`
- Removed `userStatus` state and `fetchStatus` function
- Replaced with `useUserStatus` hook

**Code Reduction**: Removed ~30 lines of manual fetching/polling logic

#### 2.4 Updated SubTasksPanel
**File**: `src/it-app/app/(it-pages)/support-center/requests/(details)/[id]/_components/sub-tasks-panel.tsx`

**Changes**:
- Removed manual `fetch()` calls for tasks and stats
- Removed `subTasksData`, `stats` state variables
- Removed entire `useEffect` for fetching (lines 74-117)
- Removed manual `refreshSubTasks` function
- Replaced with `useSubTasks` hook

**Code Reduction**: Removed ~50 lines of manual fetching/polling logic

## Expected Outcome

### Before Fix
```
GET /api/requests/{id}/sub-tasks?skip=0&limit=20 - 4 calls (284ms, 33ms, 23ms, 27ms)
GET /api/users/{id}/status - 4 calls (157ms, 28ms, 23ms, 23ms)
```

### After Fix
```
GET /api/requests/{id}/sub-tasks?skip=0&limit=20 - 0 calls (uses SSR initial data)
GET /api/users/{id}/status - 1 call (SWR deduplication)
```

**Performance Improvement**:
- Sub-tasks: 4 → 0 calls (-100%, uses SSR data)
- User status: 4 → 1 call (-75%)
- **Total network requests reduced by 87.5%**

## Files Modified

1. ✅ `src/it-app/app/(it-pages)/support-center/requests/(details)/[id]/_context/request-detail-context.tsx`
2. ✅ `src/it-app/app/(it-pages)/support-center/requests/(details)/[id]/_context/request-detail-metadata-context.tsx`
3. ✅ `src/it-app/app/(it-pages)/support-center/requests/(details)/[id]/_components/user-info-sidebar.tsx`
4. ✅ `src/it-app/app/(it-pages)/support-center/requests/(details)/[id]/_components/sub-tasks-panel.tsx`

## Files Created

5. ✅ `src/it-app/lib/hooks/use-user-status.ts` (NEW)
6. ✅ `src/it-app/lib/hooks/use-sub-tasks.ts` (NEW)

## Verification Steps

1. **Navigate to a request details page:**
   ```
   http://localhost:3010/support-center/requests/{any-request-id}
   ```

2. **Open browser DevTools Network tab** and filter for:
   - `sub-tasks`
   - `status`

3. **Verify call counts:**
   - Sub-tasks: Should see **0 API calls** (uses initial SSR data)
   - User status: Should see exactly **1 call**

4. **Test auto-refresh:**
   - Wait 30 seconds
   - Should see exactly **1 new call** to `/api/users/{id}/status`
   - No new calls to sub-tasks

5. **Test mobile responsiveness:**
   - Resize browser to mobile width
   - Open user info sidebar (should trigger sheet)
   - Verify no duplicate status calls

6. **Test with React DevTools Profiler:**
   - Record page load
   - Verify no excessive re-renders in `RequestDetailProvider` or child components

## Benefits

1. **Performance**: 87.5% reduction in duplicate API calls
2. **Code Quality**: Removed ~80 lines of manual fetching/polling logic
3. **Maintainability**: Centralized data fetching in reusable hooks
4. **User Experience**: Faster page loads, reduced bandwidth usage
5. **Developer Experience**: Consistent SWR pattern across codebase

## Notes

- SWR is already installed and used throughout the app
- This aligns with the project's documented SWR migration pattern (`docs/SWR_MIGRATION_AND_STATE_MANAGEMENT_GUIDE.md`)
- The fix addresses the comment in `use-request-details-page.ts`: "SIMPLIFIED: No SWR - uses simple state" by re-introducing SWR where it matters most
- Changes are backward compatible - no API changes required
