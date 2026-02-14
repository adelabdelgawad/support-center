# Server Fetch Pattern Reference

Server-side fetch utilities for Next.js server actions and API routes.

## Server Fetch for Server Actions

```typescript
// lib/fetch/server.ts
"use server";

import { cookies, headers } from 'next/headers';
import { ApiError, extractErrorMessage } from './errors';
import type { FetchRequestOptions } from './types';

const DEFAULT_TIMEOUT = 30000;

/**
 * Get cookie header for server-to-server requests
 * Forwards session cookies from the original request
 */
async function getCookieHeader(): Promise<string> {
  try {
    const cookieStore = await cookies();
    return cookieStore.getAll().map(c => `${c.name}=${c.value}`).join('; ');
  } catch {
    return '';
  }
}

/**
 * Get base URL for internal API calls
 * Uses env var or extracts from request headers
 */
async function getBaseUrl(): Promise<string> {
  // Prefer explicit env var
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }

  // Extract from request headers
  try {
    const headersList = await headers();
    const host = headersList.get('host');
    const protocol = headersList.get('x-forwarded-proto') || 'http';
    if (host) return `${protocol}://${host}`;
  } catch {}

  // Default fallback
  return 'http://localhost:3000';
}

/**
 * Server fetch for calling Next.js API routes from server actions
 * Automatically forwards cookies for authentication
 */
export async function serverFetch<T>(
  url: string,
  options: FetchRequestOptions = {}
): Promise<T> {
  const baseUrl = await getBaseUrl();
  const fullUrl = `${baseUrl}${url}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    options.timeout || DEFAULT_TIMEOUT
  );

  const cookieHeader = await getCookieHeader();

  try {
    const response = await fetch(fullUrl, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': crypto.randomUUID(),
        ...(cookieHeader && { Cookie: cookieHeader }),
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      throw new ApiError(extractErrorMessage(data), response.status, data);
    }

    return data as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('Request timeout', 408);
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      error instanceof Error ? error.message : 'Network error',
      500
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

// Convenience methods for common HTTP methods
export async function serverGet<T>(url: string, opts?: FetchOptions): Promise<T> {
  return serverFetch<T>(url, { ...opts, method: 'GET' });
}

export async function serverPost<T>(url: string, body: unknown, opts?: FetchOptions): Promise<T> {
  return serverFetch<T>(url, { ...opts, method: 'POST', body });
}

export async function serverPut<T>(url: string, body: unknown, opts?: FetchOptions): Promise<T> {
  return serverFetch<T>(url, { ...opts, method: 'PUT', body });
}

export async function serverPatch<T>(url: string, body: unknown, opts?: FetchOptions): Promise<T> {
  return serverFetch<T>(url, { ...opts, method: 'PATCH', body });
}

export async function serverDelete<T>(url: string, opts?: FetchOptions): Promise<T> {
  return serverFetch<T>(url, { ...opts, method: 'DELETE' });
}
```

## Backend Fetch for API Routes

```typescript
/**
 * Backend fetch for API routes calling FastAPI backend
 * Uses Bearer token authentication
 */
export async function backendFetch<T>(
  url: string,
  accessToken: string,
  options: FetchRequestOptions = {}
): Promise<T> {
  const baseUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8000';
  const fullUrl = `${baseUrl}${url}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    options.timeout || DEFAULT_TIMEOUT
  );

  try {
    const response = await fetch(fullUrl, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'X-Request-ID': crypto.randomUUID(),
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      throw new ApiError(extractErrorMessage(data), response.status, data);
    }

    return data as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('Request timeout', 408);
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      error instanceof Error ? error.message : 'Network error',
      500
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
```

## Usage in Server Actions

```typescript
// lib/actions/users.actions.ts
"use server";

import { serverGet, serverPost, serverPut } from "@/lib/fetch/server";
import type { UsersResponse, User, UserCreate } from "@/types/users";

export async function getUsers(
  limit: number,
  skip: number,
  filters?: Record<string, string | undefined>
): Promise<UsersResponse> {
  const params = new URLSearchParams();
  params.append('limit', limit.toString());
  params.append('skip', skip.toString());
  
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.append(key, value);
    });
  }
  
  return serverGet<UsersResponse>(`/api/setting/users?${params.toString()}`);
}

export async function createUser(userData: UserCreate): Promise<User> {
  return serverPost<User>("/api/setting/users", userData);
}

export async function updateUser(userId: string, userData: Partial<User>): Promise<User> {
  return serverPut<User>(`/api/setting/users/${userId}`, userData);
}
```

## Usage in Page Components

```typescript
// app/(pages)/setting/users/page.tsx
import { auth } from "@/lib/auth/server-auth";
import { getUsers } from "@/lib/actions/users.actions";
import { redirect } from "next/navigation";
import UsersTable from "./_components/table/users-table";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; limit?: string }>;
}) {
  const session = await auth();
  if (!session?.accessToken) redirect("/login");

  const params = await searchParams;
  const page = Number(params.page) || 1;
  const limit = Number(params.limit) || 10;

  // Server action calls serverGet internally
  const users = await getUsers(limit, (page - 1) * limit);

  return <UsersTable initialData={users} />;
}
```

## Error Handling in Server Actions

```typescript
"use server";

import { serverPost } from "@/lib/fetch/server";
import { ApiError } from "@/lib/fetch/errors";

export async function createUserSafe(userData: UserCreate): Promise<{
  success: boolean;
  data?: User;
  error?: string;
}> {
  try {
    const user = await serverPost<User>("/api/setting/users", userData);
    return { success: true, data: user };
  } catch (error) {
    if (error instanceof ApiError) {
      return { success: false, error: error.message };
    }
    return { success: false, error: "An unexpected error occurred" };
  }
}
```

## Key Points

1. **"use server"** - Required for server actions
2. **Cookie forwarding** - getCookieHeader() forwards session
3. **Base URL detection** - Works in different environments
4. **Timeout handling** - AbortController prevents hung requests
5. **Consistent errors** - ApiError throughout
6. **Type-safe generics** - Full TypeScript support
