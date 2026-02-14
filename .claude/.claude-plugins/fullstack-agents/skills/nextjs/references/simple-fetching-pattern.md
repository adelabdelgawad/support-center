# Simple Fetching Pattern (Strategy A)

Default data fetching pattern using React state. No automatic revalidation.

## When to Use

Use this pattern when:
- Data only changes via user actions
- Settings/configuration pages
- Admin CRUD tables
- Forms and profile pages
- Single-user workflows

**Key principle:** The UI updates from server responses to mutations, not from polling or background refetch.

## Pattern Overview

```
page.tsx (Server Component)
├── Fetch initial data via server action
├── Pass initialData to client component
└── No "use client" directive

table.tsx (Client Component)
├── useState for local data management
├── updateItems() from server responses
├── Manual refresh function (optional)
└── No SWR dependency
```

## Complete Table Component Example

```tsx
// _components/table/items-table.tsx
"use client";

import { useState, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryState, parseAsInteger } from "nuqs";
import { fetchClient } from "@/lib/fetch/client";
import { DataTable } from "@/components/data-table";
import { ItemsActionsProvider } from "../../context/items-actions-context";
import { ItemsTableBody } from "./items-table-body";
import type { ItemsResponse, Item, CreateItemData } from "@/types/items";

interface ItemsTableProps {
  initialData: ItemsResponse | null;
}

interface ActionResult {
  success: boolean;
  message?: string;
  error?: string;
  data?: Item;
}

export default function ItemsTable({ initialData }: ItemsTableProps) {
  // URL state management
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));
  const [limit] = useQueryState("limit", parseAsInteger.withDefault(10));
  const searchParams = useSearchParams();
  const search = searchParams?.get("search") || "";
  const status = searchParams?.get("is_active") || "";

  // Local state (no SWR)
  const [data, setData] = useState<ItemsResponse | null>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());

  // Build API URL from params
  const apiUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.append("skip", ((page - 1) * limit).toString());
    params.append("limit", limit.toString());
    if (search) params.append("search", search);
    if (status) params.append("is_active", status);
    return `/api/setting/items?${params.toString()}`;
  }, [page, limit, search, status]);

  // Manual refresh function
  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: fresh } = await fetchClient.get<ItemsResponse>(apiUrl);
      setData(fresh);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl]);

  // Update items from server response
  const updateItems = useCallback((serverResponse: Item[]) => {
    setData(current => {
      if (!current) return current;

      const responseMap = new Map(serverResponse.map(i => [i.id, i]));
      const updatedList = current.items.map(item =>
        responseMap.has(item.id) ? responseMap.get(item.id)! : item
      );

      // Recalculate counts
      const activeCount = updatedList.filter(i => i.is_active).length;
      const inactiveCount = updatedList.filter(i => !i.is_active).length;

      return {
        ...current,
        items: updatedList,
        active_count: activeCount,
        inactive_count: inactiveCount,
      };
    });
  }, []);

  // Add new item to list
  const addItem = useCallback((newItem: Item) => {
    setData(current => {
      if (!current) return current;
      return {
        ...current,
        items: [newItem, ...current.items],
        total: current.total + 1,
        active_count: newItem.is_active
          ? current.active_count + 1
          : current.active_count,
        inactive_count: !newItem.is_active
          ? current.inactive_count + 1
          : current.inactive_count,
      };
    });
  }, []);

  // Remove item from list
  const removeItem = useCallback((id: string) => {
    setData(current => {
      if (!current) return current;
      const item = current.items.find(i => i.id === id);
      return {
        ...current,
        items: current.items.filter(i => i.id !== id),
        total: current.total - 1,
        active_count: item?.is_active
          ? current.active_count - 1
          : current.active_count,
        inactive_count: !item?.is_active
          ? current.inactive_count - 1
          : current.inactive_count,
      };
    });
  }, []);

  // Toggle status action
  const onToggleStatus = useCallback(
    async (id: string, isActive: boolean): Promise<ActionResult> => {
      setUpdatingIds(prev => new Set(prev).add(id));
      try {
        const { data: updated } = await fetchClient.put<Item>(
          `/api/setting/items/${id}/status`,
          { is_active: isActive }
        );
        updateItems([updated]);
        return {
          success: true,
          message: `Item ${isActive ? "enabled" : "disabled"}`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to update status",
        };
      } finally {
        setUpdatingIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [updateItems]
  );

  // Update action
  const onUpdate = useCallback(
    async (id: string, payload: Partial<Item>): Promise<ActionResult> => {
      setUpdatingIds(prev => new Set(prev).add(id));
      try {
        const { data: updated } = await fetchClient.put<Item>(
          `/api/setting/items/${id}`,
          payload
        );
        updateItems([updated]);
        return { success: true, data: updated };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to update",
        };
      } finally {
        setUpdatingIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [updateItems]
  );

  // Create action
  const onCreate = useCallback(
    async (payload: CreateItemData): Promise<ActionResult> => {
      try {
        const { data: created } = await fetchClient.post<Item>(
          `/api/setting/items`,
          payload
        );
        addItem(created);
        return { success: true, data: created };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to create",
        };
      }
    },
    [addItem]
  );

  // Delete action
  const onDelete = useCallback(
    async (id: string): Promise<ActionResult> => {
      setUpdatingIds(prev => new Set(prev).add(id));
      try {
        await fetchClient.delete(`/api/setting/items/${id}`);
        removeItem(id);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to delete",
        };
      } finally {
        setUpdatingIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [removeItem]
  );

  // Bulk status update
  const onBulkUpdateStatus = useCallback(
    async (ids: string[], isActive: boolean): Promise<ActionResult> => {
      ids.forEach(id => setUpdatingIds(prev => new Set(prev).add(id)));
      try {
        const { data: updated } = await fetchClient.post<Item[]>(
          `/api/setting/items/status`,
          { ids, is_active: isActive }
        );
        updateItems(updated);
        return {
          success: true,
          message: `${ids.length} items ${isActive ? "enabled" : "disabled"}`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to update",
        };
      } finally {
        ids.forEach(id =>
          setUpdatingIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          })
        );
      }
    },
    [updateItems]
  );

  // Actions object for context
  const actions = useMemo(
    () => ({
      onToggleStatus,
      onUpdate,
      onCreate,
      onDelete,
      onBulkUpdateStatus,
      onRefresh: refresh,
      updateItems,
    }),
    [onToggleStatus, onUpdate, onCreate, onDelete, onBulkUpdateStatus, refresh, updateItems]
  );

  // Error state
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
    <ItemsActionsProvider actions={actions}>
      <ItemsTableBody
        data={data}
        isLoading={isLoading}
        updatingIds={updatingIds}
        page={page}
        limit={limit}
        onPageChange={setPage}
      />
    </ItemsActionsProvider>
  );
}
```

