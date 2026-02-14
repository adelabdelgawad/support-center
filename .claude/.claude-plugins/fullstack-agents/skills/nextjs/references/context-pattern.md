# Context Pattern Reference

React Context for passing actions to deeply nested table components.

## Key Principles

1. **Separate context file** - In `context/` directory
2. **Type-safe actions** - Define interface for all actions
3. **Error boundary** - Throw if used outside provider
4. **Defined in table component** - Actions created where SWR lives

## Basic Context Structure

```tsx
// app/(pages)/setting/items/context/items-actions-context.tsx
"use client";

import { createContext, useContext, ReactNode } from "react";

/**
 * Action result type - consistent return format
 */
interface ActionResult {
  success: boolean;
  message?: string;
  error?: string;
  data?: unknown;
}

/**
 * Context type with all available actions
 */
interface ItemsActionsContextType {
  // Single item status toggle
  onToggleStatus: (id: string, isActive: boolean) => Promise<ActionResult>;
  
  // Update item
  onUpdate: (id: string, data: Partial<Item>) => Promise<ActionResult>;
  
  // Bulk status update
  onBulkUpdateStatus: (ids: string[], isActive: boolean) => Promise<ActionResult>;
  
  // Refresh data
  onRefresh: () => Promise<ActionResult>;
  
  // Direct cache update (for custom operations)
  updateItems: (items: Item[]) => Promise<void>;
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

## Context Definition in Table Component

```tsx
// In items-table.tsx
"use client";

import { ItemsActionsProvider } from "../../context/items-actions-context";

function ItemsTable({ initialData }) {
  const { data, mutate } = useSWR(...);

  // Update function using server response
  const updateItems = async (serverResponse: Item[]) => {
    const currentData = data;
    if (!currentData) return;

    const responseMap = new Map(serverResponse.map(i => [i.id, i]));
    const updatedList = currentData.items.map(item =>
      responseMap.has(item.id) ? responseMap.get(item.id)! : item
    );

    await mutate({ ...currentData, items: updatedList }, { revalidate: false });
  };

  // Define all actions
  const actions = {
    onToggleStatus: async (id: string, isActive: boolean) => {
      try {
        const { data: updated } = await fetchClient.put<Item>(
          `/api/setting/items/${id}/status`,
          { is_active: isActive }
        );
        await updateItems([updated]);
        return { success: true, message: `Status updated` };
      } catch (error) {
        const err = error as ApiError;
        return { success: false, error: err.message || "Failed to update" };
      }
    },

    onUpdate: async (id: string, updateData: Partial<Item>) => {
      try {
        const { data: updated } = await fetchClient.put<Item>(
          `/api/setting/items/${id}`,
          updateData
        );
        await updateItems([updated]);
        return { success: true, message: "Updated", data: updated };
      } catch (error) {
        const err = error as ApiError;
        return { success: false, error: err.message || "Failed to update" };
      }
    },

    onBulkUpdateStatus: async (ids: string[], isActive: boolean) => {
      try {
        const { data: result } = await fetchClient.put<{ updatedItems: Item[] }>(
          `/api/setting/items/status`,
          { ids, is_active: isActive }
        );
        if (result.updatedItems?.length > 0) {
          await updateItems(result.updatedItems);
        }
        return { success: true, message: `Updated ${ids.length} items` };
      } catch (error) {
        const err = error as ApiError;
        return { success: false, error: err.message || "Failed to update" };
      }
    },

    onRefresh: async () => {
      await mutate();
      return { success: true, message: "Refreshed" };
    },

    updateItems,
  };

  return (
    <ItemsActionsProvider actions={actions}>
      {/* Table content */}
    </ItemsActionsProvider>
  );
}
```

## Using Context in Child Components

```tsx
// _components/actions/item-actions-menu.tsx
"use client";

import { useItemsActions } from "../../context/items-actions-context";
import { toast } from "sonner";

interface Props {
  item: Item;
}

export function ItemActionsMenu({ item }: Props) {
  const { onToggleStatus, onUpdate } = useItemsActions();

  const handleToggleStatus = async () => {
    const result = await onToggleStatus(item.id, !item.isActive);
    
    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.error);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={handleToggleStatus}>
          {item.isActive ? "Disable" : "Enable"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setEditOpen(true)}>
          Edit
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

## Bulk Actions with Context

```tsx
// _components/table/items-table-body.tsx
"use client";

import { useItemsActions } from "../../context/items-actions-context";

function ItemsTableBody({ items }) {
  const { onBulkUpdateStatus } = useItemsActions();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const handleBulkEnable = async () => {
    if (selectedIds.length === 0) return;
    
    const result = await onBulkUpdateStatus(selectedIds, true);
    
    if (result.success) {
      toast.success(result.message);
      setSelectedIds([]);
    } else {
      toast.error(result.error);
    }
  };

  const handleBulkDisable = async () => {
    if (selectedIds.length === 0) return;
    
    const result = await onBulkUpdateStatus(selectedIds, false);
    
    if (result.success) {
      toast.success(result.message);
      setSelectedIds([]);
    } else {
      toast.error(result.error);
    }
  };

  return (
    <div>
      {selectedIds.length > 0 && (
        <div className="flex gap-2 mb-4">
          <span>{selectedIds.length} selected</span>
          <Button onClick={handleBulkEnable}>Enable All</Button>
          <Button onClick={handleBulkDisable}>Disable All</Button>
        </div>
      )}
      {/* Table rows */}
    </div>
  );
}
```

## Extended Context with Create/Delete

```tsx
interface ItemsActionsContextType {
  // CRUD operations
  onCreate: (data: ItemCreate) => Promise<ActionResult>;
  onUpdate: (id: string, data: Partial<Item>) => Promise<ActionResult>;
  onDelete: (id: string) => Promise<ActionResult>;
  
  // Status operations
  onToggleStatus: (id: string, isActive: boolean) => Promise<ActionResult>;
  onBulkUpdateStatus: (ids: string[], isActive: boolean) => Promise<ActionResult>;
  
  // Cache operations
  updateItems: (items: Item[]) => Promise<void>;
  addItem: (item: Item) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  
  // Refresh
  onRefresh: () => Promise<ActionResult>;
}
```

## Type Definitions

```tsx
// types/items.d.ts

export interface Item {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ItemCreate {
  name: string;
}

export interface ItemsResponse {
  items: Item[];
  total: number;
  activeCount: number;
  inactiveCount: number;
}

export interface ItemsActionsContextType {
  onToggleStatus: (id: string, isActive: boolean) => Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }>;
  onUpdate: (id: string, data: Partial<Item>) => Promise<{
    success: boolean;
    message?: string;
    data?: Item;
    error?: string;
  }>;
  updateItems: (items: Item[]) => Promise<void>;
  onBulkUpdateStatus: (ids: string[], isActive: boolean) => Promise<{
    success: boolean;
    message?: string;
    data?: Item[];
    error?: string;
  }>;
  onRefresh: () => Promise<{
    success: boolean;
    message?: string;
  }>;
}
```

## Key Points

1. **Context in separate file** - Clean separation of concerns
2. **Type-safe interface** - Define all action signatures
3. **Actions defined in table** - Where SWR mutate lives
4. **Throw on missing provider** - Fail fast, clear errors
5. **Consistent return format** - success/error/message/data
6. **Toast notifications** - Handle in consuming components
