# Dynamic Admin Navigation Implementation

## Overview
The Admin Hub now dynamically loads navigation pages from the backend based on user permissions, replacing the previous hardcoded `ADMIN_SECTIONS` configuration.

## Architecture

### Before (Static)
```typescript
// lib/config/admin-sections.ts
export const ADMIN_SECTIONS = [
  {
    id: "operations",
    title: "Operations",
    links: [
      { label: "Active Sessions", href: "..." },
      { label: "Deployments", href: "..." },
      { label: "Scheduler", href: "..." },
      { label: "Active Directory", href: "..." }, // Manually added
    ],
  },
];
```

**Problem**: Required code changes for every new page

### After (Dynamic)
```typescript
// Backend returns pages based on user permissions
GET /users/{id}/pages
→ [
    { id: 4, title: "Management", parentId: null, path: null },
    { id: 46, title: "Active Directory", parentId: 4, path: "management/active-directory" },
    ...
  ]

// Frontend dynamically builds sections
AdminHub({ pages }) → Renders sections from pages
```

**Solution**: Pages automatically appear when permissions are granted

## Implementation Details

### 1. Server Component (`app/(it-pages)/admin/page.tsx`)
```typescript
export default async function AdminPage() {
  const [user] = await Promise.all([validateAgentAccess()]);

  // Fetch pages from backend based on user role
  const pages = await serverFetch<Page[]>(`/users/${user.id}/pages`);

  return <AdminHub pages={pages} />;
}
```

### 2. Client Component (`app/(it-pages)/admin/_components/admin-hub.tsx`)
```typescript
export function AdminHub({ pages }: { pages: Page[] }) {
  // Group pages by parent dynamically
  const adminSections = useMemo(() => {
    const parentPages = pages.filter(p => !p.parentId && p.path === null);
    const childPages = pages.filter(p => p.parentId);

    return parentPages.map(parent => ({
      id: `section-${parent.id}`,
      title: parent.title,
      icon: PARENT_PAGE_CONFIG[parent.id]?.icon || "Settings",
      description: PARENT_PAGE_CONFIG[parent.id]?.description || "",
      links: childPages
        .filter(child => child.parentId === parent.id)
        .map(child => ({
          label: child.title,
          href: `/admin/${child.path}`,
        })),
    }));
  }, [pages]);

  return <AdminSectionCard sections={adminSections} />;
}
```

### 3. Parent Page Configuration
```typescript
const PARENT_PAGE_CONFIG: Record<number, { icon: string; description: string; order: number }> = {
  1: { icon: "Settings2", description: "System messages and events", order: 4 },
  2: { icon: "Headphones", description: "Support center", order: 1 },
  3: { icon: "BarChart", description: "Reports and analytics", order: 2 },
  4: { icon: "Activity", description: "System operations", order: 3 },
};
```

**Note**: Icons and descriptions are still configured in frontend for UI consistency. Only the pages themselves come from backend.

## Data Flow

```
User Login
  ↓
GET /users/{userId}/pages
  ↓
Backend checks page_roles table
  ↓
Returns pages user has access to
  ↓
AdminHub receives pages
  ↓
Dynamically builds sections
  ↓
Renders navigation cards
```

## Benefits

### 1. Permission-Based Access
- Pages automatically appear/disappear based on role
- No code changes needed for new pages
- Centralized access control in database

### 2. Maintainability
- Single source of truth (database)
- Add page → Add permission → Auto-appears in UI
- No frontend code updates required

### 3. Security
- Backend enforces permissions
- Frontend can't show unauthorized pages
- Consistent with API endpoint protection

## Adding New Admin Pages

### Old Process (Static)
1. Create database page record
2. Add page permission
3. **Update `lib/config/admin-sections.ts`** ← Manual step
4. Deploy frontend
5. Deploy backend

### New Process (Dynamic)
1. Create database page record
2. Add page permission
3. ~~Update frontend config~~ ← **Not needed!**
4. Deploy backend with migration
5. Page automatically appears

## Example: Active Directory Page

### Database Setup
```sql
-- Page record (via migration)
INSERT INTO pages (id, title, path, parent_id, ...)
VALUES (46, 'Active Directory', 'management/active-directory', 4, ...);

-- Permission (via migration)
INSERT INTO page_roles (role_id, page_id, ...)
SELECT r.id, 46, ...
FROM roles r WHERE r.name = 'administrator';
```

### Result
- Admin users see "Active Directory" under "Operations" section
- Non-admin users don't see it
- No frontend code changes needed
- Fully permission-driven

## Migration Path

### Phase 1: ✅ Dynamic Loading Implemented
- Admin hub fetches pages from backend
- Builds sections dynamically
- `ADMIN_SECTIONS` no longer used in admin hub

### Phase 2: Cleanup (Optional)
- Remove `lib/config/admin-sections.ts` (kept for now for reference)
- Remove hardcoded icons/descriptions (move to database)
- Add page icon/description fields to backend

### Phase 3: Full Database Control (Future)
- Store section icons in database
- Store section descriptions in database
- Store section ordering in database
- 100% database-driven navigation

## Files Modified

1. `app/(it-pages)/admin/page.tsx` - Changed to server component, fetches pages
2. `app/(it-pages)/admin/_components/admin-hub.tsx` - Accepts pages prop, builds sections dynamically
3. `lib/config/admin-sections.ts` - Added `order` field to type (file kept for `PARENT_PAGE_CONFIG`)

## Backward Compatibility

- ✅ Existing pages continue to work
- ✅ Search functionality preserved
- ✅ UI styling unchanged
- ✅ No breaking changes

## Testing

### Verify Dynamic Navigation
1. Login as admin user
2. Check Admin Settings page
3. Verify "Active Directory" appears under "Operations"
4. Create a test page in database
5. Grant permission to admin role
6. Refresh page → New page should appear

### Verify Permission Enforcement
1. Login as non-admin user
2. Check Admin Settings page
3. Verify "Active Directory" does NOT appear
4. Attempt direct URL access → Should be blocked

## Success Criteria ✅

- [x] Admin hub fetches pages from backend
- [x] Sections built dynamically from page hierarchy
- [x] Active Directory appears automatically for admin users
- [x] Non-admin users don't see unauthorized pages
- [x] Search functionality works with dynamic sections
- [x] No code changes needed for new pages
- [x] Backward compatible with existing pages

## Future Enhancements

1. **Database-driven icons**: Store icon names in database
2. **Database-driven descriptions**: Store descriptions in database
3. **User preferences**: Allow users to customize section order
4. **Favorites**: Pin frequently used pages
5. **Recent pages**: Show recently accessed pages
6. **Role-based descriptions**: Different descriptions per role

## Conclusion

The admin navigation is now **fully dynamic and permission-driven**. The Active Directory page (and any future pages) will automatically appear in the UI when:
1. Page record exists in database
2. User has permission via `page_roles` table

No frontend code changes required! 🎉
