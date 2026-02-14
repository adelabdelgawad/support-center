# Next.js Template Skill

Generate production-ready Next.js pages with SSR initial load, flexible client-side data management, and server-response-based updates.

## When to Use This Skill

Use this skill when asked to:
- Create a new Next.js page with data table
- Add CRUD functionality to a Next.js application
- Generate pages with server-side rendering and client-side updates
- Build admin/settings pages with filtering, pagination, and bulk actions

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser Request                           │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  page.tsx (Server Component)                                 │
│  • auth() check                                              │
│  • await searchParams (Next.js 15+)                          │
│  • Fetch initial data via server actions                     │
│  • Pass initialData to client component                      │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  *-table.tsx (Client Component)                              │
│  • useSWR with fallbackData: initialData                     │
│  • Context Provider for actions                              │
│  • updateItems() uses server response (NOT optimistic)       │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  API Routes (app/api/...)                                    │
│  • withAuth() wrapper                                        │
│  • Proxy to FastAPI backend                                  │
│  • backendGet/Post/Put/Delete helpers                        │
└─────────────────────────────────────────────────────────────┘
```

## File Structure

```
app/(pages)/setting/{entity}/
├── page.tsx                    # SSR page (server component)
├── context/
│   └── {entity}-actions-context.tsx  # Actions provider
└── _components/
    ├── actions/
    │   ├── add-{entity}-button.tsx
    │   └── {entity}-actions-menu.tsx
    ├── modal/
    │   ├── add-{entity}-sheet.tsx
    │   └── edit-{entity}-sheet.tsx
    ├── sidebar/
    │   └── status-panel.tsx
    └── table/
        ├── {entity}-table.tsx       # Main client component
        ├── {entity}-table-body.tsx
        └── {entity}-table-columns.tsx

app/api/setting/{entity}/
├── route.ts                    # GET (list), POST (create)
└── [{entityId}]/
    ├── route.ts                # GET, PUT, DELETE
    └── status/
        └── route.ts            # PUT (toggle status)

lib/
├── actions/
│   └── {entity}.actions.ts     # Server actions
└── fetch/
    ├── client.ts               # Client-side fetch
    ├── server.ts               # Server-side fetch
    └── api-route-helper.ts     # API route helpers

lib/
├── types/
│   └── api/
│       └── {entity}.ts         # TypeScript types
```

## Core Principles

### 1. Data Fetching Strategy

Choose the appropriate pattern based on requirements. See [references/data-fetching-strategy.md](references/data-fetching-strategy.md) for the decision framework.

**Server Component (page.tsx) - Same for both strategies:**
```tsx
// NO "use client" - this is a server component
import { auth } from "@/lib/auth/server-auth";
import { getItems } from "@/lib/actions/items.actions";
import { redirect } from "next/navigation";
import ItemsTable from "./_components/table/items-table";

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; limit?: string; search?: string }>;
}) {
  const session = await auth();
  if (!session?.accessToken) redirect("/login");

  const params = await searchParams;  // Next.js 15+ requires await
  const page = Number(params.page) || 1;
  const limit = Number(params.limit) || 10;

  const items = await getItems(limit, (page - 1) * limit, params);

  return <ItemsTable initialData={items} />;
}
```

**Strategy A: Simple Fetching (Default)**
```tsx
"use client";

import { useState } from "react";
import { fetchClient } from "@/lib/fetch/client";

function ItemsTable({ initialData }) {
  const [data, setData] = useState(initialData);

  // Update from server response
  const updateItems = (serverResponse: Item[]) => {
    setData(current => ({
      ...current,
      items: current.items.map(item => {
        const updated = serverResponse.find(i => i.id === item.id);
        return updated ?? item;
      }),
    }));
  };
  // ...
}
```
See [references/simple-fetching-pattern.md](references/simple-fetching-pattern.md).

**Strategy B: SWR Fetching (When Justified)**
```tsx
"use client";

import useSWR from "swr";
import { fetchClient } from "@/lib/fetch/client";

const fetcher = (url: string) => fetchClient.get(url).then(r => r.data);

