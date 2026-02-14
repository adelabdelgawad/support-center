---
name: generate-nextjs-data-table
description: Generate Next.js data table page with full CRUD, filtering, sorting, and bulk actions. Use when user wants a management page with table.
tools: Read, Write, Edit, Bash, Glob, Grep
---

# Next.js Data Table Generation Agent

Generate complete data table pages with SSR, simplified mutation-driven state management (default), TanStack Table, CRUD operations, and bulk actions.

## When This Agent Activates

- User requests: "Create a data table for [entity]"
- User requests: "Generate management page for [entity]"
- User requests: "Add CRUD table for [entity]"
- Command: `/generate data-table [name]`

## Agent Lifecycle

### Phase 1: Project Detection

**Check for Next.js project with data-table component:**

```bash
# Check for Next.js
cat package.json 2>/dev/null | grep '"next"'

# Check for TanStack Table
cat package.json 2>/dev/null | grep '"@tanstack/react-table"'

# Check for existing data-table component
ls components/data-table/ 2>/dev/null
ls -la components/data-table/data-table.tsx 2>/dev/null

# Check for route factory
ls lib/fetch/route-factory.ts 2>/dev/null
```

**Decision Tree:**

```
IF no Next.js project:
    → Suggest: /scaffold nextjs

IF no data-table component:
    → "Data table component not found at components/data-table/"
    → "Would you like me to create the base data-table component first?"
    → Suggest: /scaffold frontend-module data-table

IF data-table exists:
    → Proceed to backend detection
```

**Check for corresponding backend:**

```bash
# Check if backend entity exists
ls ../backend/api/routers/setting/{entity}_router.py 2>/dev/null
grep "class {Entity}" ../backend/db/model.py 2>/dev/null

# Check for CRUD helpers
ls ../backend/api/crud/{entity}.py 2>/dev/null
```

### Phase 2: Style Analysis

**Analyze existing data table pages:**

```bash
# Find existing table pages
ls -d app/\(pages\)/setting/*/table/ 2>/dev/null | head -3
ls -d app/\(pages\)/setting/*/_components/table/ 2>/dev/null | head -3

# Check column patterns
grep -l "columnDef\|ColumnDef" app/\(pages\)/setting/*/_components/table/*columns*.tsx 2>/dev/null | head -3

# Check for context pattern
ls app/\(pages\)/setting/*/context/ 2>/dev/null | head -3

# Check for bulk actions
grep -l "bulkAction\|selectedRows" app/\(pages\)/setting/*/_components/*.tsx 2>/dev/null | head -3

# Check for server actions pattern
ls lib/actions/*.actions.ts 2>/dev/null | head -5

# Check for route factory usage
grep -l "createCollectionRoutes\|createResourceRoutes" app/api/setting/*/route.ts 2>/dev/null | head -5
```

### Phase 3: Interactive Dialogue

```markdown
## Data Table Configuration

I'll help you create a data table page for managing **{Entity}**.

### Required Information

**1. Entity Name**
What entity does this table manage?
- Format: plural (e.g., `products`, `categories`, `users`)
- Should match your API endpoint

**2. Table Columns**
What columns should be displayed?

Format: `column_name: type (features)`

Types: `string`, `number`, `date`, `boolean`, `enum`, `actions`

Features:
- `sortable` - Enable column sorting
- `filterable` - Enable column filtering
- `searchable` - Include in global search
- `hidden` - Hidden by default
- `sticky` - Sticky column (first/last)

Example:
```
id: number (hidden)
name_en: string (sortable, searchable)
name_ar: string (searchable)
price: number (sortable, filterable)
status: enum (filterable, options=[active, inactive, pending])
created_at: date (sortable)
actions: actions (view, edit, delete)
```

### Data Fetching Strategy

**The simplified mutation-driven pattern is the DEFAULT for this project.** SWR is only used when explicitly justified.

| Table Type | Strategy | Reason |
|------------|----------|--------|
| Settings/Config | A (Simple) [DEFAULT] | Single admin manages |
| Entity CRUD | A (Simple) [DEFAULT] | Mutation-driven |
| Order Management | A (Simple) [DEFAULT] | Actions drive changes |
| Live Dashboard | B (SWR) | Background job updates |
| Multi-User Queue | B (SWR) | Concurrent editing |

**Select strategy:**
- [x] **Strategy A: Simplified Mutation-Driven** [DEFAULT]
  - `useState(initialData)` + `useEffect` sync from SSR
  - `router.refresh()` for add operations
  - Direct state updates from backend responses for edits
  - No SWR dependency, no polling, no automatic refetch
  - Lower complexity, easier to maintain

- [ ] **Strategy B: SWR Fetching** (requires justification)
  - Justification: ___________
  - Revalidation trigger: ___________

### Detected from Backend

{If backend entity exists, show detected fields}

| Field | Type | Suggested Features |
|-------|------|-------------------|
| id | int | hidden |
| name_en | string | sortable, searchable |
| ... | ... | ... |

### Features

**Row Actions** (actions column):
- [ ] View details (read-only sheet)
- [ ] Edit (opens sheet/modal)
- [ ] Delete (with confirmation)
- [ ] Custom action: ___________

**Bulk Actions** (select multiple rows):
- [ ] Bulk delete
- [ ] Bulk export (CSV)
- [ ] Bulk status change
- [ ] Custom bulk action: ___________

**Table Features**:
- [ ] Global search
- [ ] Column visibility toggle
- [ ] Pagination (page size options: 10, 25, 50, 100)
- [ ] URL-based state (search params)
- [ ] Row selection
- [ ] Status badge filter (active/inactive counts)
```

