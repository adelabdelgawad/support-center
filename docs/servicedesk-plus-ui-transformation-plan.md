# ServiceDesk Plus UI Transformation Plan

## Overview

Transform the it-app from Microsoft Fluent Design with vertical sidebar to ManageEngine ServiceDesk Plus appearance with horizontal top navigation, admin hub, and updated color scheme.

## Current State
- **Navigation**: Vertical sidebar (`SidebarProvider`, `SidebarNavWrapper`)
- **Theme**: Microsoft Fluent (blue #0078d4)
- **Admin Pages**: 11 under `/setting/`, 4 under `/management/`
- **Layout File**: `/src/it-app/app/(it-pages)/layout.tsx`

## Target State
- **Navigation**: Horizontal top bar (Home | Requests | Reports) + Admin gear icon
- **Theme**: ServiceDesk Plus (dark header #292929, teal accent #00a1b0)
- **Admin**: Card-based hub at `/admin` with left sidebar on sub-pages
- **Routes**: `/setting/*` and `/management/*` moved under `/admin/*`

---

## Phase 1: Color Scheme & CSS Variables

**File**: `/src/it-app/app/globals.css`

Add ServiceDesk Plus color system:
```css
:root {
  /* ServiceDesk Header */
  --sdp-header-bg: #292929;
  --sdp-header-fg: #ffffff;

  /* ServiceDesk Accent (Teal) */
  --sdp-accent: #00a1b0;
  --sdp-accent-hover: #008a98;

  /* ServiceDesk Content */
  --sdp-content-bg: #f7f7f7;
  --sdp-card-bg: #ffffff;

  /* ServiceDesk Admin Card */
  --sdp-admin-card-title: #00a1b0;
  --sdp-admin-card-link: #666666;
  --sdp-admin-card-link-hover: #00a1b0;
}
```

---

## Phase 2: Horizontal Navigation Component

### 2.1 Create TopBar Component
**New File**: `/src/it-app/components/navbar/horizontal-topbar.tsx`

```
┌─────────────────────────────────────────────────────────────────┐
│ [Logo]  Home | Requests | Reports           [🔔] [⚙️] [Avatar] │
└─────────────────────────────────────────────────────────────────┘
```

- Dark background (#292929)
- Fixed height: 48px
- Logo/brand on left
- Nav links (Home, Requests, Reports) in center-left
- User actions on right: notifications, admin gear (admin-only), avatar dropdown

### 2.2 Create TopBar Sub-components
**New Files**:
- `/src/it-app/components/navbar/topbar-nav-links.tsx` - Navigation links
- `/src/it-app/components/navbar/topbar-user-actions.tsx` - Right-side actions
- `/src/it-app/components/navbar/topbar-admin-gear.tsx` - Admin gear icon (conditional)

### 2.3 Navigation Links Config
```typescript
const navLinks = [
  { label: 'Home', href: '/', icon: 'Home' },
  { label: 'Requests', href: '/support-center/requests', icon: 'Ticket' },
  { label: 'Reports', href: '/reports', icon: 'BarChart' },
];
```

---

## Phase 3: Admin Hub Page

### 3.1 Admin Landing Page
**New File**: `/src/it-app/app/(it-pages)/admin/page.tsx`

Card-based hub with categorized sections:

```
┌─────────────────────────────────────────────────────────────────┐
│ Admin Settings    [🔍 Search...]                                │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│ │ 👥 Users &      │  │ ⚙️ Service      │  │ 🏢 Business     │  │
│ │ Permissions     │  │ Configuration   │  │ Structure       │  │
│ │ Users | Roles   │  │ Categories |    │  │ Business Units  │  │
│ │                 │  │ Request Types | │  │ Regions         │  │
│ │                 │  │ Statuses | SLA  │  │                 │  │
│ └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│ ┌─────────────────┐  ┌─────────────────┐                       │
│ │ 🔧 System       │  │ 📊 Operations   │                       │
│ │ Settings        │  │                 │                       │
│ │ Messages |      │  │ Active Sessions │                       │
│ │ Events |        │  │ Deployments |   │                       │
│ │ Client Versions │  │ Scheduler       │                       │
│ └─────────────────┘  └─────────────────┘                       │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Admin Sections Mapping

| Section | Pages |
|---------|-------|
| **Users & Permissions** | Users, Roles |
| **Service Configuration** | Categories, Request Types, Request Statuses, SLA Configs |
| **Business Structure** | Business Units, Business Unit Regions |
| **System Settings** | System Messages, System Events, Client Versions |
| **Operations** | Active Sessions, Deployments, Scheduler |

### 3.3 Admin Hub Client Component
**New File**: `/src/it-app/app/(it-pages)/admin/_components/admin-hub.tsx`

- Grid of cards (responsive: 1-4 columns)
- Each card: icon, title (teal), list of links
- Search bar filters cards/links
- Links use teal color on hover

---

## Phase 4: Admin Layout with Left Sidebar

### 4.1 Admin Layout
**New File**: `/src/it-app/app/(it-pages)/admin/layout.tsx`

```
┌────────────────────────────────────────────────────────────────┐
│ [TopBar - same as main app]                                    │
├──────────────┬─────────────────────────────────────────────────┤
│ Left Sidebar │ Main Content                                    │
│ ─────────────│─────────────────────────────────────────────────│
│ [Search]     │ Breadcrumb: Admin > Users & Permissions > Users │
│              │ ───────────────────────────────────────────────  │
│ ▼ Users &    │                                                 │
│   Permission │ [Existing page content unchanged]               │
│   • Users    │                                                 │
│   • Roles    │                                                 │
│              │                                                 │
│ ▼ Service    │                                                 │
│   Config     │                                                 │
│   • Categor..│                                                 │
│   • Request..│                                                 │
│              │                                                 │
│ ▼ Business   │                                                 │
│   Structure  │                                                 │
│              │                                                 │
│ ▼ System     │                                                 │
│   Settings   │                                                 │
│              │                                                 │
│ ▼ Operations │                                                 │
└──────────────┴─────────────────────────────────────────────────┘
```

### 4.2 Admin Left Sidebar Component
**New File**: `/src/it-app/components/admin/admin-left-sidebar.tsx`

- Width: 240px (collapsible on mobile)
- Search box at top
- Collapsible sections matching admin hub categories
- Active state highlighting (teal background)
- Hover effects

### 4.3 Admin Breadcrumb Component
**New File**: `/src/it-app/components/admin/admin-breadcrumb.tsx`

- Shows: Admin > Section > Page
- Clickable links

---

## Phase 5: Route Restructuring

### 5.1 Move Pages Under /admin

**Directory Structure**:
```
app/(it-pages)/admin/
├── page.tsx                    # Admin hub
├── layout.tsx                  # Admin layout with left sidebar
├── setting/
│   ├── users/                  # Move from /setting/users
│   ├── roles/                  # Move from /setting/roles
│   ├── categories/
│   ├── request-types/
│   ├── request-statuses/
│   ├── sla-configs/
│   ├── business-units/
│   ├── business-unit-regions/
│   ├── system-messages/
│   ├── system-events/
│   └── client-versions/
└── management/
    ├── active-sessions/        # Move from /management/active-sessions
    ├── deployments/
    └── scheduler/
```

### 5.2 Add Redirects
**File**: `/src/it-app/next.config.ts`

```typescript
async redirects() {
  return [
    { source: '/setting/:path*', destination: '/admin/setting/:path*', permanent: true },
    { source: '/management/:path*', destination: '/admin/management/:path*', permanent: true },
  ];
}
```

---

## Phase 6: Update Main Layout

**File**: `/src/it-app/app/(it-pages)/layout.tsx`

Replace:
```tsx
<SidebarProvider>
  <SidebarNavWrapper ... />
  <SidebarInset>
    <header>...</header>
    <main>{children}</main>
  </SidebarInset>
</SidebarProvider>
```

With:
```tsx
<div className="h-svh flex flex-col">
  <HorizontalTopbar user={user} />
  <main className="flex-1 overflow-auto bg-[var(--sdp-content-bg)]">
    {children}
  </main>
</div>
```

---

## Phase 7: Admin Authorization

### 7.1 Server-side Validation
**New File**: `/src/it-app/lib/actions/validate-admin-access.actions.ts`

```typescript
export async function validateAdminAccess(): Promise<void> {
  const user = await getCurrentUser();
  const isTechnician = user?.isTechnician || user?.is_technician ||
                       user?.isSuperAdmin || user?.is_super_admin;

  if (!isTechnician) {
    redirect('/unauthorized?reason=not_admin');
  }
}
```

### 7.2 Admin Gear Visibility
Only show gear icon if `user.isTechnician` or `user.isSuperAdmin`

---

## Files to Create

| File | Purpose |
|------|---------|
| `components/navbar/horizontal-topbar.tsx` | Main top navigation bar |
| `components/navbar/topbar-nav-links.tsx` | Navigation links component |
| `components/navbar/topbar-user-actions.tsx` | User actions (notifications, avatar) |
| `components/navbar/topbar-admin-gear.tsx` | Admin gear icon |
| `components/admin/admin-left-sidebar.tsx` | Admin page left sidebar |
| `components/admin/admin-breadcrumb.tsx` | Admin breadcrumb navigation |
| `components/admin/admin-section-card.tsx` | Admin hub card component |
| `app/(it-pages)/admin/page.tsx` | Admin hub landing page |
| `app/(it-pages)/admin/layout.tsx` | Admin layout with sidebar |
| `app/(it-pages)/admin/_components/admin-hub.tsx` | Admin hub client component |
| `lib/actions/validate-admin-access.actions.ts` | Admin access validation |
| `lib/config/admin-sections.ts` | Admin sections configuration |

## Files to Modify

| File | Changes |
|------|---------|
| `app/globals.css` | Add ServiceDesk Plus CSS variables |
| `app/(it-pages)/layout.tsx` | Replace sidebar with horizontal topbar |
| `next.config.ts` | Add redirects for old routes |

## Files to Move

| From | To |
|------|-----|
| `app/(it-pages)/setting/*` | `app/(it-pages)/admin/setting/*` |
| `app/(it-pages)/management/*` | `app/(it-pages)/admin/management/*` |

---

## Implementation Order

1. **Phase 1**: CSS variables (no breaking changes)
2. **Phase 2**: Create horizontal topbar components (parallel development)
3. **Phase 3**: Create admin hub page and components
4. **Phase 4**: Create admin layout with left sidebar
5. **Phase 5**: Move routes under /admin + add redirects
6. **Phase 6**: Switch main layout to horizontal nav (breaking change)
7. **Phase 7**: Add admin authorization

---

## Verification Checklist

- [ ] Horizontal nav shows Home | Requests | Reports
- [ ] Admin gear icon visible only to technicians/admins
- [ ] Admin gear navigates to /admin hub
- [ ] Admin hub displays categorized cards with correct links
- [ ] Admin sub-pages show left sidebar
- [ ] Active page highlighted in left sidebar
- [ ] Old routes (/setting/*, /management/*) redirect to new routes
- [ ] All existing page functionality preserved
- [ ] Dark header with correct colors
- [ ] Mobile responsive (hamburger menu)
- [ ] Non-admin users cannot access /admin routes

---

## Rollback Strategy

Each phase is committed separately with descriptive commit messages. If issues arise:
1. Use `git revert <commit-hash>` to revert specific phase
2. Or `git reset --hard <last-good-commit>` to rollback entirely

**Commit pattern**: `feat(ui): Phase X - [description]`
