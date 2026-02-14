# SWR Fetching Pattern (Strategy B)

Data fetching pattern using SWR with automatic revalidation. **Requires documented justification.**

## When to Use

Use this pattern **only** when data changes from external sources:

- Dashboard data updated by background jobs
- Multi-user concurrent editing
- Real-time monitoring views
- Notification/activity feeds
- Shared reference data modified elsewhere

**Key principle:** Use SWR when data changes independently of the current user's actions.

## Justification Requirement

When using SWR, **always include a justification comment** explaining:
1. **Why** revalidation is needed
2. **What** triggers the revalidation
3. **When** revalidation should occur

### Justification Comment Template

```tsx
/**
 * SWR JUSTIFICATION:
 * - Reason: [Why data changes without user action]
 * - Trigger: [Interval / Focus / Reconnect / Manual]
 * - Interval: [N seconds, if applicable]
 */
```

### Example Justifications

```tsx
/**
 * SWR JUSTIFICATION:
 * - Reason: Dashboard stats updated by background analytics job
 * - Trigger: Interval-based polling
 * - Interval: 30 seconds
 */

/**
 * SWR JUSTIFICATION:
 * - Reason: Multiple admins may edit products concurrently
 * - Trigger: Focus-based revalidation
 * - Interval: N/A
 */

/**
 * SWR JUSTIFICATION:
 * - Reason: Job queue status changes from worker processes
 * - Trigger: Interval + Focus
 * - Interval: 10 seconds
 */
```

## Configuration Presets

### Preset: Dashboard (Live Updates)

For dashboards that need periodic refresh:

```tsx
/**
 * SWR JUSTIFICATION:
 * - Reason: Dashboard metrics updated by background jobs
 * - Trigger: Interval-based polling
 * - Interval: 30 seconds
 */
const { data, mutate, isLoading } = useSWR<DashboardData>(
  apiUrl,
  fetcher,
  {
    fallbackData: initialData,
    refreshInterval: 30000,        // Poll every 30 seconds
    revalidateOnFocus: true,       // Refetch on tab focus
    revalidateOnReconnect: true,   // Refetch on network reconnect
  }
);
```

### Preset: Multi-User Editing

For pages where multiple users may edit same data:

```tsx
/**
 * SWR JUSTIFICATION:
 * - Reason: Multiple users may edit concurrently
 * - Trigger: Focus-based revalidation
 * - Interval: N/A
 */
const { data, mutate, isLoading } = useSWR<ItemsResponse>(
  apiUrl,
  fetcher,
  {
    fallbackData: initialData,
    revalidateOnMount: false,      // Trust SSR data initially
    revalidateOnFocus: true,       // Refetch when tab regains focus
    revalidateOnReconnect: true,   // Refetch on network reconnect
    revalidateIfStale: true,       // Revalidate if data is stale
  }
);
```

### Preset: Reference Data (Stale-While-Revalidate)

For shared lookup data that may be updated elsewhere:

```tsx
/**
 * SWR JUSTIFICATION:
 * - Reason: Reference data may be updated by other admins
 * - Trigger: Background revalidation when stale
 * - Interval: N/A (dedupe for 60s)
 */
const { data, mutate } = useSWR<CategoriesResponse>(
  apiUrl,
  fetcher,
  {
    fallbackData: initialData,
    revalidateOnMount: false,
    revalidateIfStale: true,
    revalidateOnFocus: false,      // Don't refetch on every focus
    dedupingInterval: 60000,       // Dedupe requests for 1 minute
  }
);
```

### Preset: Manual Refresh Only

When you want SWR caching but only manual refresh:

```tsx
/**
 * SWR JUSTIFICATION:
 * - Reason: Benefit from SWR caching, but no auto-refresh needed
 * - Trigger: Manual only
 * - Interval: N/A
 */
const { data, mutate } = useSWR<ItemsResponse>(
  apiUrl,
  fetcher,
  {
    fallbackData: initialData,
    revalidateOnMount: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
  }
);

// Manual refresh via mutate()
const refresh = () => mutate();
```

## Complete Table Component Example

