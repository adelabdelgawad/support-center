---
name: nextjs-data-table-page
description: Create Next.js data table pages with SSR initial load, simplified state management, and server-response-based UI updates. Use when asked to create a new data table page, entity management page, CRUD table, or admin list view. Generates page.tsx (SSR), table components, columns, context, actions, and API routes following a proven architecture with centralized reusable data-table component.
---

# Next.js Data Table Page Generator

Create production-ready data table pages with:
- **SSR initial data loading** for fast first paint
- **Simple state management** (`useState`) as the default — SWR only when justified
- **URL-based state** for filters/pagination/sorting via URL params
- **Centralized data-table** from `@/components/data-table`
- **Type-safe columns** with TanStack Table
- **Context-based actions** for CRUD operations

## Reusable Data-Table Component Library

The project includes a comprehensive reusable data-table component library at `@/components/data-table`. **Always use these components — never build table UI from scratch.**

### Component Library Structure

```
components/data-table/
├── index.ts                  # Main exports (14 components)
├── types.ts                  # Shared type definitions
├── table/
│   ├── data-table.tsx        # Core TanStack Table wrapper (generic <TData>)
│   ├── data-table-bar.tsx    # Flexible 3-section toolbar (left/middle/right)
│   └── pagination.tsx        # Server-side pagination synced to URL params
├── controls/
│   ├── search-input.tsx      # Debounced URL-synced search (default 2000ms)
│   ├── column-toggle.tsx     # Column visibility dropdown
│   ├── sort-list.tsx         # Advanced multi-column sort with drag-reorder
│   ├── column-header.tsx     # Per-column sort header dropdown
│   └── refresh-button.tsx    # Manual refresh trigger
├── filters/
│   ├── status-filter-bar.tsx # Tab-style status filters (All/Active/Inactive)
│   └── status-badge-filter.tsx # Badge-style status filters (inline mode available)
├── actions/
│   ├── selection-display.tsx # Selected count with clear button
│   ├── export-button.tsx     # CSV export of visible columns
│   ├── print-button.tsx      # HTML/PDF print of table
│   ├── enable-button.tsx     # Bulk enable with confirmation dialog
│   └── disable-button.tsx    # Bulk disable with confirmation dialog
└── ui/
    ├── button.tsx            # Custom button with icon + tooltip
    ├── status-badge.tsx      # Status indicator (Online/Offline/Warning)
    └── status-circle.tsx     # Circular status with click-filtering
```

### Core Components and Usage

#### DataTable — Core Table Wrapper

```tsx
import { DataTable } from "@/components/data-table";

<DataTable
  data={items}
  columns={columns}
  onRowSelectionChange={(selectedRows) => setSelected(selectedRows)}
  renderToolbar={(table) => <MyToolbar table={table} />}
  isLoading={isLoading}
  enableRowSelection={true}
  enableSorting={true}
/>
```

**Key features:** Generic `<TData>`, column visibility, row selection, column resizing, RTL support, i18n, loading overlay.

#### DynamicTableBar — Flexible Toolbar Layout

```tsx
import { DynamicTableBar } from "@/components/data-table";

// Header bar (search, filters, column toggle)
<DynamicTableBar
  variant="header"
  left={<SearchInput />}
  middle={<StatusBadgeFilter totalCount={25} activeCount={20} inactiveCount={5} />}
  right={<ColumnToggleButton table={table} />}
/>

// Controller bar (selection count, bulk actions) — shows accent bg when items selected
<DynamicTableBar
  variant="controller"
  hasSelection={selectedCount > 0}
  left={<SelectionDisplay selectedCount={3} onClearSelection={clear} i18n={{...}} />}
  right={
    <>
      <EnableButton selectedIds={ids} onEnable={enable} />
      <DisableButton selectedIds={ids} onDisable={disable} />
    </>
  }
/>
```

#### Pagination — URL-Synced Page Controls

```tsx
import { Pagination } from "@/components/data-table";

<Pagination
  currentPage={page}
  totalPages={totalPages}
  pageSize={limit}
  totalItems={totalItems}
/>
```

Syncs `page` and `limit` URL params automatically. Supports page sizes 10/25/50/100, first/prev/next/last buttons, entry count display.

#### Filter Components

```tsx
import { StatusBadgeFilter, StatusFilterBar } from "@/components/data-table";

// Badge-style (preferred, supports inline mode for embedding in toolbars)
<StatusBadgeFilter
  totalCount={total}
  activeCount={activeCount}
  inactiveCount={inactiveCount}
  inline={true}  // Render without wrapper for embedding in DynamicTableBar
/>

// Tab-style alternative
<StatusFilterBar totalCount={total} activeCount={activeCount} inactiveCount={inactiveCount} />
```

