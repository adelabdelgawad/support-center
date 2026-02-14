# Client Fetch Pattern Reference

Browser-side fetch utilities for Next.js client components.

## Complete Client Fetch Implementation

```typescript
// lib/fetch/client.ts
"use client";

import { AuthService } from '@/lib/auth/auth-service';
import { ApiError, extractErrorMessage } from './errors';
import type { FetchOptions, FetchRequestOptions } from './types';

const DEFAULT_TIMEOUT = 30000;
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

/**
 * Core client fetch function with:
 * - Timeout handling
 * - Auto retry on 429/503
 * - Token refresh on 401
 * - Redirect to login on auth failure
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
      credentials: 'include',  // IMPORTANT: Include cookies
    });

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      // ==========================================
      // HANDLE 401 - Token Refresh
      // ==========================================
      if (response.status === 401 && !isRetryAfterRefresh) {
        clearTimeout(timeoutId);
        try {
          const newToken = await AuthService.refreshAccessToken();
          if (newToken) {
            // Retry with new token
            return clientFetch<T>(url, options, attempt, true);
          }
        } catch {
          // Refresh failed
        }
        // Redirect to login
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        throw new ApiError('Session expired', 401);
      }

      // ==========================================
      // HANDLE 429/503 - Rate Limit / Unavailable
      // ==========================================
      if ((response.status === 429 || response.status === 503) && attempt < MAX_RETRIES) {
        clearTimeout(timeoutId);
        // Exponential backoff
        await new Promise(resolve => 
          setTimeout(resolve, RETRY_DELAY * attempt)
        );
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

## Usage in Components

### With SWR

```typescript
"use client";

import useSWR from 'swr';
import { fetchClient } from '@/lib/fetch/client';

// SWR fetcher
const fetcher = (url: string) => fetchClient.get(url).then(r => r.data);

function MyComponent() {
  const { data, error, isLoading, mutate } = useSWR(
    '/api/items',
    fetcher,
    {
      fallbackData: initialData,
      keepPreviousData: true,
      revalidateOnMount: false,
      revalidateOnFocus: false,
    }
  );
  
  // ...
}
```

### Direct API Calls

```typescript
"use client";

import { fetchClient } from '@/lib/fetch/client';
import { toast } from 'sonner';

async function handleUpdate(id: string, data: UpdateData) {
  try {
    const { data: updated } = await fetchClient.put<Item>(
      `/api/items/${id}`,
      data
    );
    toast.success('Updated successfully');
    return updated;
  } catch (error) {
    if (error instanceof ApiError) {
      toast.error(error.message);
    }
    throw error;
  }
}
```

### With Error Handling

```typescript
"use client";

import { fetchClient, ApiError } from '@/lib/fetch/client';

async function createItem(data: CreateData) {
  try {
    const { data: created } = await fetchClient.post<Item>('/api/items', data);
    return { success: true, data: created };
  } catch (error) {
    if (error instanceof ApiError) {
      // Handle specific status codes
      if (error.status === 400) {
        return { success: false, error: 'Invalid data', details: error.data };
      }
      if (error.status === 409) {
        return { success: false, error: 'Item already exists' };
      }
      return { success: false, error: error.message };
    }
    return { success: false, error: 'Network error' };
  }
}
```

## Auth Service Integration

```typescript
// lib/auth/auth-service.ts
export class AuthService {
  static async refreshAccessToken(): Promise<string | null> {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      
      if (!response.ok) {
        return null;
      }
      
      const data = await response.json();
      return data.accessToken;
    } catch {
      return null;
    }
  }
  
  static async logout(): Promise<void> {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
    window.location.href = '/login';
  }
}
```

## Key Features

| Feature | Implementation |
|---------|---------------|
| Cookies | `credentials: 'include'` |
| Timeout | AbortController with setTimeout |
| Retry | Exponential backoff on 429/503 |
| Auth Refresh | Auto-refresh on 401, redirect on failure |
| Request ID | `X-Request-ID` header for tracing |
| Type Safety | Generic return types |