### Phase 4: CRUD Operations

```markdown
### CRUD Operations

**Create (Add New)**:
- [ ] Sheet (slides from right) [recommended]
- [ ] Modal (center dialog)
- [ ] Separate page

**Edit**:
- [ ] Sheet (slides from right) [recommended]
- [ ] Modal (center dialog)
- [ ] Inline editing
- [ ] Separate page

**View**:
- [ ] Sheet (slides from right, read-only) [recommended]
- [ ] Modal (center dialog)
- [ ] Separate page

**Delete**:
- [ ] Soft delete (set is_active=false) [recommended]
- [ ] Hard delete

**Form Fields for Add/Edit**:
Which fields should be editable?

Format: `field_name: input_type (validation)`

Input types: `text`, `textarea`, `number`, `select`, `checkbox`, `date`, `file`

Example:
```
name_en: text (required, min=2, max=64)
name_ar: text (required, min=2, max=64)
price: number (required, min=0)
category_id: select (required, options=categories)
description: textarea (optional, max=500)
is_featured: checkbox (default=false)
```
```

### Phase 5: Generation Plan

```markdown
## Generation Plan

Data Table Page: **{entities}**
Route: `/setting/{entities}`
Data Fetching: **Strategy A (Simplified Mutation-Driven)** [DEFAULT]

### Files to Create

| File | Purpose |
|------|---------|
| `lib/types/api/{entity}.ts` | TypeScript types |
| `lib/actions/{entity}.actions.ts` | Server actions |
| `app/api/setting/{entities}/route.ts` | Collection routes (route factory) |
| `app/api/setting/{entities}/[id]/route.ts` | Resource routes (route factory) |
| `app/api/setting/{entities}/[id]/status/route.ts` | Status toggle (route factory) |
| `app/(pages)/setting/{entities}/page.tsx` | Server component (SSR) |
| `app/(pages)/setting/{entities}/context/{entity}-actions-context.tsx` | Actions context provider |
| `app/(pages)/setting/{entities}/_components/table/{entity}-table.tsx` | Main client component (state + actions) |
| `app/(pages)/setting/{entities}/_components/table/{entity}-table-body.tsx` | DataTable rendering + selection |
| `app/(pages)/setting/{entities}/_components/table/{entity}-table-columns.tsx` | Column definitions |
| `app/(pages)/setting/{entities}/_components/table/{entity}-table-controller.tsx` | Toolbar (search, bulk actions) |
| `app/(pages)/setting/{entities}/_components/modal/add-{entity}-container.tsx` | Add form sheet |
| `app/(pages)/setting/{entities}/_components/modal/edit-{entity}-sheet.tsx` | Edit form sheet |
| `app/(pages)/setting/{entities}/_components/modal/view-{entity}-sheet.tsx` | View sheet (read-only) |
| `app/(pages)/setting/{entities}/_components/actions/actions-menu.tsx` | Row action buttons (view/edit) |
| `app/(pages)/setting/{entities}/_components/actions/add-{entity}-button.tsx` | Add button with sheet trigger |

### Architecture

```
page.tsx (Server Component)
├── Auth check
├── Fetch initial data via server actions
├── Fetch lookup data (if needed)
└── Pass initialData + lookupData to client

