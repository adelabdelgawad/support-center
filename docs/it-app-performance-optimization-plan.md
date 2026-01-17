# it-app Performance Optimization Plan

## Problem Summary

`my-app` (network-manager) has significantly better performance than `it-app` due to:
1. **Universal SWR adoption** vs manual useState/useEffect patterns
2. **Aggressive code splitting** vs bundling everything upfront
3. **Lean dependencies** (22 vs 70+) with tree-shaking
4. **Optimized provider structure** vs nested re-render cascades

---

## Performance Comparison Table

| Aspect | `my-app` (Network Manager) | `it-app` (Support Center) | Impact |
|--------|---------------------------|---------------------------|--------|
| **Data Fetching** | SWR universally adopted with configurable polling intervals | SWR installed but underutilized (only 5-6 places); manual `useState`/`useEffect` patterns | **High** |
| **Request Deduplication** | SWR handles automatically | None - each component fetches independently | **High** |
| **Code Splitting** | Dynamic imports for modals, heavy components | Only 3 dynamic imports total; Recharts, jsPDF bundled upfront | **High** |
| **Client-Side JS Bundle** | ~150-200KB (estimated) - minimal hydration | Larger - 24+ Radix UI components, Framer Motion, jsPDF, Recharts all bundled | **High** |
| **Server Components** | 70%+ logic stays server-side | Good SSR but over-reliance on `'use client'` in nested components | **Medium** |
| **Memoization** | Strategic `useCallback`/`useMemo` with ESLint enforcement | Present but inconsistent; no lint rule enforcement | **Medium** |
| **Metadata/Reference Data** | SWR with `fallbackData` from server | Manual `useState` + `useEffect` in each hook | **Medium** |
| **Provider Structure** | Single lightweight `ClientAppWrapper` | Multiple nested contexts (SignalR, Session, Page-specific) | **Medium** |
| **Table Performance** | TanStack Table with pagination, sticky headers | Same library but pagination inconsistent | **Low-Medium** |
| **Retry Logic** | Built into fetch layer (2 retries, 1s delay) | `lib/retry.ts` exists but usage unclear | **Low-Medium** |
| **Bundle Analysis** | Lean 22 dependencies | 70+ dependencies, potential unused packages | **Medium** |

---

## Phase 1: SWR Migration (Highest Impact)

### 1.1 Convert Manual Fetch Hooks to SWR

**HIGH PRIORITY - 3 hooks (immediate deduplication benefits):**

| File | Current Pattern | Conversion |
|------|-----------------|------------|
| `lib/hooks/use-global-metadata.ts` | 3 separate useState/useEffect hooks | Single SWR hook per data type with cache keys |
| `lib/hooks/use-technicians.ts` | Manual fetch (duplicate of useGlobalTechnicians) | Remove, use `useGlobalTechnicians` with SWR |
| `lib/hooks/use-categories-tags.ts` | Manual fetch | Simple SWR conversion |

**MEDIUM PRIORITY - 3 hooks (auto-refresh patterns):**

| File | Current Pattern | Conversion |
|------|-----------------|------------|
| `lib/hooks/use-view-counts.ts` | Manual 30s interval | SWR with `refreshInterval: 30000` |
| `lib/hooks/use-ticket-type-counts.ts` | Manual 10s interval | SWR with `refreshInterval: 10000` |
| `lib/hooks/use-business-unit-counts.ts` | Manual 30s interval | SWR with view param in cache key |

**LOWER PRIORITY - 2 hooks:**

| File | Current Pattern | Conversion |
|------|-----------------|------------|
| `lib/hooks/use-request-details-page.ts` | Manual fetch on mount | SWR with requestId key |
| `lib/hooks/use-custom-view.ts` | Manual fetch | SWR with simple key |

### 1.2 Add Missing Cache Keys

**File:** `lib/swr/cache-keys.ts`

Add:
```typescript
categories: '/api/categories?include_subcategories=true',
viewCounts: (view: string) => `/api/requests/technician-views?view=${view}`,
ticketTypeCounts: '/api/requests/ticket-type-counts',
businessUnitCounts: (view: string) => `/api/business-unit-counts?view=${view}`,
```

### 1.3 Remove Duplicate Technician Fetching

**Problem:** Two hooks fetch `/api/technicians`:
- `useGlobalTechnicians()` in `use-global-metadata.ts`
- `useTechnicians()` in `use-technicians.ts`

**Solution:** Keep `useGlobalTechnicians()` with SWR, delete `use-technicians.ts`, update imports.

---

## Phase 2: Code Splitting (High Impact)

### 2.1 Lazy Load Recharts (~35KB savings)

**Create:** `components/charts/lazy-charts.tsx`
```typescript
import dynamic from 'next/dynamic';

export const LazyDistributionBarChart = dynamic(
  () => import('./distribution-bar-chart'),
  { ssr: false, loading: () => <ChartSkeleton /> }
);
// Same for pie and line charts
```

**Update these files:**
- `app/(it-pages)/reports/_components/reports-dashboard-client.tsx`
- `app/(it-pages)/reports/operations/_components/operations-dashboard-client.tsx`
- `app/(it-pages)/reports/sla/_components/sla-report-client.tsx`
- `app/(it-pages)/reports/volume/_components/volume-report-client.tsx`
- `app/(it-pages)/reports/agents/_components/agent-performance-client.tsx`

### 2.2 Lazy Load jsPDF (~90KB savings)

**Update:** `components/reports/export-button.tsx`
```typescript
const handleExport = async () => {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  // ... existing export logic
};
```

### 2.3 Remove Unused framer-motion (~30KB savings)

