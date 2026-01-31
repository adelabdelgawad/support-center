# API Route Helper Pattern Reference

Wrappers for Next.js API routes that proxy to FastAPI backend with authentication.

## withAuth Helper

```typescript
// lib/fetch/api-route-helper.ts
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/server-auth';
import { backendFetch } from './server';
import { ApiError } from './errors';
import type { FetchOptions } from './types';

/**
 * Wrap API route with authentication and error handling
 * Extracts token from session and passes to handler
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

/**
 * Backend helper functions for common HTTP methods
 */
export function backendGet<T>(
  url: string, 
  token: string, 
  opts?: FetchOptions
): Promise<T> {
  return backendFetch<T>(url, token, { ...opts, method: 'GET' });
}

export function backendPost<T>(
  url: string, 
  token: string, 
  body: unknown, 
  opts?: FetchOptions
): Promise<T> {
  return backendFetch<T>(url, token, { ...opts, method: 'POST', body });
}

export function backendPut<T>(
  url: string, 
  token: string, 
  body: unknown, 
  opts?: FetchOptions
): Promise<T> {
  return backendFetch<T>(url, token, { ...opts, method: 'PUT', body });
}

export function backendPatch<T>(
  url: string, 
  token: string, 
  body: unknown, 
  opts?: FetchOptions
): Promise<T> {
  return backendFetch<T>(url, token, { ...opts, method: 'PATCH', body });
}

export function backendDelete<T>(
  url: string, 
  token: string, 
  opts?: FetchOptions
): Promise<T> {
  return backendFetch<T>(url, token, { ...opts, method: 'DELETE' });
}
```

## Basic API Route Pattern

```typescript
// app/api/setting/users/route.ts
import { NextRequest } from "next/server";
import { withAuth, backendGet, backendPost } from "@/lib/fetch/api-route-helper";

/**
 * GET /api/setting/users
 * List users with pagination and filtering
 */
export async function GET(request: NextRequest) {
  // Forward query parameters to backend
  const params = request.nextUrl.searchParams.toString();
  return withAuth(token => 
    backendGet(`/setting/users/?${params}`, token)
  );
}

/**
 * POST /api/setting/users
 * Create a new user
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  return withAuth(token => 
    backendPost('/setting/users/', token, body)
  );
}
```

## Dynamic Route Pattern

```typescript
// app/api/setting/users/[userId]/route.ts
import { NextRequest } from "next/server";
import { withAuth, backendGet, backendPut, backendDelete } from "@/lib/fetch/api-route-helper";

interface RouteParams {
  params: Promise<{ userId: string }>;
}

/**
 * GET /api/setting/users/:userId
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { userId } = await params;  // Next.js 15+ requires await
  return withAuth(token => 
    backendGet(`/setting/users/${userId}`, token)
  );
}

/**
 * PUT /api/setting/users/:userId
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { userId } = await params;
  const body = await request.json();
  return withAuth(token => 
    backendPut(`/setting/users/${userId}`, token, body)
  );
}

/**
 * DELETE /api/setting/users/:userId
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { userId } = await params;
  return withAuth(token => 
    backendDelete(`/setting/users/${userId}`, token)
  );
}
```

## Nested Dynamic Route

```typescript
// app/api/setting/users/[userId]/status/route.ts
import { NextRequest } from "next/server";
import { withAuth, backendPut } from "@/lib/fetch/api-route-helper";

interface RouteParams {
  params: Promise<{ userId: string }>;
}

/**
 * PUT /api/setting/users/:userId/status
 * Toggle user active status
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { userId } = await params;
  const body = await request.json();
  return withAuth(token => 
    backendPut(`/setting/users/${userId}/status`, token, body)
  );
}
```

## Bulk Operations Route

```typescript
// app/api/setting/users/status/route.ts
import { NextRequest } from "next/server";
import { withAuth, backendPut } from "@/lib/fetch/api-route-helper";

/**
 * PUT /api/setting/users/status
 * Bulk update user status
 * Body: { ids: string[], is_active: boolean }
 */
export async function PUT(request: NextRequest) {
  const body = await request.json();
  return withAuth(token => 
    backendPut('/setting/users/status', token, body)
  );
}
```

## Without Authentication

```typescript
// app/api/public/health/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ status: "healthy" });
}
```

## Custom Error Handling

```typescript
// app/api/setting/users/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server-auth";
import { backendGet } from "@/lib/fetch/api-route-helper";
import { ApiError } from "@/lib/fetch/errors";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.accessToken) {
      return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
    }

    const params = request.nextUrl.searchParams.toString();
    const data = await backendGet(`/setting/users/?${params}`, session.accessToken);
    
    // Custom transformation
    return NextResponse.json({
      ...data,
      fetchedAt: new Date().toISOString(),
    });
    
  } catch (error) {
    if (error instanceof ApiError) {
      // Custom error response
      return NextResponse.json({
        error: error.message,
        code: error.status,
        timestamp: new Date().toISOString(),
      }, { status: error.status });
    }
    
    return NextResponse.json({ detail: 'Internal error' }, { status: 500 });
  }
}
```

## Route Directory Structure

```
app/api/
├── setting/
│   └── users/
│       ├── route.ts                    # GET (list), POST (create)
│       ├── status/
│       │   └── route.ts               # PUT (bulk status)
│       └── [userId]/
│           ├── route.ts               # GET, PUT, DELETE
│           └── status/
│               └── route.ts           # PUT (toggle)
├── public/
│   └── health/
│       └── route.ts                   # GET (no auth)
└── auth/
    ├── login/
    │   └── route.ts
    └── refresh/
        └── route.ts
```

## Key Patterns

1. **withAuth wrapper** - Always use for authenticated routes
2. **await params** - Required in Next.js 15+
3. **Forward query params** - Pass through to backend
4. **Consistent errors** - `{ detail: "message" }` format
5. **Type-safe** - Use generics with backend helpers
6. **RESTful** - Follow REST conventions