```tsx
// _components/table/dashboard-table.tsx
"use client";

import { useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryState, parseAsInteger } from "nuqs";
import useSWR from "swr";
import { fetchClient } from "@/lib/fetch/client";
import { DashboardActionsProvider } from "../../context/dashboard-actions-context";
import { DashboardTableBody } from "./dashboard-table-body";
import type { DashboardResponse, DashboardItem } from "@/types/dashboard";

const fetcher = (url: string) => fetchClient.get<DashboardResponse>(url).then(r => r.data);

interface DashboardTableProps {
  initialData: DashboardResponse | null;
}

export default function DashboardTable({ initialData }: DashboardTableProps) {
  // URL state management
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));
  const [limit] = useQueryState("limit", parseAsInteger.withDefault(10));
  const searchParams = useSearchParams();
  const search = searchParams?.get("search") || "";

  // Build API URL
  const apiUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.append("skip", ((page - 1) * limit).toString());
    params.append("limit", limit.toString());
    if (search) params.append("search", search);
    return `/api/dashboard/items?${params.toString()}`;
  }, [page, limit, search]);

  /**
   * SWR JUSTIFICATION:
   * - Reason: Dashboard data updated by background analytics job
   * - Trigger: Interval-based polling + focus
   * - Interval: 30 seconds
   */
  const { data, mutate, isLoading, error } = useSWR<DashboardResponse>(
    apiUrl,
    fetcher,
    {
      fallbackData: initialData ?? undefined,
      refreshInterval: 30000,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      keepPreviousData: true,
    }
  );

  // Update items from server response (for mutations)
  const updateItems = useCallback(
    async (serverResponse: DashboardItem[]) => {
      if (!data) return;

      const responseMap = new Map(serverResponse.map(i => [i.id, i]));
      const updatedList = data.items.map(item =>
        responseMap.has(item.id) ? responseMap.get(item.id)! : item
      );

      await mutate(
        { ...data, items: updatedList },
        { revalidate: false }
      );
    },
    [data, mutate]
  );

  // Manual refresh
  const refresh = useCallback(() => mutate(), [mutate]);

  // Actions
  const actions = useMemo(
    () => ({
      onUpdate: async (id: string, payload: Partial<DashboardItem>) => {
        try {
          const { data: updated } = await fetchClient.put<DashboardItem>(
            `/api/dashboard/items/${id}`,
            payload
          );
          await updateItems([updated]);
          return { success: true, data: updated };
        } catch (error) {
          return { success: false, error: "Failed to update" };
        }
      },
      onRefresh: refresh,
      updateItems,
    }),
    [updateItems, refresh]
  );

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="text-destructive mb-4">Failed to load data</p>
        <button onClick={refresh} className="text-primary hover:underline">
          Try again
        </button>
      </div>
    );
  }

  return (
    <DashboardActionsProvider actions={actions}>
      <DashboardTableBody
        data={data}
        isLoading={isLoading}
        page={page}
        limit={limit}
        onPageChange={setPage}
      />
    </DashboardActionsProvider>
  );
}
```

## SWR Configuration Reference

| Option | Type | Description |
|--------|------|-------------|
| `fallbackData` | `T` | Initial data from SSR |
| `revalidateOnMount` | `boolean` | Refetch when component mounts |
| `revalidateOnFocus` | `boolean` | Refetch when window gains focus |
| `revalidateOnReconnect` | `boolean` | Refetch when network reconnects |
| `revalidateIfStale` | `boolean` | Refetch if data is stale |
| `refreshInterval` | `number` | Polling interval in ms (0 = disabled) |
| `dedupingInterval` | `number` | Dedupe requests within interval |
| `keepPreviousData` | `boolean` | Keep previous data during revalidation |

## Server Response Updates (Not Optimistic)

Even with SWR, always use server response for cache updates:

```tsx
// CORRECT: Use server response
const onUpdate = async (id: string, payload: Partial<Item>) => {
  const { data: updated } = await fetchClient.put(`/api/items/${id}`, payload);
  await updateItems([updated]); // Server response updates cache
};

// WRONG: Optimistic update
const onUpdate = async (id: string, payload: Partial<Item>) => {
  // Don't update cache with local changes before server confirms!
  await mutate(
    { ...data, items: data.items.map(i => i.id === id ? { ...i, ...payload } : i) },
    { revalidate: false }
  );
  await fetchClient.put(`/api/items/${id}`, payload);
};
```

## Checklist

- [ ] Justification comment included with Reason, Trigger, Interval
- [ ] Configuration matches the justification
- [ ] `fallbackData` uses SSR initial data
- [ ] `updateItems()` uses server response (not optimistic)
- [ ] Appropriate revalidation triggers configured
- [ ] `keepPreviousData: true` for smooth pagination