{entity}-table.tsx (Client Component)
├── useState(initialData) — local state from SSR
├── useEffect sync — re-sync when initialData changes
├── updateEntities() helper — in-place update from server response
├── Action handlers — call api.put/post(), update state
├── Context provider — pass actions to children
└── router.refresh() — for add operations

{entity}-actions-context.tsx
├── onToggleStatus()
├── onBulkStatusChange()
├── onRefresh()
└── All handlers update local state from backend response
```

### Column Preview

| Column | Type | Sortable | Filterable |
|--------|------|----------|------------|
{columns}

**Confirm?** Reply "yes" to generate.
```

### Phase 6: Code Generation

**Read skill references based on strategy:**

For Strategy A (Simplified Mutation-Driven) [DEFAULT]:
1. Read `skills/nextjs/references/simple-fetching-pattern.md`
2. Read `skills/data-table/references/types-pattern.md`
3. Read `skills/data-table/references/api-routes-pattern.md`
4. Read `skills/data-table/references/context-pattern.md`
5. Read `skills/data-table/references/table-component-pattern.md`
6. Read `skills/data-table/references/columns-pattern.md`

For Strategy B (SWR Fetching) - only when justified:
1. Read `skills/nextjs/references/swr-fetching-pattern.md`
2. Read `skills/data-table/references/types-pattern.md`
3. Read `skills/data-table/references/api-routes-pattern.md`
4. Read `skills/data-table/references/context-pattern.md`
5. Read `skills/data-table/references/table-component-pattern.md`
6. Read `skills/data-table/references/columns-pattern.md`

**Generation order:**

1. Types (`lib/types/api/{entity}.ts`)
2. Server actions (`lib/actions/{entity}.actions.ts`)
3. API routes using route factory (`app/api/setting/{entities}/route.ts`, `[id]/route.ts`, `[id]/status/route.ts`)
4. Actions context (`context/{entity}-actions-context.tsx`)
5. Main table component (`_components/table/{entity}-table.tsx`)
6. Table body (`_components/table/{entity}-table-body.tsx`)
7. Table columns (`_components/table/{entity}-table-columns.tsx`)
8. Table controller (`_components/table/{entity}-table-controller.tsx`)
9. Add sheet (`_components/modal/add-{entity}-container.tsx`)
10. Edit sheet (`_components/modal/edit-{entity}-sheet.tsx`)
11. View sheet (`_components/modal/view-{entity}-sheet.tsx`)
12. Row actions (`_components/actions/actions-menu.tsx`)
13. Add button (`_components/actions/add-{entity}-button.tsx`)
14. Page (`page.tsx`)

**Key patterns for Strategy A (Default):**

**Types (`lib/types/api/{entity}.ts`):**
```typescript
export interface {Entity} {
  id: number;
  // camelCase fields matching CamelModel output
  nameEn: string;
  nameAr: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface {Entity}Response {
  {entities}: {Entity}[];
  total: number;
  activeCount: number;
  inactiveCount: number;
}
```

**Server actions (`lib/actions/{entity}.actions.ts`):**
```typescript
"use server";
import { serverGet, serverPost } from "@/lib/fetch/server";
import { handleApiError } from "@/lib/utils/api-errors";
import { {Entity}Response } from "@/lib/types/api/{entity}";

export async function get{Entities}(
  limit: number,
  skip: number,
  search?: string,
  isActive?: boolean | null,
): Promise<{Entity}Response> {
  try {
    const params = new URLSearchParams();
    params.append("skip", skip.toString());
    params.append("limit", limit.toString());
    if (search) params.append("search", search);
    if (isActive !== undefined && isActive !== null) {
      params.append("is_active", isActive.toString());
    }
    return await serverGet(`/setting/{entities}/?${params.toString()}`) as {Entity}Response;
  } catch (error: unknown) {
    handleApiError("fetch {entities}", error);
    throw error;
  }
}
```

