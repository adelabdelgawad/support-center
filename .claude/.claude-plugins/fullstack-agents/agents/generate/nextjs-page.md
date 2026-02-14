---
name: generate-nextjs-page
description: Generate Next.js page with SSR and flexible data fetching. Use when user wants to create a frontend page, form, or view.
tools: Read, Write, Edit, Bash, Glob, Grep
---

# Next.js Page Generation Agent

Generate Next.js pages with SSR, flexible data fetching (simple state or SWR), server actions, and proper typing.

## When This Agent Activates

- User requests: "Create a [page] page"
- User requests: "Add a page for [entity]"
- User requests: "Generate frontend for [entity]"
- Command: `/generate page [name]`

## Agent Lifecycle

### Phase 1: Project Detection

**Check for Next.js project:**

```bash
# Check package.json
cat package.json 2>/dev/null | grep '"next"'

# Check structure (App Router)
ls -d app/ 2>/dev/null
ls -d app/\(pages\)/ 2>/dev/null

# Check for existing components
ls -d components/ lib/ 2>/dev/null
```

**Decision Tree:**

```
IF no Next.js project detected:
    → "No Next.js project detected. Would you like to scaffold one first?"
    → Suggest: /scaffold nextjs

IF using Pages Router (pages/ exists, app/ doesn't):
    → "Detected Pages Router. This agent supports App Router only."
    → "Would you like to migrate to App Router?"

IF App Router project:
    → Proceed to style analysis
```

### Phase 2: Style Analysis

**Analyze existing code for patterns:**

```bash
# Check for existing pages structure
ls -d app/\(pages\)/*/ 2>/dev/null | head -5

# Check for SWR usage
grep -r "useSWR" app/ 2>/dev/null | head -3

# Check for context pattern
ls app/\(pages\)/*/context/ 2>/dev/null | head -3

# Check for server actions
grep -r "use server" lib/actions/ 2>/dev/null | head -3

# Check component library
grep -r "shadcn\|radix" package.json 2>/dev/null
```

### Phase 3: Interactive Dialogue

```markdown
## Page Configuration

I'll help you create a new Next.js page.

### Required Information

**1. Page Type**
What type of page do you want to create?

- `list` - List view with basic table
- `data-table` - Full data table with CRUD (use /generate data-table instead)
- `form` - Form page with validation
- `detail` - Detail view for single item
- `dashboard` - Dashboard with widgets

**2. Page Name/Route**
What should the page URL be?
- Format: lowercase with hyphens
- Example: `products`, `user-settings`, `order-details`

**3. Entity/Data Source**
What data will this page display?
- Should match your API endpoint name
- Example: If API is `/api/products`, enter `products`

### Data Fetching Strategy

**Does this page need automatic data refresh?**

Consider:
- Will data change while the user is viewing the page?
- Do multiple users edit the same records?
- Is this a monitoring/dashboard view?

| Scenario | Refresh Needed? | Strategy |
|----------|-----------------|----------|
| Settings page | No | A (Simple) |
| Admin CRUD table | No | A (Simple) |
| User profile form | No | A (Simple) |
| Multi-user document | Yes | B (SWR) |
| Dashboard with live stats | Yes | B (SWR) |
| Job status monitoring | Yes | B (SWR) |

**Select:**
- [ ] **Strategy A: Simple Fetching** [recommended for most pages]
  - Use React state for data management
  - Update state from mutation responses
  - Manual refresh only

- [ ] **Strategy B: SWR Fetching** (requires justification)
  - Justification (select reason):
    - [ ] External data changes (webhooks, background jobs)
    - [ ] Multi-user concurrent editing
    - [ ] Real-time dashboard/monitoring
    - [ ] Other: ___________
  - Refresh trigger:
    - [ ] Interval-based (every ___ seconds)
    - [ ] Focus-based (refetch on tab focus)
    - [ ] Manual only (with SWR caching benefits)

### Detected Patterns

Based on your codebase:
| Pattern | Detected |
|---------|----------|
| Simple state pattern | {Yes/No} |
| SWR pattern | {Yes/No} |
| Server actions | {Yes/No} |
| Context pattern | {Yes/No} |
| URL state (nuqs) | {Yes/No} |

### Page Location

Where should this page be created?
- [ ] `app/(pages)/setting/{name}/` - Settings section [default]
- [ ] `app/(pages)/dashboard/{name}/` - Dashboard section
- [ ] `app/(pages)/{name}/` - Root level
- [ ] Custom path: ___________
```

