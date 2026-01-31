# SSR Performance Fixes — Implementation Plan

## Overview

Five categories of SSR performance issues were identified across the Next.js app. The worst offender is the categories page (~5s render due to N+1 fetches), but systemic issues affect all admin pages.

---

## Fix 1 — Categories N+1 Fetch → Single Request (HIGH)

**File:** `src/it-app/lib/actions/categories.actions.ts`

### Problem

`getCategories()` fires N+1 HTTP requests:
1. Fetches all categories (line 45-48)
2. If `activeOnly` is falsy, fetches categories **again** with `active_only=false` (lines 51-56) — this is a duplicate because `activeOnly` defaults to `false`, so the first fetch already used `active_only=false`
3. For each category, fetches subcategories individually (lines 84-89) — this is the N+1 problem

The ternary on line 51 is inverted: when `activeOnly` is `false`, the condition `activeOnly ? categories : await serverFetch(...)` takes the **else** branch and re-fetches. It should skip the re-fetch when `activeOnly` is already `false`.

### Current Code (Simplified)

```typescript
// Fetch 1: categories
const categories = await serverFetch<CategoryResponse[]>(
  `/categories/categories?active_only=${activeOnly}`,
  CACHE_PRESETS.NO_CACHE()
);

// Fetch 2: DUPLICATE when activeOnly=false (inverted ternary)
const allCategories = activeOnly
  ? categories                              // reuses when activeOnly=true (wrong)
  : await serverFetch<CategoryResponse[]>(  // re-fetches when activeOnly=false (wrong)
      `/categories/categories?active_only=false`,
      CACHE_PRESETS.NO_CACHE()
    );

// Fetch 3..N+2: one per category
await Promise.all(
  filteredCategories.map(async (category) => {
    const subcategories = await getCategorySubcategories(category.id);
    subcategoriesMap![category.id] = subcategories;
  })
);
```

### Solution

1. **Fix the inverted ternary** — swap the branches so it reuses `categories` when `activeOnly=false` (since that fetch already used `active_only=false`):
   ```typescript
   const allCategories = activeOnly
     ? await serverFetch<CategoryResponse[]>(
         `/categories/categories?active_only=false`,
         CACHE_PRESETS.NO_CACHE()
       )
     : categories; // already fetched with active_only=false
   ```

2. **Eliminate N+1 subcategory fetches** — pass `include_subcategories=true` query param to the categories endpoint (backend already supports this). Extract subcategories from each category response object instead of fetching individually:
   ```typescript
   const categories = await serverFetch<CategoryWithSubcategories[]>(
     `/categories/categories?active_only=${activeOnly}&include_subcategories=true`,
     CACHE_PRESETS.NO_CACHE()
   );

   // Build subcategoriesMap from response instead of N fetches
   if (params?.includeSubcategories) {
     subcategoriesMap = {};
     for (const category of filteredCategories) {
       subcategoriesMap[category.id] = category.subcategories ?? [];
     }
   }
   ```

3. **Verify backend support** — check the FastAPI categories endpoint accepts `include_subcategories` query param. File: `src/backend/api/v1/endpoints/categories.py`.

### Impact

~5s → ~300ms for categories page (eliminates N+1 network round-trips).

### Verification

- Load `/admin/setting/categories` — render time should drop from ~5s to <500ms
- Verify categories table displays correctly
- Verify subcategories column/expand still works
- Verify active/inactive filters still work
- Verify name search still works

---

## Fix 2 — Admin Layout Uses Uncached Fetch (HIGH)

**File:** `src/it-app/app/(it-pages)/admin/(admin-pages)/layout.tsx` (line 69)

### Problem

Every admin page navigation triggers:
```typescript
const pages = await getUserPages(user.id);
```
This calls the backend with `NO_CACHE` on every request. A cached version `getUserPagesCached()` already exists in `lib/actions/users.actions.ts` that uses 5-minute revalidation with tag-based invalidation.

### Solution

```diff
- import { getUserPages } from "@/lib/actions/users.actions";
+ import { getUserPagesCached } from "@/lib/actions/users.actions";

- const pages = await getUserPages(user.id);
+ const pages = await getUserPagesCached(user.id);
```

### Impact

Eliminates ~200-500ms blocking fetch on every admin page navigation. Cached response is revalidated every 5 minutes and invalidated on permission changes via `revalidateTag()`.

### Verification

- Navigate between admin pages — should feel snappier
- Verify admin sidebar still shows correct pages
- Change user permissions → sidebar should update within 5 minutes (or immediately if `revalidateTag` is called)

---

## Fix 3 — Duplicate User Pages Fetch in Layout Chain (HIGH)

### Problem

Two nested layouts both fetch user pages:

| Layout | File | Line | Cache |
|--------|------|------|-------|
| Parent | `app/(it-pages)/layout.tsx` | 81 | `no-store` (via `getCachedNavigation` fallback) |
| Child | `app/(it-pages)/admin/(admin-pages)/layout.tsx` | 69 | `NO_CACHE` |

Both hit `/users/{id}/pages` on the backend.

### Solution