**API routes (route factory):**
```typescript
// app/api/setting/{entities}/route.ts
import { createCollectionRoutes } from "@/lib/fetch/route-factory";

/**
 * GET /api/setting/{entities} - List {entities} with pagination
 * POST /api/setting/{entities} - Create new {entity}
 */
export const { GET, POST } = createCollectionRoutes('/setting/{entities}/');
```

```typescript
// app/api/setting/{entities}/[id]/route.ts
import { createResourceRoutes } from "@/lib/fetch/route-factory";

/**
 * GET /api/setting/{entities}/[id] - Get single {entity}
 * PUT /api/setting/{entities}/[id] - Update {entity}
 * DELETE /api/setting/{entities}/[id] - Delete {entity}
 */
export const { GET, PUT, DELETE } = createResourceRoutes('/setting/{entities}/', 'id');
```

```typescript
// app/api/setting/{entities}/[id]/status/route.ts
import { createStatusRoute } from "@/lib/fetch/route-factory";

/**
 * PUT /api/setting/{entities}/[id]/status - Toggle {entity} status
 */
export const { PUT } = createStatusRoute('/setting/{entities}/', 'id');
```

**Main table component (`{entity}-table.tsx`) - Simplified Pattern:**
```typescript
"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { {Entity}, {Entity}Response } from "@/lib/types/api/{entity}";
import { {Entity}ActionsProvider } from "../context/{entity}-actions-context";
import api from "@/lib/client-axios";

interface {Entity}TableProps {
  initialData: {Entity}Response;
}

export function {Entity}Table({ initialData }: {Entity}TableProps) {
  const router = useRouter();

  // Local state synced with server-fetched initialData
  const [data, setData] = useState<{Entity}Response>(initialData);

  // Sync state when initialData changes (server re-fetch from URL change)
  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  // Manual refresh function (triggers server component re-render)
  const handleRefresh = useCallback(() => {
    router.refresh();
  }, [router]);

  // Update helper - updates items with server response
  const update{Entities} = useCallback(
    async (serverResponse: {Entity}[]) => {
      const currentData = data;
      if (!currentData) return;

      const responseMap = new Map(serverResponse.map((item) => [item.id, item]));
      const updatedList = currentData.{entities}.map((item) =>
        responseMap.has(item.id) ? responseMap.get(item.id)! : item
      );

      setData({
        ...currentData,
        {entities}: updatedList,
        activeCount: updatedList.filter((e) => e.isActive).length,
        inactiveCount: updatedList.filter((e) => !e.isActive).length,
      });
    },
    [data]
  );

  // Action: toggle status
  const handleToggleStatus = useCallback(
    async (id: number, isActive: boolean) => {
      const result = await api.put<{Entity}>(
        `/api/setting/{entities}/${id}/status`,
        { is_active: isActive }
      );
      await update{Entities}([result.data]);
      return { success: true, data: result.data };
    },
    [update{Entities}]
  );

  const actions = {
    onToggleStatus: handleToggleStatus,
    onRefresh: handleRefresh,
  };

  return (
    <{Entity}ActionsProvider actions={actions}>
      {/* StatusBadgeFilter, TableBody, Pagination */}
    </{Entity}ActionsProvider>
  );
}
```

**Actions context (`{entity}-actions-context.tsx`):**
```typescript
"use client";
import { createContext, useContext, ReactNode } from "react";

export interface {Entity}ActionsContextType {
  onToggleStatus: (id: number, isActive: boolean) => Promise<{ success: boolean }>;
  onRefresh: () => void;
}

const {Entity}ActionsContext = createContext<{Entity}ActionsContextType | null>(null);

export function {Entity}ActionsProvider({
  children,
  actions,
}: {
  children: ReactNode;
  actions: {Entity}ActionsContextType;
}) {
  return (
    <{Entity}ActionsContext.Provider value={actions}>
      {children}
    </{Entity}ActionsContext.Provider>
  );
}

export function use{Entity}Actions() {
  const context = useContext({Entity}ActionsContext);
  if (!context) {
    throw new Error("use{Entity}Actions must be used within {Entity}ActionsProvider");
  }
  return context;
}
```

