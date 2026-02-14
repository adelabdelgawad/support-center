---
name: generate-api-route
description: Generate Next.js API routes that proxy to FastAPI backend using route factories. Use when user needs API routes for frontend-backend communication.
tools: Read, Write, Edit, Bash, Glob, Grep
---

# API Route Generation Agent

Generate Next.js API routes that proxy requests to FastAPI backend using route factory functions for minimal boilerplate.

## When This Agent Activates

- User requests: "Create API routes for [entity]"
- User requests: "Add proxy routes for [entity]"
- Command: `/generate api-route [name]`

## Agent Lifecycle

### Phase 1: Detection

**Check for Next.js and backend:**

```bash
# Check for Next.js
cat package.json 2>/dev/null | grep '"next"'

# Check for existing API routes structure
ls -d app/api/ 2>/dev/null
ls -d app/api/setting/ 2>/dev/null

# Check for route factory
ls lib/fetch/route-factory.ts 2>/dev/null

# Check for fetch utilities
ls lib/fetch/*.ts 2>/dev/null

# Check for backend endpoint
grep -rl "/{entity}" ../backend/api/routers/setting/ 2>/dev/null
```

**Decision Tree:**

```
IF no Next.js project:
    → Suggest: /scaffold nextjs

IF no route factory (lib/fetch/route-factory.ts):
    → "Route factory not found. Would you like me to create it first?"

IF route factory exists:
    → Proceed to dialogue
```

### Phase 2: Interactive Dialogue

```markdown
## API Route Configuration

I'll create Next.js API routes for **{entity}** using the route factory pattern.

### Backend Endpoint

What is the backend API endpoint?
- Default: `/setting/{entities}/`
- Custom: ___________

### Routes to Create

Which routes do you need?

- [x] **Collection routes** (`/api/setting/{entities}`)
  - GET - List with pagination
  - POST - Create new

- [x] **Resource routes** (`/api/setting/{entities}/[id]`)
  - GET - Get single item
  - PUT - Update existing
  - DELETE - Delete

- [ ] **Status route** (`/api/setting/{entities}/[id]/status`)
  - PUT - Toggle active status

- [ ] **Bulk status route** (`/api/setting/{entities}/status`)
  - PUT - Bulk status update

### Additional Options

- [ ] Add bulk endpoints (collection routes with bulk update)
- [ ] Add search endpoint (`/api/setting/{entities}/search`)
- [ ] Add export endpoint (`/api/setting/{entities}/export`)
```

### Phase 3: Generation Plan

```markdown
## Generation Plan

### Route Factory Pattern

This project uses route factory functions that eliminate boilerplate. Each route file is ~3-5 lines instead of 24+.

**Available factories (from `lib/fetch/route-factory.ts`):**
- `createCollectionRoutes(path)` - GET list + POST create
- `createResourceRoutes(path, paramName)` - GET single + PUT update + DELETE
- `createStatusRoute(path, paramName)` - PUT status toggle
- `createCountsRoute(path)` - GET counts/statistics
- `createCollectionRoutesWithBulkUpdate(path)` - GET + POST + PUT bulk

### Files to Create

| File | Factory | Methods | Backend Proxy |
|------|---------|---------|---------------|
| `app/api/setting/{entities}/route.ts` | `createCollectionRoutes` | GET, POST | `/setting/{entities}/` |
| `app/api/setting/{entities}/[id]/route.ts` | `createResourceRoutes` | GET, PUT, DELETE | `/setting/{entities}/{id}` |
| `app/api/setting/{entities}/[id]/status/route.ts` | `createStatusRoute` | PUT | `/setting/{entities}/{id}/status` |

### Code Preview

```typescript
// app/api/setting/{entities}/route.ts (3 lines!)
import { createCollectionRoutes } from "@/lib/fetch/route-factory";

export const { GET, POST } = createCollectionRoutes('/setting/{entities}/');
```

```typescript
// app/api/setting/{entities}/[id]/route.ts (3 lines!)
import { createResourceRoutes } from "@/lib/fetch/route-factory";

export const { GET, PUT, DELETE } = createResourceRoutes('/setting/{entities}/', 'id');
```

```typescript
// app/api/setting/{entities}/[id]/status/route.ts (3 lines!)
import { createStatusRoute } from "@/lib/fetch/route-factory";

export const { PUT } = createStatusRoute('/setting/{entities}/', 'id');
```

### Comparison: Factory vs Manual

**Before (manual, 24+ lines per file):**
```typescript
import { NextRequest } from "next/server";
import { withAuth, backendGet, backendPost } from "@/lib/fetch/api-route-helper";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams.toString();
  return withAuth(token => backendGet(`/setting/{entities}/?${params}`, token));
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  return withAuth(token => backendPost('/setting/{entities}/', token, body));
}
```

**After (factory, 3 lines, 87% reduction):**
```typescript
import { createCollectionRoutes } from "@/lib/fetch/route-factory";

export const { GET, POST } = createCollectionRoutes('/setting/{entities}/');
```

**Confirm?** Reply "yes" to generate.
```

### Phase 4: Code Generation

**Read skill references:**

1. Read `skills/fetch-architecture/references/api-route-helper-pattern.md`
2. Read `lib/fetch/route-factory.ts` for available factory functions

**Generate routes using factories:**

- Use `createCollectionRoutes` for list + create endpoints
- Use `createResourceRoutes` for single item CRUD endpoints
- Use `createStatusRoute` for status toggle endpoints
- Use `createCollectionRoutesWithBulkUpdate` if bulk operations needed

**Generation order:**

1. Collection route (`app/api/setting/{entities}/route.ts`)
2. Resource route (`app/api/setting/{entities}/[id]/route.ts`)
3. Status route (`app/api/setting/{entities}/[id]/status/route.ts`) - if requested
4. Bulk status route (`app/api/setting/{entities}/status/route.ts`) - if requested

**Each file follows this minimal pattern:**

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

### Phase 5: Next Steps

```markdown
## Generation Complete

API routes for **{entities}** created using route factory pattern.

### Files Created

- [x] `app/api/setting/{entities}/route.ts` - Collection routes (GET, POST)
- [x] `app/api/setting/{entities}/[id]/route.ts` - Resource routes (GET, PUT, DELETE)
{If status route}
- [x] `app/api/setting/{entities}/[id]/status/route.ts` - Status toggle (PUT)

### Usage

```typescript
// From client components (using client-axios)
import api from "@/lib/client-axios";

// List with pagination
const response = await api.get('/api/setting/{entities}?page=1&limit=10');

// Create
const response = await api.post('/api/setting/{entities}', data);

// Update
const response = await api.put(`/api/setting/{entities}/${id}`, data);

// Toggle status
const response = await api.put(`/api/setting/{entities}/${id}/status`, { is_active: true });
```

```typescript
// From server actions (using server fetch helpers)
import { serverGet, serverPost } from "@/lib/fetch/server";

const data = await serverGet(`/setting/{entities}/?skip=0&limit=10`);
```

### Related Actions

- [ ] **Generate data table page** that uses these routes?
      → `/generate data-table {entities}`
- [ ] **Generate server actions** for these routes?
- [ ] **Generate TypeScript types** for API responses?
      → Create `lib/types/api/{entity}.ts`
```
