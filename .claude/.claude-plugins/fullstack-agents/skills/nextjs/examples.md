# Next.js Template Examples

Real-world examples for Next.js frontend patterns.

## Example 1: Server Component Page with SSR Data

```typescript
// app/(pages)/setting/users/page.tsx
import { auth } from "@/lib/auth/server-auth";
import { redirect } from "next/navigation";
import { getUsers } from "@/lib/actions/users.actions";
import UsersTable from "./_components/table/users-table";
import { UsersProvider } from "./_components/context/users-context";

interface PageProps {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    search?: string;
  }>;
}

export default async function UsersPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.accessToken) redirect("/login");

  const params = await searchParams;
  const page = Number(params.page) || 1;
  const limit = Number(params.limit) || 10;
  const search = params.search || "";

  // Server-side data fetching
  const initialData = await getUsers(limit, (page - 1) * limit, { search });

  return (
    <div className="container py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Users</h1>
      </div>
      
      <UsersProvider initialData={initialData}>
        <UsersTable />
      </UsersProvider>
    </div>
  );
}
```

## Example 2: Context Provider for Client State

```typescript
// app/(pages)/setting/users/_components/context/users-context.tsx
"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import useSWR, { mutate } from "swr";
import { fetchClient } from "@/lib/fetch/client";
import type { User, UsersResponse } from "@/types/users";

interface UsersContextType {
  users: User[];
  total: number;
  isLoading: boolean;
  error: Error | null;
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  refresh: () => void;
  page: number;
  setPage: (page: number) => void;
  limit: number;
  setLimit: (limit: number) => void;
  search: string;
  setSearch: (search: string) => void;
}

const UsersContext = createContext<UsersContextType | null>(null);

const fetcher = (url: string) => fetchClient.get<UsersResponse>(url).then(r => r.data);

interface UsersProviderProps {
  children: ReactNode;
  initialData: UsersResponse;
}

export function UsersProvider({ children, initialData }: UsersProviderProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState("");

  const queryParams = new URLSearchParams({
    limit: limit.toString(),
    skip: ((page - 1) * limit).toString(),
    ...(search && { search }),
  });

  const { data, error, isLoading } = useSWR(
    `/api/setting/users?${queryParams.toString()}`,
    fetcher,
    {
      fallbackData: initialData,
      revalidateOnFocus: false,
    }
  );

  const refresh = useCallback(() => {
    mutate(`/api/setting/users?${queryParams.toString()}`);
  }, [queryParams]);

  return (
    <UsersContext.Provider
      value={{
        users: data?.items || [],
        total: data?.total || 0,
        isLoading,
        error,
        selectedIds,
        setSelectedIds,
        refresh,
        page,
        setPage,
        limit,
        setLimit,
        search,
        setSearch,
      }}
    >
      {children}
    </UsersContext.Provider>
  );
}

export function useUsers() {
  const context = useContext(UsersContext);
  if (!context) {
    throw new Error("useUsers must be used within UsersProvider");
  }
  return context;
}
```

## Example 3: Data Table with Actions

```typescript
// app/(pages)/setting/users/_components/table/users-table.tsx
"use client";

import { useUsers } from "../context/users-context";
import { DataTable } from "@/components/ui/data-table";
import { columns } from "./columns";
import { UsersToolbar } from "./users-toolbar";
import { UsersPagination } from "./users-pagination";

export default function UsersTable() {
  const { users, isLoading, selectedIds, setSelectedIds } = useUsers();

  return (
    <div className="space-y-4">
      <UsersToolbar />
      
      <DataTable
        columns={columns}
        data={users}
        isLoading={isLoading}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
      />
      
      <UsersPagination />
    </div>
  );
}
```

## Example 4: Table Columns Definition

```typescript
// app/(pages)/setting/users/_components/table/columns.tsx
"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { UserActions } from "./user-actions";
import type { User } from "@/types/users";

export const columns: ColumnDef<User>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
      />
    ),
    enableSorting: false,
  },
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <div className="font-medium">{row.getValue("name")}</div>
    ),
  },
  {
    accessorKey: "email",
    header: "Email",
  },
  {
    accessorKey: "role",
    header: "Role",
    cell: ({ row }) => (
      <Badge variant="outline">{row.getValue("role")}</Badge>
    ),
  },
  {
    accessorKey: "is_active",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant={row.getValue("is_active") ? "success" : "secondary"}>
        {row.getValue("is_active") ? "Active" : "Inactive"}
      </Badge>
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => <UserActions user={row.original} />,
  },
];
```