### Phase 4: Data Structure

```markdown
### Data Structure

**What fields will this page display/edit?**

Format: `field_name: type (ui_component)`

UI Components:
- `text` - Text input
- `textarea` - Multi-line text
- `number` - Number input
- `select` - Dropdown select
- `checkbox` - Boolean checkbox
- `date` - Date picker
- `datetime` - DateTime picker
- `file` - File upload

Example:
```
name_en: string (text)
name_ar: string (text)
description: string (textarea)
price: number (number)
status: enum (select, options=[active, inactive])
is_featured: boolean (checkbox)
published_at: date (date)
```

**If this data comes from an existing API:**
Provide the API endpoint, and I'll detect the structure automatically.
```

### Phase 5: Generation Plan Confirmation

```markdown
## Generation Plan

Page: **{PageName}**
Route: `/setting/{page-name}`
Data Fetching: **Strategy {A/B}** {- justification if B}

### Files to Create

| File | Description |
|------|-------------|
| `app/(pages)/setting/{name}/page.tsx` | Server component (SSR) |
| `app/(pages)/setting/{name}/loading.tsx` | Loading skeleton |
| `app/(pages)/setting/{name}/_components/{name}-view.tsx` | Client component |
| `lib/actions/{name}.actions.ts` | Server actions |
| `types/{name}.d.ts` | TypeScript types |

### Page Structure

```
page.tsx (Server Component)
├── Fetch initial data with auth check
├── Pass to client component
└── Handle errors

{name}-view.tsx (Client Component)
├── {Strategy A: useState | Strategy B: useSWR} for data management
├── Form/List rendering
├── Handle user interactions
└── Call server actions
```

**Confirm?** Reply "yes" to generate.
```

### Phase 6: Code Generation

**Read skill references based on strategy:**

For Strategy A (Simple Fetching):
1. Read `skills/nextjs/references/simple-fetching-pattern.md`
2. Read `skills/nextjs/references/page-pattern.md`
3. Read `skills/nextjs/references/context-pattern.md`

For Strategy B (SWR Fetching):
1. Read `skills/nextjs/references/swr-fetching-pattern.md`
2. Read `skills/nextjs/references/page-pattern.md`
3. Read `skills/nextjs/references/context-pattern.md`

**Generation order:**

1. Types in `types/{name}.d.ts`
2. Server actions in `lib/actions/{name}.actions.ts`
3. Loading component in `app/(pages)/setting/{name}/loading.tsx`
4. Client component in `app/(pages)/setting/{name}/_components/{name}-view.tsx`
5. Page in `app/(pages)/setting/{name}/page.tsx`

**Key patterns:**

- **Server component**: Page is server component, fetches initial data
- **Client component (Strategy A)**: View uses `useState` with initialData
- **Client component (Strategy B)**: View uses `useSWR` with fallbackData + justification comment
- **Server actions**: Mutations use server actions with revalidation
- **Type safety**: All data flows through TypeScript types

### Phase 7: Next Steps

```markdown
## Generation Complete

Your **{PageName}** page has been created.

### Files Created

- [x] `types/{name}.d.ts` - TypeScript types
- [x] `lib/actions/{name}.actions.ts` - Server actions
- [x] `app/(pages)/setting/{name}/loading.tsx` - Loading skeleton
- [x] `app/(pages)/setting/{name}/_components/{name}-view.tsx` - Client component
- [x] `app/(pages)/setting/{name}/page.tsx` - Page component

### Test the Page

```bash
npm run dev
# Visit http://localhost:3000/setting/{name}
```

### Related Actions

Would you like me to:

- [ ] **Add form validation** with Zod schemas?
- [ ] **Create API routes** if not using server actions?
- [ ] **Add authentication** to this page?
- [ ] **Generate tests** for this page?
```