## Context Pattern for Simple Fetching

```tsx
// context/items-actions-context.tsx
"use client";

import { createContext, useContext, ReactNode } from "react";
import type { Item, CreateItemData } from "@/types/items";

interface ActionResult {
  success: boolean;
  message?: string;
  error?: string;
  data?: Item;
}

interface ItemsActionsContextType {
  onToggleStatus: (id: string, isActive: boolean) => Promise<ActionResult>;
  onUpdate: (id: string, payload: Partial<Item>) => Promise<ActionResult>;
  onCreate: (payload: CreateItemData) => Promise<ActionResult>;
  onDelete: (id: string) => Promise<ActionResult>;
  onBulkUpdateStatus: (ids: string[], isActive: boolean) => Promise<ActionResult>;
  onRefresh: () => Promise<void>;
  updateItems: (items: Item[]) => void;
}

const ItemsActionsContext = createContext<ItemsActionsContextType | null>(null);

interface ProviderProps {
  children: ReactNode;
  actions: ItemsActionsContextType;
}

export function ItemsActionsProvider({ children, actions }: ProviderProps) {
  return (
    <ItemsActionsContext.Provider value={actions}>
      {children}
    </ItemsActionsContext.Provider>
  );
}

export function useItemsActions() {
  const context = useContext(ItemsActionsContext);
  if (!context) {
    throw new Error("useItemsActions must be used within ItemsActionsProvider");
  }
  return context;
}
```

## Page Component (Server)

```tsx
// page.tsx
import { auth } from "@/lib/auth/server-auth";
import { getItems } from "@/lib/actions/items.actions";
import { redirect } from "next/navigation";
import ItemsTable from "./_components/table/items-table";

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{
    is_active?: string;
    search?: string;
    page?: string;
    limit?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.accessToken) redirect("/login");

  const params = await searchParams;
  const pageNumber = Number(params.page) || 1;
  const limitNumber = Number(params.limit) || 10;
  const skip = (pageNumber - 1) * limitNumber;

  const data = await getItems(limitNumber, skip, {
    is_active: params.is_active,
    search: params.search,
  });

  return <ItemsTable initialData={data} />;
}
```

## Key Differences from SWR Pattern

| Aspect | Simple (Strategy A) | SWR (Strategy B) |
|--------|---------------------|------------------|
| Import | `useState` from React | `useSWR` from swr |
| Initial state | `useState(initialData)` | `useSWR({ fallbackData })` |
| Update function | `setData(...)` | `mutate(...)` |
| Auto refresh | No | Configurable |
| Caching | Manual (component state) | Built-in |
| Deduplication | None | Built-in |
| Loading state | Manual `isLoading` state | `isLoading` from hook |
| Error state | Manual `error` state | `error` from hook |

## When URL Params Change

With Strategy A, you need to manually refetch when URL parameters change:

```tsx
import { useEffect } from "react";

// Refetch when URL params change (pagination, filters)
useEffect(() => {
  refresh();
}, [apiUrl]); // Only if you want auto-refetch on URL change
```

Or let the page component handle it via SSR (recommended):
- When URL changes, Next.js re-renders the server component
- Server fetches new data
- Client receives new `initialData` prop
- State resets to new data

## Checklist

- [ ] No SWR import or dependency
- [ ] `useState` for data management
- [ ] `updateItems()` uses server response
- [ ] `addItem()` adds to local state
- [ ] `removeItem()` removes from local state
- [ ] Manual `refresh()` function available
- [ ] Loading state tracked manually
- [ ] Error state tracked manually
