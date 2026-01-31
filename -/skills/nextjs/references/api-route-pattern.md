# API Route Pattern Reference

Next.js API routes that proxy requests to FastAPI backend with authentication.

## RECOMMENDED: Route Factory Pattern

Use route factories to eliminate boilerplate:

```typescript
// app/api/setting/items/route.ts
import { createCollectionRoutes } from "@/lib/fetch/route-factory";
export const { GET, POST } = createCollectionRoutes('/setting/items/');

// app/api/setting/items/[itemId]/route.ts
import { createResourceRoutes } from "@/lib/fetch/route-factory";
export const { GET, PUT, DELETE } = createResourceRoutes('/setting/items/', 'itemId');

// app/api/setting/items/[itemId]/status/route.ts
import { createStatusRoute } from "@/lib/fetch/route-factory";
export const { PUT } = createStatusRoute('/setting/items/', 'itemId');
```

---

## Manual Pattern (Legacy)

Use only when route factories don't cover your use case.

## Key Principles

1. **withAuth wrapper** - Handle authentication and errors
2. **Backend helpers** - backendGet/Post/Put/Delete
3. **Pass query params** - Forward search params to backend
4. **JSON responses** - Consistent error format

## Basic Route Structure

```tsx
// app/api/setting/items/route.ts
import { NextRequest } from "next/server";
import { withAuth, backendGet, backendPost } from "@/lib/fetch/api-route-helper";

/**
 * GET /api/setting/items
 * List items with pagination and filtering
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams.toString();
  return withAuth(token => 
    backendGet(`/setting/items/?${params}`, token)
  );
}

/**
 * POST /api/setting/items
 * Create a new item
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  return withAuth(token => 
    backendPost('/setting/items/', token, body)
  );
}
```

## Dynamic Route with ID

```tsx
// app/api/setting/items/[itemId]/route.ts
import { NextRequest } from "next/server";
import { withAuth, backendGet, backendPut, backendDelete } from "@/lib/fetch/api-route-helper";

interface RouteParams {
  params: Promise<{ itemId: string }>;
}

/**
 * GET /api/setting/items/:itemId
 * Get single item by ID
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { itemId } = await params;
  return withAuth(token => 
    backendGet(`/setting/items/${itemId}`, token)
  );
}

/**
 * PUT /api/setting/items/:itemId
 * Update item
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { itemId } = await params;
  const body = await request.json();
  return withAuth(token => 
    backendPut(`/setting/items/${itemId}`, token, body)
  );
}

/**
 * DELETE /api/setting/items/:itemId
 * Delete item
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { itemId } = await params;
  return withAuth(token => 
    backendDelete(`/setting/items/${itemId}`, token)
  );
}
```

## Status Toggle Route

```tsx
// app/api/setting/items/[itemId]/status/route.ts
import { NextRequest } from "next/server";
import { withAuth, backendPut } from "@/lib/fetch/api-route-helper";

interface RouteParams {
  params: Promise<{ itemId: string }>;
}

/**
 * PUT /api/setting/items/:itemId/status
 * Toggle item active status
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { itemId } = await params;
  const body = await request.json();
  return withAuth(token => 
    backendPut(`/setting/items/${itemId}/status`, token, body)
  );
}
```

## Bulk Operations Route

```tsx
// app/api/setting/items/status/route.ts
import { NextRequest } from "next/server";
import { withAuth, backendPut } from "@/lib/fetch/api-route-helper";

/**
 * PUT /api/setting/items/status
 * Bulk update item status
 * Body: { ids: string[], is_active: boolean }
 */
export async function PUT(request: NextRequest) {
  const body = await request.json();
  return withAuth(token => 
    backendPut('/setting/items/status', token, body)
  );
}
```

## The withAuth Helper