## Example 5: Row Actions Component

```typescript
// app/(pages)/setting/users/_components/table/user-actions.tsx
"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Trash, Power } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useUsers } from "../context/users-context";
import { deleteUser, toggleUserStatus } from "@/lib/actions/users.actions";
import { toast } from "sonner";
import type { User } from "@/types/users";

interface UserActionsProps {
  user: User;
}

export function UserActions({ user }: UserActionsProps) {
  const { refresh } = useUsers();
  const [isLoading, setIsLoading] = useState(false);

  const handleToggleStatus = async () => {
    setIsLoading(true);
    const result = await toggleUserStatus(user.id, !user.is_active);
    setIsLoading(false);
    
    if (result.success) {
      toast.success(`User ${user.is_active ? 'deactivated' : 'activated'}`);
      refresh();
    } else {
      toast.error(result.error);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete ${user.name}?`)) return;
    
    setIsLoading(true);
    const result = await deleteUser(user.id);
    setIsLoading(false);
    
    if (result.success) {
      toast.success("User deleted");
      refresh();
    } else {
      toast.error(result.error);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" disabled={isLoading}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem>
          <Pencil className="mr-2 h-4 w-4" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleToggleStatus}>
          <Power className="mr-2 h-4 w-4" />
          {user.is_active ? "Deactivate" : "Activate"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleDelete} className="text-destructive">
          <Trash className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

## Example 6: Toolbar with Search and Filters

```typescript
// app/(pages)/setting/users/_components/table/users-toolbar.tsx
"use client";

import { useState } from "react";
import { Search, Plus, Trash } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useUsers } from "../context/users-context";
import { useDebounce } from "@/hooks/use-debounce";

export function UsersToolbar() {
  const { search, setSearch, selectedIds, setSelectedIds, refresh } = useUsers();
  const [localSearch, setLocalSearch] = useState(search);
  
  useDebounce(() => {
    setSearch(localSearch);
  }, 300, [localSearch]);

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedIds.length} users?`)) return;
    // Implement bulk delete
    setSelectedIds([]);
    refresh();
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="pl-8 w-[250px]"
          />
        </div>
        
        {selectedIds.length > 0 && (
          <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
            <Trash className="mr-2 h-4 w-4" />
            Delete ({selectedIds.length})
          </Button>
        )}
      </div>
      
      <Button>
        <Plus className="mr-2 h-4 w-4" />
        Add User
      </Button>
    </div>
  );
}
```

## Example 7: Pagination Component

```typescript
// app/(pages)/setting/users/_components/table/users-pagination.tsx
"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUsers } from "../context/users-context";

export function UsersPagination() {
  const { page, setPage, limit, setLimit, total } = useUsers();
  
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="flex items-center justify-between">
      <div className="text-sm text-muted-foreground">
        Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total}
      </div>
      
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm">Rows per page</span>
          <Select
            value={limit.toString()}
            onValueChange={(value) => {
              setLimit(Number(value));
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[70px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50, 100].map((size) => (
                <SelectItem key={size} value={size.toString()}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPage(page - 1)}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-2 text-sm">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPage(page + 1)}
            disabled={page >= totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
```

## Directory Structure

```
app/
├── (pages)/
│   └── setting/
│       └── users/
│           ├── page.tsx                    # Server component (SSR)
│           ├── loading.tsx                 # Loading UI
│           ├── error.tsx                   # Error boundary
│           └── _components/
│               ├── context/
│               │   └── users-context.tsx   # Client state
│               └── table/
│                   ├── users-table.tsx     # Main table
│                   ├── columns.tsx         # Column definitions
│                   ├── user-actions.tsx    # Row actions
│                   ├── users-toolbar.tsx   # Search & filters
│                   └── users-pagination.tsx
├── api/
│   └── setting/
│       └── users/
│           ├── route.ts                    # GET, POST
│           └── [userId]/
│               └── route.ts                # GET, PUT, DELETE
└── lib/
    ├── actions/
    │   └── users.actions.ts                # Server actions
    └── fetch/
        ├── client.ts
        ├── server.ts
        └── api-route-helper.ts
```
