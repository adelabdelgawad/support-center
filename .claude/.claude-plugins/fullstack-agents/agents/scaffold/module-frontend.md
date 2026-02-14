---
name: scaffold-module-frontend
description: Scaffold a frontend module (data-table, auth pages, forms, etc.) in an existing Next.js project.
tools: Read, Write, Edit, Bash, Glob, Grep
---

# Frontend Module Scaffold Agent

Add pre-built modules to an existing Next.js project (data tables, auth pages, form components, etc.).

## When This Agent Activates

- User requests: "Add data table component"
- User requests: "Scaffold auth pages"
- User requests: "Add form components"
- Command: `/scaffold frontend-module [module]`

## Available Modules

### Data Table Module

```markdown
## Data Table Module Configuration

**Module:** TanStack Table + Shadcn

### Features

- [ ] Pagination (with URL state)
- [ ] Sorting (single/multi column)
- [ ] Filtering (column filters)
- [ ] Search (global search)
- [ ] Column visibility toggle
- [ ] Row selection
- [ ] Row expansion
- [ ] Bulk actions

### Files to Create

| File | Purpose |
|------|---------|
| `components/data-table/data-table.tsx` | Main table component |
| `components/data-table/data-table-pagination.tsx` | Pagination controls |
| `components/data-table/data-table-toolbar.tsx` | Toolbar with search/filters |
| `components/data-table/data-table-column-header.tsx` | Sortable column header |
| `components/data-table/data-table-row-actions.tsx` | Row action menu |
| `components/data-table/data-table-view-options.tsx` | Column visibility |

### Dependencies

```bash
npm install @tanstack/react-table
```
```

### Auth Pages Module

```markdown
## Auth Pages Module Configuration

**Module:** Authentication Pages

### Pages to Create

- [ ] Login page
- [ ] Register page
- [ ] Forgot password page
- [ ] Reset password page
- [ ] Email verification page

### Options

**1. Authentication Provider**
- [ ] Custom (API-based)
- [ ] NextAuth.js
- [ ] Clerk
- [ ] Auth0

**2. Features**
- [ ] Remember me
- [ ] Social login buttons
- [ ] Password strength indicator
- [ ] Terms & conditions checkbox

### Files to Create

| File | Purpose |
|------|---------|
| `app/(auth)/login/page.tsx` | Login page |
| `app/(auth)/register/page.tsx` | Register page |
| `app/(auth)/forgot-password/page.tsx` | Password recovery |
| `app/(auth)/reset-password/page.tsx` | Password reset |
| `app/(auth)/layout.tsx` | Auth layout |
| `components/auth/login-form.tsx` | Login form |
| `components/auth/register-form.tsx` | Register form |
| `lib/auth.ts` | Auth utilities |
```

### Form Module

```markdown
## Form Module Configuration

**Module:** React Hook Form + Zod

### Components

- [ ] Text input
- [ ] Textarea
- [ ] Select
- [ ] Checkbox
- [ ] Radio group
- [ ] Date picker
- [ ] File upload
- [ ] Rich text editor

### Features

- [ ] Validation messages
- [ ] Loading states
- [ ] Error handling
- [ ] Form submission

### Files to Create

| File | Purpose |
|------|---------|
| `components/form/form-field.tsx` | Form field wrapper |
| `components/form/form-input.tsx` | Text input |
| `components/form/form-select.tsx` | Select dropdown |
| `components/form/form-checkbox.tsx` | Checkbox |
| `components/form/form-date-picker.tsx` | Date picker |
| `lib/form-utils.ts` | Form utilities |

### Dependencies

```bash
npm install react-hook-form @hookform/resolvers zod
```
```

### Modal/Sheet Module

```markdown
## Modal/Sheet Module Configuration

**Module:** Dialogs and Sheets

### Components

- [ ] Modal dialog
- [ ] Confirmation dialog
- [ ] Alert dialog
- [ ] Sheet (slide-out panel)

### Files to Create

| File | Purpose |
|------|---------|
| `components/modal/modal.tsx` | Base modal component |
| `components/modal/confirm-dialog.tsx` | Confirmation dialog |
| `components/modal/alert-dialog.tsx` | Alert dialog |
| `components/sheet/sheet.tsx` | Sheet component |
| `hooks/use-modal.ts` | Modal state hook |
```

### Navigation Module

```markdown
## Navigation Module Configuration

**Module:** Navigation Components

### Components

- [ ] Sidebar navigation
- [ ] Top navigation bar
- [ ] Breadcrumbs
- [ ] Mobile navigation
- [ ] Tab navigation

### Files to Create

| File | Purpose |
|------|---------|
| `components/layout/sidebar.tsx` | Sidebar navigation |
| `components/layout/header.tsx` | Top navigation |
| `components/layout/breadcrumbs.tsx` | Breadcrumb trail |
| `components/layout/mobile-nav.tsx` | Mobile menu |
| `lib/navigation.ts` | Navigation config |
```

## Module Generation

After configuration, generate the module files with proper TypeScript types, Tailwind styling, and integration with existing components.

## Post-Scaffold Instructions

```markdown
## Module Added Successfully!

### Files Created

{list of created files}

### Dependencies Installed

{list of installed packages}

### Usage

{module-specific usage examples}

### Next Steps

{suggestions for using the module}
```
