# Plan: Simplify Pages & Standardize Data Fetching

## Summary

Remove `useSWR` from all pages **except** `support-center/requests` and `management/scheduler`. Replace with a lightweight `useAsyncData` hook (useState + fetch). Mutations update UI directly from backend responses.

---

## Pre-Work: Create Shared `useAsyncData` Hook

**New file:** `src/it-app/lib/hooks/use-async-data.ts`

A minimal hook replacing SWR for non-polling pages:
- Accepts: fetch function, dependency array, optional initialData
- Returns: `{ data, isLoading, error, refetch }`
- No polling, no revalidation, no cache sharing

---

## Phase 1: Reports Pages (7 files, lowest risk)

Replace SWR with `useAsyncData`. These pages use SWR purely as a fetcher with filter-driven re-fetch. No cross-page dependencies.

| File | Change |
|------|--------|
| `reports/_components/reports-dashboard-client.tsx` | useSWR → useAsyncData |
| `reports/sla/_components/sla-report-client.tsx` | useSWR → useAsyncData |
| `reports/volume/_components/volume-report-client.tsx` | useSWR → useAsyncData |
| `reports/agents/_components/agent-performance-client.tsx` | useSWR → useAsyncData |
| `reports/operations/_components/operations-dashboard-client.tsx` | useSWR → useAsyncData |
| `reports/outshift/_components/outshift-report-client.tsx` | useSWR → useAsyncData |
| `reports/saved/_components/saved-reports-client.tsx` | useSWR → useAsyncData + remove 60s polling. After create/update/delete: update state from backend response |

---

## Phase 2: Admin Pages (3 files)

| File | Change |
|------|--------|
| `management/active-sessions/_components/active-sessions-table.tsx` | useSWR → useAsyncData. Re-fetch on filter/page change via deps. Manual refresh calls `refetch()`. After actions, update state from response |
| Categories table (via its actions context) | useSWR → useAsyncData. After CRUD, update state from response |
| Roles table (via its actions context) | useSWR → useAsyncData. After CRUD, update state from response |

---

## Phase 3: Request Details Hooks (4 files)

| File | Change |
|------|--------|
| `lib/hooks/use-request-notes.ts` | useSWR → useState. `addNote` appends from response. Initial data from props |
| `lib/hooks/use-sub-tasks.ts` | useSWR → useAsyncData. Fetch on mount, `refetch()` after mutations |
| `lib/hooks/use-user-status.ts` | useSWR → useState + setInterval (keep 30s polling for online status) |
| `requests/[id]/_context/request-detail-metadata-context.tsx` | **Keep** `import { mutate } from 'swr'` for global invalidation of requests-list cache keys only. Remove all other SWR consumption (notes/sub-tasks will use refactored non-SWR hooks) |

**Critical:** Global `mutate()` from SWR must remain in `request-detail-metadata-context.tsx` to invalidate the requests-list SWR cache after assignee/status changes. This is the only cross-page SWR dependency.

---

## Phase 4: Global Metadata & User Hooks (4 files)

| File | Change |
|------|--------|
| `lib/hooks/use-global-metadata.ts` | 3 useSWR hooks → useAsyncData. Fetch once on mount with initialData. `useRefreshGlobalMetadata` becomes a no-op or simple refetch |
| `lib/hooks/use-categories-tags.ts` | useSWR → useAsyncData |
| `hooks/use-roles.tsx` | useSWR → useAsyncData. Used in add/edit user sheets |
| `hooks/use-domain-users.tsx` | useSWR → useAsyncData. Keep existing LRU cache logic (independent of SWR) |

---

## Phase 5: Adjust Allowed SWR Pages

### A. `support-center/requests` — Change to 60s revalidation

Currently no fixed interval. Add `refreshInterval: 60000` to:
- `lib/hooks/use-requests-list.ts`
- `lib/hooks/use-view-counts.ts`
- `lib/hooks/use-business-unit-counts.ts`
- `lib/hooks/use-ticket-type-counts.ts`

Ensure `keepPreviousData: true` to avoid flicker.

### B. `management/scheduler` — Adjust polling intervals

Current: 3s when running, 0 otherwise. Status: 30s.

Change to:
- Jobs: `refreshInterval` → 60s default, 10s when any job is `running`
- Status: keep 30s (or align to 60s)
- Ensure no loading indicators/skeletons during revalidation (`isValidating` should not trigger UI changes)

---

## Phase 6: Cleanup

1. Remove unused entries from `lib/swr/cache-keys.ts` (keep only keys for requests-list and scheduler)
2. Audit: `grep -r "useSWR" src/it-app/` should only match files in requests-list hooks, scheduler-content, and the global mutate import in request-detail-metadata-context
3. Optionally add ESLint restrict-imports rule for `swr` to flag unauthorized usage

---

## Action → UI Update Contract

All mutations must follow this pattern:

| Action | UI Update |
|--------|-----------|
| **Create** | Append returned record to local state |
| **Update** | Replace record in local state with response |
| **Status change** | Patch only that record from response |
| **Delete** | Remove by ID after backend confirms success |

Backend responses must return the updated entity. Frontend must **never** refetch entire lists after a single-record mutation (except the 2 allowed SWR pages where background revalidation acts as a safety net).

---

## Verification

1. **Functional**: Navigate every page, confirm data loads, perform CRUD operations, verify UI updates from responses
2. **No regressions**: No new loading flickers, no stale data on mutation
3. **Requests list**: Confirm 60s background refresh with no UI disruption
4. **Scheduler**: Confirm 60s default polling, 10s for running jobs, no skeletons
5. **grep audit**: `useSWR` only in allowed files

---

## Risk Mitigations

| Risk | Mitigation |
|------|------------|
| Stale data from reduced polling | Keep 60s polling on the 2 critical pages; other pages only show data from last action |
| Cross-page SWR invalidation breaks | Preserve global `mutate()` import in request-detail-metadata-context for requests-list cache |
| Backend responses missing updated entity | Audit backend endpoints before migrating each phase |
| UI desync after failed mutation | `useAsyncData` hook includes error state; failed mutations don't update local state |

---

## Rollback

Changes are behavioral, not destructive. Rollback any phase by reverting to SWR in affected files. No data migration required.