Both filter on `is_active` URL param and reset pagination to page 1 on change.

#### Search and Sort Controls

```tsx
import { SearchInput, DataTableSortList, DataTableColumnHeader, ColumnToggleButton } from "@/components/data-table";

// Debounced search synced to URL ?filter= param
<SearchInput placeholder="Search..." debounceMs={2000} urlParam="filter" />

// Multi-column sort with drag reorder
<DataTableSortList sortableColumns={[
  { id: "firstName", label: "First Name" },
  { id: "role", label: "Role" },
]} />

// Per-column sort header (use in column definitions)
<DataTableColumnHeader column={column} title="Name" />

// Column visibility toggle
<ColumnToggleButton table={table} />
```

Sort syncs to URL: `?sort=firstName:asc,role:desc`

#### Bulk Action Components

```tsx
import { SelectionDisplay, EnableButton, DisableButton, ExportButton, PrintButton } from "@/components/data-table";

<SelectionDisplay selectedCount={3} onClearSelection={clear} i18n={{ selected: "{count} {item} selected", clearSelection: "Clear", itemName: "user" }} />
<EnableButton selectedIds={ids} onEnable={handleEnable} />
<DisableButton selectedIds={ids} onDisable={handleDisable} />
<ExportButton table={table} />
<PrintButton table={table} title="Users" />
```

### Key Patterns

1. **URL-Driven State**: Search, filter, sort, pagination ALL sync to URL params
2. **Generic `<TData>`**: All components use TypeScript generics
3. **i18n**: Language hook integration throughout with fallback strings
4. **RTL Support**: `ltr:` / `rtl:` Tailwind classes throughout
5. **Composition**: `DynamicTableBar` + controls = flexible toolbars
6. **Confirmation Dialogs**: Bulk actions use `useConfirmationDialog` hook

## Data Fetching Strategy

**This application uses Strategy A (Simple Fetching) exclusively.** All current tables use `useState` + server response updates.

### Decision Question
**Does this table's data change without user action?**

| Answer | Strategy | Use When |
|--------|----------|----------|
| **No** | A: Simple Fetching (Default) | Settings, admin CRUD, most entity tables |
| **Yes** | B: SWR Fetching | Dashboards, multi-user editing, live monitoring |

### Strategy A: Simple Fetching (Default — Used by All Current Tables)
- Use `useState` for local data management
- Update state from server mutation responses
- No automatic revalidation
- Lower complexity, no SWR dependency
- **See:** [nextjs/references/simple-fetching-pattern.md](../nextjs/references/simple-fetching-pattern.md)

### Strategy B: SWR Fetching (Reference Only — Requires Justification)
- Use `useSWR` with documented justification
- Configure appropriate revalidation triggers
- For dashboards and multi-user scenarios
- **See:** [nextjs/references/swr-fetching-pattern.md](../nextjs/references/swr-fetching-pattern.md)

**Decision framework:** [nextjs/references/data-fetching-strategy.md](../nextjs/references/data-fetching-strategy.md)

## Architecture Overview

```
app/(pages)/[section]/[entity]/
├── page.tsx                          # SSR entry point
├── context/
│   └── [entity]-actions-context.tsx  # Actions provider
└── _components/
    ├── table/
    │   ├── [entity]-table.tsx        # Main client wrapper (useState)
    │   ├── [entity]-table-body.tsx   # DataTable + columns
    │   ├── [entity]-table-columns.tsx# Column definitions
    │   ├── [entity]-table-controller.tsx # Toolbar/bulk actions
    │   └── [entity]-table-actions.tsx # Bulk action hooks
    ├── actions/
    │   ├── add-[entity]-button.tsx   # Add button + sheet
    │   └── actions-menu.tsx          # Row action menu
    ├── modal/
    │   ├── add-[entity]-sheet.tsx    # Create form
    │   ├── edit-[entity]-sheet.tsx   # Edit form
    │   └── view-[entity]-sheet.tsx   # View details
    └── sidebar/
        └── status-panel.tsx          # Stats sidebar
```

## Quick Start

1. **Gather requirements**: Entity name, fields, API endpoints, actions needed
2. **Generate files** in order: types → server actions → page → table → columns → context → actions
3. **Use data-table components** from `@/components/data-table` — never build table UI from scratch

## File Generation Order

### 1. Types (if not existing)
Define response types in `@/lib/types/api/[entity].ts`. See [references/types-pattern.md](references/types-pattern.md).

### 2. Server Actions
Create server actions in `@/lib/actions/[entity].actions.ts`.

