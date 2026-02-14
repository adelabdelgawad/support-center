# Fetch Pattern Reference

Client and server-side fetch utilities for API communication.

## File Structure

```
lib/fetch/
├── client.ts           # Client-side fetch (browser)
├── server.ts           # Server-side fetch (server actions, API routes)
├── api-route-helper.ts # API route wrappers
├── errors.ts           # Error classes
├── types.ts            # TypeScript types
└── index.ts            # Exports
```

## Client-Side Fetch

```tsx
// lib/fetch/client.ts
"use client";

import { AuthService } from '@/lib/auth/auth-service';
import { ApiError, extractErrorMessage } from './errors';
import type { FetchOptions, FetchRequestOptions } from './types';

const DEFAULT_TIMEOUT = 30000;
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

/**
 * Client fetch for calling Next.js API routes
 */
async function clientFetch<T>(
  url: string,
  options: FetchRequestOptions = {},
  attempt = 1,
  isRetryAfterRefresh = false
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    options.timeout || DEFAULT_TIMEOUT
  );

  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': crypto.randomUUID(),
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
      credentials: 'include',
    });

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      // Handle 401 - attempt token refresh once
      if (response.status === 401 && !isRetryAfterRefresh) {
        clearTimeout(timeoutId);
        try {
          const newToken = await AuthService.refreshAccessToken();
          if (newToken) {
            return clientFetch<T>(url, options, attempt, true);
          }
        } catch {
          // Refresh failed
        }
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        throw new ApiError('Session expired', 401);
      }

      // Retry on 429/503
      if ((response.status === 429 || response.status === 503) && attempt < MAX_RETRIES) {
        clearTimeout(timeoutId);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
        return clientFetch<T>(url, options, attempt + 1, isRetryAfterRefresh);
      }

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

/**
 * Modern API client - returns T directly
 */
export const api = {
  get: <T>(url: string, opts?: FetchOptions): Promise<T> =>
    clientFetch<T>(url, { ...opts, method: 'GET' }),

  post: <T>(url: string, body: unknown, opts?: FetchOptions): Promise<T> =>
    clientFetch<T>(url, { ...opts, method: 'POST', body }),

  put: <T>(url: string, body: unknown, opts?: FetchOptions): Promise<T> =>
    clientFetch<T>(url, { ...opts, method: 'PUT', body }),

  patch: <T>(url: string, body: unknown, opts?: FetchOptions): Promise<T> =>
    clientFetch<T>(url, { ...opts, method: 'PATCH', body }),

  delete: <T>(url: string, opts?: FetchOptions): Promise<T> =>
    clientFetch<T>(url, { ...opts, method: 'DELETE' }),
};

/**
 * Legacy wrapper - returns { data: T }
 * @deprecated Use api.get/post/put/patch/delete instead
 */
export const fetchClient = {
  get: async <T>(url: string, opts?: FetchOptions): Promise<{ data: T }> => {
    const data = await clientFetch<T>(url, { ...opts, method: 'GET' });
    return { data };
  },
  post: async <T>(url: string, body?: unknown, opts?: FetchOptions): Promise<{ data: T }> => {
    const data = await clientFetch<T>(url, { ...opts, method: 'POST', body });
    return { data };
  },
  put: async <T>(url: string, body?: unknown, opts?: FetchOptions): Promise<{ data: T }> => {
    const data = await clientFetch<T>(url, { ...opts, method: 'PUT', body });
    return { data };
  },
  patch: async <T>(url: string, body?: unknown, opts?: FetchOptions): Promise<{ data: T }> => {
    const data = await clientFetch<T>(url, { ...opts, method: 'PATCH', body });
    return { data };
  },
  delete: async <T>(url: string, opts?: FetchOptions): Promise<{ data: T }> => {
    const data = await clientFetch<T>(url, { ...opts, method: 'DELETE' });
    return { data };
  },
};

export default api;
```

## Server-Side Fetch

```tsx
// lib/fetch/server.ts
"use server";

import { cookies, headers } from 'next/headers';
import { ApiError, extractErrorMessage } from './errors';
import type { FetchOptions, FetchRequestOptions } from './types';

const DEFAULT_TIMEOUT = 30000;

/**
 * Get cookie header for server-to-server requests
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
 */
async function getBaseUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }

  try {
    const headersList = await headers();
    const host = headersList.get('host');
    const protocol = headersList.get('x-forwarded-proto') || 'http';
    if (host) return `${protocol}://${host}`;
  } catch {}

  return 'http://localhost:3000';
}

/**
 * Server fetch for calling Next.js API routes from server actions
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

/**
 * Backend fetch for API routes calling FastAPI
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

// Convenience methods for server actions
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

## Error Classes

```tsx
// lib/fetch/errors.ts
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function extractErrorMessage(data: unknown): string {
  if (typeof data === 'string') return data;
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    if (typeof obj.detail === 'string') return obj.detail;
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.error === 'string') return obj.error;
  }
  return 'An error occurred';
}
```

## Type Definitions

```tsx
// lib/fetch/types.ts
export interface FetchOptions {
  headers?: Record<string, string>;
  timeout?: number;
}

export interface FetchRequestOptions extends FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}
```

## Usage Examples

### Client Component
```tsx
"use client";
import { fetchClient } from "@/lib/fetch/client";

// In SWR fetcher
const fetcher = (url: string) => fetchClient.get(url).then(r => r.data);

// In action handler
const handleUpdate = async () => {
  try {
    const { data } = await fetchClient.put<Item>(`/api/items/${id}`, payload);
    toast.success("Updated");
  } catch (error) {
    toast.error(error.message);
  }
};
```

### Server Action
```tsx
// lib/actions/items.actions.ts
"use server";
import { serverGet, serverPost } from "@/lib/fetch/server";

export async function getItems(limit: number, skip: number) {
  return serverGet<ItemsResponse>(`/api/setting/items?limit=${limit}&skip=${skip}`);
}

export async function createItem(data: ItemCreate) {
  return serverPost<Item>("/api/setting/items", data);
}
```

## Key Points

1. **Client uses fetchClient** - Wraps with { data: T }
2. **Server uses serverGet/Post** - For server actions
3. **API routes use backendFetch** - For FastAPI calls
4. **Auto token refresh** - On 401, tries refresh once
5. **Retry on rate limit** - 429/503 with exponential backoff
6. **Consistent error handling** - ApiError class throughout