This is resolved by Fix 2. Once the admin layout uses `getUserPagesCached()`, the child layout will serve from the Next.js data cache (5-min revalidation). The parent layout already has its own cookie-based cache with API fallback, so the two won't both hit the backend.

No additional code changes needed beyond Fix 2.

### Impact

Eliminates one redundant backend call per admin page load.

---

## Fix 4 — Sequential Auth + Data Fetches on Admin Pages (MEDIUM)

### Problem

All admin `page.tsx` files follow this pattern:
```typescript
await validateAgentAccess();   // ~100-200ms
const data = await getData();  // ~100-300ms
```
These are sequential but independent — validation doesn't affect which data is fetched.

### Solution

Use `Promise.all` to parallelize:
```typescript
const [_, data] = await Promise.all([
  validateAgentAccess(),
  getPageData(...)
]);
```

### Affected Pages (14 total)

All under `src/it-app/app/(it-pages)/admin/(admin-pages)/`:

| Page | File |
|------|------|
| Categories | `setting/categories/page.tsx` |
| Business Unit Regions | `setting/business-unit-regions/page.tsx` |
| Business Units | `setting/business-units/page.tsx` |
| Client Versions | `setting/client-versions/page.tsx` |
| Request Statuses | `setting/request-statuses/page.tsx` |
| Request Types | `setting/request-types/page.tsx` |
| System Events | `setting/system-events/page.tsx` |
| System Messages | `setting/system-messages/page.tsx` |
| Users | `setting/users/page.tsx` |
| Roles | `setting/roles/page.tsx` |
| Active Sessions | `management/active-sessions/page.tsx` |
| Deployment Jobs | `management/deployments/jobs/page.tsx` |
| Deployments | `management/deployments/page.tsx` |
| Scheduler | `management/scheduler/page.tsx` |

### Implementation Notes

- Each page needs individual review since the exact data-fetching calls vary
- The `validateAgentAccess()` call must still be checked after `Promise.all` — if it throws/redirects, the page should not render
- Some pages may have multiple data fetches that can also be parallelized with each other

### Impact

~100-300ms savings per admin page load.

### Verification

- Each affected page loads correctly
- Unauthorized users are still redirected
- Page data is unchanged

---

## Fix 5 — Reference Data Uses NO_CACHE Unnecessarily (MEDIUM)

### Problem

Rarely-changing reference data is fetched with `CACHE_PRESETS.NO_CACHE()` on every page load:

| Data | Used In | Change Frequency |
|------|---------|-----------------|
| Request statuses | Multiple pages | Rarely (admin-edited) |
| Request types | Multiple pages | Rarely (admin-edited) |
| Categories (non-admin views) | Request forms, filters | Rarely (admin-edited) |
| System messages | Various | Rarely (admin-edited) |

### Solution

Switch to `CACHE_PRESETS.REFERENCE_DATA(tag)` which provides 5-minute revalidation with tag-based invalidation:

```typescript
// Before
const statuses = await serverFetch('/request-statuses', CACHE_PRESETS.NO_CACHE());

// After
const statuses = await serverFetch('/request-statuses', CACHE_PRESETS.REFERENCE_DATA('request-statuses'));
```

For admin setting pages that edit these resources, call `revalidateTag()` after mutations:
```typescript
import { revalidateTag } from 'next/cache';

// After creating/updating/deleting a status
revalidateTag('request-statuses');
```

### Files to Update

Search for `NO_CACHE` usage in `lib/actions/*.actions.ts` files that fetch reference data. Likely candidates:
- `lib/actions/request-statuses.actions.ts`
- `lib/actions/request-types.actions.ts`
- `lib/actions/categories.actions.ts` (for non-admin read-only fetches)
- `lib/actions/system-messages.actions.ts`

### Impact

Eliminates redundant backend calls for data that changes infrequently. Each reference data endpoint is called at most once per 5 minutes instead of on every page load.

### Verification

- Reference data displays correctly on all pages
- Editing a status/type/category in admin → changes appear within 5 minutes (or immediately if `revalidateTag` is wired up)
- No stale data issues in forms or filters

---

## Implementation Order

1. **Fix 1** (Categories N+1) — highest impact, single file change
2. **Fix 2** (Admin layout cache) — single line change, high impact
3. **Fix 3** (Duplicate fetch) — resolved by Fix 2
4. **Fix 4** (Parallel fetches) — 14 files, mechanical change
5. **Fix 5** (Reference data caching) — multiple files, needs tag invalidation wiring

## Pre-Implementation Checklist

- [ ] Verify backend `/categories/categories` supports `include_subcategories=true` query param
- [ ] Verify `getUserPagesCached` exists and uses `REFERENCE_DATA` preset
- [ ] Identify all admin pages that need Fix 4
- [ ] Identify all reference data action files for Fix 5
- [ ] Identify mutation action files that need `revalidateTag()` calls

## Post-Implementation Verification

- [ ] Categories page loads in <500ms (was ~5s)
- [ ] Admin page navigation is snappy (no blocking layout fetch)
- [ ] All admin pages render correctly
- [ ] Unauthorized users are still redirected
- [ ] Editing reference data still reflects changes
- [ ] No console errors or hydration mismatches