### 3. SSR Page (`page.tsx`)
```tsx
import { auth } from "@/lib/auth/server-auth";
import { get[Entity]s } from "@/lib/actions/[entity].actions";
import { redirect } from "next/navigation";
import [Entity]Table from "./_components/table/[entity]-table";

export default async function [Entity]Page({
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

  const data = await get[Entity]s(limitNumber, skip, {
    is_active: params.is_active,
    search: params.search,
  });

  return <[Entity]Table initialData={data} />;
}
```

### 4. Main Table Component
See [references/table-component-pattern.md](references/table-component-pattern.md) for the full pattern with:
- `useState` with initialData (Strategy A — default)
- Action handlers that return server responses
- `updateItems()` function for state mutation
- `ActionsProvider` wrapper
- Composition using `DataTable`, `DynamicTableBar`, `Pagination`, and filter components

### 5. Table Body + Columns
See [references/columns-pattern.md](references/columns-pattern.md) for:
- Column definitions with `updatingIds` loading states
- Selection column with checkbox
- Status toggle with confirmation
- Actions column placeholder
- Use `DataTableColumnHeader` for sortable column headers

### 6. Context + Actions
See [references/context-pattern.md](references/context-pattern.md) for:
- Context provider setup
- Bulk action hooks
- Error handling patterns

### 7. Edit/Add Sheets
See [references/edit-sheet-pattern.md](references/edit-sheet-pattern.md) for:
- Fetch-then-open pattern (load complete entity before opening sheet)
- Row actions with loading states
- Edit sheet component structure
- Form handling with server response updates

## Core Principles

### Server Response Updates (NOT Optimistic)

```tsx
// ✅ CORRECT: Use server response
const { data: updated } = await fetchClient.put(`/api/entity/${id}`, body);
updateItems([updated]); // Update local state with server data

// ❌ WRONG: Optimistic update
const optimistic = { ...current, ...changes };
setData({ items: [...items.filter(i => i.id !== id), optimistic] });
```

### Simple State Management (Default)
```tsx
// React state — no SWR
const [data, setData] = useState<Response>(initialData);

const updateItems = (serverResponse: Item[]) => {
  setData(current => {
    if (!current) return current;
    const responseMap = new Map(serverResponse.map(i => [i.id, i]));
    return {
      ...current,
      items: current.items.map(item =>
        responseMap.has(item.id) ? responseMap.get(item.id)! : item
      ),
    };
  });
};
```

### Typical Table Composition Pattern
```tsx
// In [entity]-table-body.tsx — compose using data-table components
import { DataTable, DynamicTableBar, SearchInput, StatusBadgeFilter, ColumnToggleButton, RefreshButton } from "@/components/data-table";

<DataTable
  data={items}
  columns={columns}
  onRowSelectionChange={handleSelectionChange}
  renderToolbar={(table) => (
    <>
      <DynamicTableBar
        variant="header"
        left={<SearchInput />}
        middle={<StatusBadgeFilter inline totalCount={total} activeCount={active} inactiveCount={inactive} />}
        right={
          <>
            <DataTableSortList sortableColumns={sortableColumns} />
            <ColumnToggleButton table={table} />
            <RefreshButton onRefresh={onRefresh} />
          </>
        }
      />
      {selectedCount > 0 && (
        <DynamicTableBar
          variant="controller"
          hasSelection
          left={<SelectionDisplay selectedCount={selectedCount} onClearSelection={clear} i18n={i18n} />}
          right={
            <>
              <EnableButton selectedIds={selectedIds} onEnable={handleEnable} />
              <DisableButton selectedIds={selectedIds} onDisable={handleDisable} />
            </>
          }
        />
      )}
    </>
  )}
/>
```

## Reference Implementations

- `src/frontend/app/(pages)/setting/users/` — canonical users table (Strategy A)
- `src/frontend/app/(pages)/setting/roles/` — roles table (Strategy A)

## Required Dependencies

Ensure project has:
- `@tanstack/react-table` - Table primitives
- `@/components/data-table` - Reusable table components (must exist)
- `swr` - Only if using Strategy B (SWR fetching)

## Checklist

- [ ] Data fetching strategy selected (A is default)
- [ ] Types defined for entity and response
- [ ] Server actions created in `lib/actions/`
- [ ] SSR page fetches initial data
- [ ] Main table uses `useState` with initialData
- [ ] Table body composes `DataTable`, `DynamicTableBar`, filters, controls from `@/components/data-table`
- [ ] Actions return server response (not optimistic)
- [ ] Columns show loading state via updatingIds
- [ ] Columns use `DataTableColumnHeader` for sortable headers
- [ ] Context provides actions to children
- [ ] Bulk actions use `EnableButton`/`DisableButton` with confirmation
- [ ] URL params drive filtering/pagination/sorting
- [ ] Edit sheets use fetch-then-open pattern (not row.original)