**Action:** Remove from `package.json` - not imported anywhere in codebase.

```bash
cd it-app && bun remove framer-motion
```

### 2.4 Lazy Load Modal Sheets

**Pattern for all 40+ modal sheets:**
```typescript
// Before (in parent component)
import { AddUserSheet } from './modal/add-user-sheet';

// After
const AddUserSheet = dynamic(() => import('./modal/add-user-sheet'), {
  loading: () => <SheetSkeleton />
});
```

**Priority sheets (largest/most used):**
- `setting/business-units/_components/modal/*.tsx` (5 files)
- `setting/users/_components/modal/*.tsx` (4 files)
- `setting/categories/_components/modal/*.tsx` (4 files)

### 2.5 Lazy Load MediaViewer (~15KB savings)

**File:** `components/ui/media-viewer.tsx` (567 lines)

Only used in ticket details - wrap with dynamic import in consuming component.

---

## Phase 3: Provider Optimization (Medium Impact)

### 3.1 Memoize SignalRProvider Context Value

**File:** `lib/signalr/signalr-context.tsx`

```typescript
const contextValue = useMemo(() => ({
  connection,
  connectionState,
  subscribeToRoom,
  unsubscribeFromRoom,
  // ... other values
}), [connection, connectionState, /* specific deps */]);
```

### 3.2 Split RequestsListProvider

**Current:** Monolithic context with 10+ state values causing cascading re-renders.

**Split into:**
```
_context/
├── requests-list-data-context.tsx    (tickets, total, page)
├── requests-list-counts-context.tsx  (counts, filterCounts)
└── requests-list-ui-context.tsx      (activeView, isViewChanging)
```

### 3.3 Split RequestDetailProvider

**Current:** Mixes chat + metadata causing unnecessary re-renders.

**Split into:**
```
_context/
├── request-detail-metadata-context.tsx  (ticket, notes, assignees)
└── request-detail-chat-context.tsx      (messages, typing) - via SignalR
```

### 3.4 Scope NavigationProgressProvider

**Current:** Global in layout affecting all routes.

**Move to:** Only pages that show navigation progress indicator.

---

## Phase 4: Dependency Cleanup (Lower Impact)

### 4.1 Audit Unused Dependencies

Run bundle analysis:
```bash
cd it-app
bun add -d @next/bundle-analyzer
```

Add to `next.config.ts`:
```typescript
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});
module.exports = withBundleAnalyzer(nextConfig);
```

### 4.2 Review Radix UI Imports

Ensure only used components are imported (24+ in package.json).

---

## Files to Modify

### SWR Migration (Phase 1)
- `lib/hooks/use-global-metadata.ts` - Convert 3 hooks to SWR
- `lib/hooks/use-technicians.ts` - DELETE (duplicate)
- `lib/hooks/use-categories-tags.ts` - Convert to SWR
- `lib/hooks/use-view-counts.ts` - Convert to SWR
- `lib/hooks/use-ticket-type-counts.ts` - Convert to SWR
- `lib/hooks/use-business-unit-counts.ts` - Convert to SWR
- `lib/hooks/use-request-details-page.ts` - Convert to SWR
- `lib/hooks/use-custom-view.ts` - Convert to SWR
- `lib/swr/cache-keys.ts` - Add missing keys

### Code Splitting (Phase 2)
- `components/charts/lazy-charts.tsx` - CREATE
- `components/reports/export-button.tsx` - Dynamic import jsPDF
- `package.json` - Remove framer-motion
- 40+ modal sheet parent components - Add dynamic imports

### Provider Optimization (Phase 3)
- `lib/signalr/signalr-context.tsx` - Add memoization
- `app/(it-pages)/support-center/requests/_context/` - Split context
- `app/(it-pages)/support-center/requests/(details)/[id]/_context/` - Split context

---

## Expected Results

| Optimization | Bundle Size | Re-renders | Network Requests |
|--------------|-------------|------------|------------------|
| SWR Migration | - | -50% | -40% (dedup) |
| Recharts lazy | -35KB | - | - |
| jsPDF lazy | -90KB | - | - |
| Remove framer-motion | -30KB | - | - |
| Modal lazy loading | -50KB | - | - |
| Provider split | - | -30% | - |
| **Total** | **~205KB** | **~60% fewer** | **~40% fewer** |

---

## Verification Plan

1. **Bundle size check:**
   ```bash
   cd it-app
   ANALYZE=true bun run build
   # Compare .next/analyze/ before/after
   ```

2. **Performance testing:**
   - Open Chrome DevTools → Performance tab
   - Record page load for `/support-center/requests`
   - Compare JS parse/execute time before/after

3. **Network requests:**
   - Open Network tab
   - Navigate through app
   - Verify no duplicate requests for same data

4. **Re-render verification:**
   - Install React DevTools
   - Enable "Highlight updates when components render"
   - Interact with UI, verify fewer highlights

5. **Functional testing:**
   ```bash
   cd it-app
   bun run build && bun run start
   # Test: login, view tickets, open ticket detail, export PDF, view reports
   ```

---

## Implementation Order

1. **Phase 1.3** - Remove duplicate technician hook (quick win)
2. **Phase 2.3** - Remove framer-motion (quick win)
3. **Phase 1.1** - Convert high-priority hooks to SWR
4. **Phase 2.1-2.2** - Lazy load Recharts + jsPDF
5. **Phase 3.1** - Memoize SignalRProvider
6. **Phase 1.1** - Convert remaining hooks to SWR
7. **Phase 2.4** - Lazy load modal sheets
8. **Phase 3.2-3.4** - Split providers