```tsx
// lib/fetch/api-route-helper.ts
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/server-auth';
import { backendFetch } from './server';
import { ApiError } from './errors';

/**
 * Wrap API route with authentication and error handling
 */
export async function withAuth<T>(
  handler: (token: string) => Promise<T>
): Promise<NextResponse> {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.accessToken) {
      return NextResponse.json(
        { detail: 'Unauthorized' }, 
        { status: 401 }
      );
    }

    // Execute handler with token
    const data = await handler(session.accessToken);
    return NextResponse.json(data);
    
  } catch (error) {
    // Handle API errors
    if (error instanceof ApiError) {
      return NextResponse.json(
        { 
          detail: error.message, 
          ...(error.data && typeof error.data === 'object' ? error.data : {}) 
        },
        { status: error.status }
      );
    }
    
    // Log and return generic error
    console.error('API route error:', error);
    return NextResponse.json(
      { detail: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

## Backend Helper Functions

```tsx
// lib/fetch/api-route-helper.ts (continued)
import { backendFetch } from './server';
import type { FetchOptions } from './types';

/**
 * GET request to backend
 */
export function backendGet<T>(
  url: string, 
  token: string, 
  opts?: FetchOptions
): Promise<T> {
  return backendFetch<T>(url, token, { ...opts, method: 'GET' });
}

/**
 * POST request to backend
 */
export function backendPost<T>(
  url: string, 
  token: string, 
  body: unknown, 
  opts?: FetchOptions
): Promise<T> {
  return backendFetch<T>(url, token, { ...opts, method: 'POST', body });
}

/**
 * PUT request to backend
 */
export function backendPut<T>(
  url: string, 
  token: string, 
  body: unknown, 
  opts?: FetchOptions
): Promise<T> {
  return backendFetch<T>(url, token, { ...opts, method: 'PUT', body });
}

/**
 * PATCH request to backend
 */
export function backendPatch<T>(
  url: string, 
  token: string, 
  body: unknown, 
  opts?: FetchOptions
): Promise<T> {
  return backendFetch<T>(url, token, { ...opts, method: 'PATCH', body });
}

/**
 * DELETE request to backend
 */
export function backendDelete<T>(
  url: string, 
  token: string, 
  opts?: FetchOptions
): Promise<T> {
  return backendFetch<T>(url, token, { ...opts, method: 'DELETE' });
}
```

## Nested Dynamic Routes

```tsx
// app/api/network/switch/[switchId]/interfaces/[interfaceName]/vlan/route.ts
import { NextRequest } from "next/server";
import { withAuth, backendPut } from "@/lib/fetch/api-route-helper";

interface RouteParams {
  params: Promise<{ 
    switchId: string; 
    interfaceName: string; 
  }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { switchId, interfaceName } = await params;
  const body = await request.json();
  
  return withAuth(token => 
    backendPut(
      `/network/switch/${switchId}/interfaces/${interfaceName}/vlan`, 
      token, 
      body
    )
  );
}
```

## Route with Query Parameters

```tsx
// app/api/setting/items/search/route.ts
import { NextRequest } from "next/server";
import { withAuth, backendGet } from "@/lib/fetch/api-route-helper";

export async function GET(request: NextRequest) {
  // Forward all query parameters
  const params = request.nextUrl.searchParams.toString();
  
  // Or extract specific params
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q') || '';
  const limit = searchParams.get('limit') || '10';
  
  return withAuth(token => 
    backendGet(`/setting/items/search?q=${query}&limit=${limit}`, token)
  );
}
```

## Route Directory Structure

```
app/api/setting/items/
├── route.ts                    # GET (list), POST (create)
├── status/
│   └── route.ts               # PUT (bulk status update)
├── counts/
│   └── route.ts               # GET (counts for dashboard)
└── [itemId]/
    ├── route.ts               # GET, PUT, DELETE (single item)
    └── status/
        └── route.ts           # PUT (toggle status)
```

## Key Points

1. **withAuth wrapper** - Always use for authenticated routes
2. **await params** - Next.js 15+ requires awaiting route params
3. **Forward query params** - Pass through to backend
4. **Consistent error format** - `{ detail: "message" }`
5. **Type-safe responses** - Use generics with backend helpers
6. **RESTful structure** - Follow REST conventions