**Page (`page.tsx`) - Server Component:**
```typescript
import { get{Entities} } from "@/lib/actions/{entity}.actions";
import { {Entity}Table } from "./_components/table/{entity}-table";

interface PageProps {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    search?: string;
    is_active?: string;
  }>;
}

export default async function {Entity}Page({ searchParams }: PageProps) {
  const params = await searchParams;
  const pageNumber = Number(params.page) || 1;
  const limitNumber = Number(params.limit) || 10;
  const skip = (pageNumber - 1) * limitNumber;

  const search = params.search || undefined;
  const isActive = params.is_active !== undefined
    ? params.is_active === "true"
    : undefined;

  const {entities} = await get{Entities}(limitNumber, skip, search, isActive);

  return <{Entity}Table initialData={{entities}} />;
}
```

**Add/Edit/View Flow:**

| Flow | Trigger | Mutation | UI Update |
|------|---------|----------|-----------|
| **Add** | Sheet form → server action (`create{Entity}`) | `serverPost` | `router.refresh()` (new row via SSR re-fetch) |
| **Edit** | Sheet form → `api.put()` | Client-side `api.put` | `update{Entities}([response])` (in-place) |
| **View** | Sheet (read-only) | None | None |
| **Toggle Status** | Action button → `api.put()` | Client-side `api.put` | `update{Entities}([response])` (in-place) |

**Why Add uses `router.refresh()`**: New entities affect pagination, counts, and sort order. A full server re-fetch is correct. Edits only change existing rows, so in-place update is sufficient.

### Phase 7: Next Steps

```markdown
## Generation Complete

Your **{entities}** data table page has been created.

### Files Created

- [x] `lib/types/api/{entity}.ts` - TypeScript types
- [x] `lib/actions/{entity}.actions.ts` - Server actions
- [x] `app/api/setting/{entities}/route.ts` - Collection routes (route factory)
- [x] `app/api/setting/{entities}/[id]/route.ts` - Resource routes (route factory)
- [x] `app/api/setting/{entities}/[id]/status/route.ts` - Status route (route factory)
- [x] `app/(pages)/setting/{entities}/page.tsx` - Server component
- [x] `app/(pages)/setting/{entities}/context/{entity}-actions-context.tsx` - Actions context
- [x] `app/(pages)/setting/{entities}/_components/table/{entity}-table.tsx` - Main table
- [x] `app/(pages)/setting/{entities}/_components/table/{entity}-table-body.tsx` - Table body
- [x] `app/(pages)/setting/{entities}/_components/table/{entity}-table-columns.tsx` - Columns
- [x] `app/(pages)/setting/{entities}/_components/table/{entity}-table-controller.tsx` - Toolbar
- [x] `app/(pages)/setting/{entities}/_components/modal/add-{entity}-container.tsx` - Add sheet
- [x] `app/(pages)/setting/{entities}/_components/modal/edit-{entity}-sheet.tsx` - Edit sheet
- [x] `app/(pages)/setting/{entities}/_components/modal/view-{entity}-sheet.tsx` - View sheet
- [x] `app/(pages)/setting/{entities}/_components/actions/actions-menu.tsx` - Row actions
- [x] `app/(pages)/setting/{entities}/_components/actions/add-{entity}-button.tsx` - Add button

### Test the Page

```bash
npm run dev
# Visit http://localhost:3000/setting/{entities}
```

### Verify

```bash
npx tsc --noEmit && npm run lint && npm run build
```

### Backend Check

{If backend exists}
Your backend API at `/setting/{entities}/` is ready. The frontend proxies requests through Next.js API routes using route factories.

{If backend doesn't exist}
**Warning:** No backend API found. Create it with:
```bash
/generate entity {entity}
```

### Related Actions

Would you like me to:

- [ ] **Generate backend entity** if not already created?
      → `/generate entity {entity}`
- [ ] **Add advanced filters** panel?
- [ ] **Add export functionality** (CSV, Excel)?
- [ ] **Validate patterns** for this page?
      → `/validate {entity}`
- [ ] **Update API documentation**?
      → Update `/docs/backend-api-reference.md`
```

## Reference Implementations

- **Simplified Pattern (DEFAULT)**: `src/frontend/app/(pages)/setting/roles/_components/table/roles-table.tsx`
- **SWR Pattern (when justified)**: `src/frontend/app/(pages)/setting/users/_components/table/users-table.tsx`
- **Server Actions**: `src/frontend/lib/actions/`
- **Route Factory**: `src/frontend/lib/fetch/route-factory.ts`
- **Types**: `src/frontend/lib/types/api/`