function ItemsTable({ initialData }) {
  const searchParams = useSearchParams();
  const page = Number(searchParams?.get("page") || "1");

  /**
   * SWR JUSTIFICATION:
   * - Reason: [Document why revalidation needed]
   * - Trigger: [Interval / Focus / Manual]
   */
  const { data, mutate, isLoading } = useSWR(
    `/api/setting/items?page=${page}`,
    fetcher,
    {
      fallbackData: initialData,
      keepPreviousData: true,
      revalidateOnMount: false,
      revalidateOnFocus: false,  // Set true only if justified
    }
  );
  // ...
}
```
See [references/swr-fetching-pattern.md](references/swr-fetching-pattern.md).

### 2. Server Response Updates (NOT Optimistic)

```tsx
// ✅ CORRECT: Use server response to update cache
const updateItems = async (serverResponse: Item[]) => {
  const currentData = data;
  if (!currentData) return;

  const responseMap = new Map(serverResponse.map(i => [i.id, i]));
  
  const updatedList = currentData.items.map(item =>
    responseMap.has(item.id) ? responseMap.get(item.id)! : item
  );

  await mutate(
    { ...currentData, items: updatedList },
    { revalidate: false }
  );
};

// In action handler:
const { data: updatedItem } = await fetchClient.put(`/api/items/${id}`, payload);
await updateItems([updatedItem]);  // Use server response!
```

```tsx
// ❌ WRONG: Optimistic update
const updatedList = currentData.items.map(item =>
  item.id === id ? { ...item, ...localChanges } : item  // Don't do this!
);
```

### 3. Context Pattern for Actions

```tsx
// context/{entity}-actions-context.tsx
"use client";

import { createContext, useContext, ReactNode } from "react";

interface ActionsContextType {
  onToggleStatus: (id: string, isActive: boolean) => Promise<ActionResult>;
  onUpdate: (id: string, data: UpdateData) => Promise<ActionResult>;
  updateItems: (items: Item[]) => Promise<void>;
  onRefresh: () => Promise<void>;
}

const ActionsContext = createContext<ActionsContextType | null>(null);

export function ActionsProvider({ children, actions }: Props) {
  return (
    <ActionsContext.Provider value={actions}>
      {children}
    </ActionsContext.Provider>
  );
}

export function useTableActions() {
  const context = useContext(ActionsContext);
  if (!context) {
    throw new Error("useTableActions must be used within ActionsProvider");
  }
  return context;
}
```

### 4. API Route Pattern

```tsx
// app/api/setting/items/route.ts
import { NextRequest } from "next/server";
import { withAuth, backendGet, backendPost } from "@/lib/fetch/api-route-helper";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams.toString();
  return withAuth(token => backendGet(`/setting/items/?${params}`, token));
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  return withAuth(token => backendPost('/setting/items/', token, body));
}
```

## Generation Order

When creating a new entity page, generate files in this order:

1. **Types** (lib/types/api/{entity}.ts)
2. **Server Actions** (lib/actions/{entity}.actions.ts)
3. **API Routes** (app/api/setting/{entity}/...)
4. **Context** (app/(pages)/setting/{entity}/context/)
5. **Components** (app/(pages)/setting/{entity}/_components/)
6. **Page** (app/(pages)/setting/{entity}/page.tsx)

## Quick Reference

### Data Fetching Strategy
- **Strategy A (Default)**: `useState` + server response updates
- **Strategy B (Opt-in)**: `useSWR` with documented justification

### SWR Configuration (Strategy B only)
- `fallbackData` - SSR data for instant render
- `keepPreviousData: true` - Smooth pagination
- `revalidateOnMount: false` - Trust SSR data
- `revalidateOnFocus: false` - Set true only if justified

### Key Files
- `lib/fetch/client.ts` - Client-side API calls
- `lib/fetch/server.ts` - Server action API calls
- `lib/fetch/api-route-helper.ts` - API route wrappers

## References

See the `references/` directory for detailed patterns:
- `data-fetching-strategy.md` - Decision framework for choosing strategy
- `simple-fetching-pattern.md` - Strategy A implementation
- `swr-fetching-pattern.md` - Strategy B implementation
- `page-pattern.md` - SSR page structure
- `table-pattern.md` - Table component patterns
- `context-pattern.md` - Actions context
- `api-route-pattern.md` - API routes
- `fetch-pattern.md` - Fetch utilities
