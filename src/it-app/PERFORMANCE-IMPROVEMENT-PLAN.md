# Performance Improvement Plan: it-app

## Context for Claude Code Agent

This plan was created by comparing it-app with network-manager (a faster project using the same stack). Execute phases in order. Each phase is independent and can be validated before moving to the next.

**Important**: Tauri desktop app support is used in this project - DO NOT remove Tauri-related code.

---

## Status: ✅ COMPLETE

All three phases have been successfully implemented and validated with `bun run build`.

| Phase | Status | Files Modified |
|-------|--------|----------------|
| 1 | ✅ Complete | package.json |
| 2 | ✅ Complete | 23 files updated, new lib/fetch/ created |
| 3 | ✅ Complete | lib/api/server-fetch.ts simplified |

---

## Summary

| Phase | Task | Files | Effort |
|-------|------|-------|--------|
| 1 | Enable Turbopack | 1 | 5 min |
| 2 | Simplify Client Fetch | 23 files to update | 2-4 hrs |
| 3 | Simplify Server Fetch | 176 files to update | 4-8 hrs |

---

## Phase 1: Enable Turbopack (5 minutes)

### Task
Add `--turbopack` flag to dev script.

### File to Modify
`package.json`

### Change
```diff
- "dev": "cross-env PORT=3010 NODE_OPTIONS='--no-deprecation' next dev"
+ "dev": "cross-env PORT=3010 NODE_OPTIONS='--no-deprecation' next dev --turbopack"
```

### Validation
```bash
npm run dev
# Should start faster (~500ms vs 3-5s)
```

---

## Phase 2: Simplify Client-Side Fetch

### Current Architecture (3 layers)
```
getApiClient() → isTauri() → createTauriClientProxy() OR webApiClient
```

Files:
- `lib/api/api-client.ts` (153 lines)
- `lib/api/client-fetch.ts` (208 lines)
- `lib/api/tauri-fetch.ts` (Tauri client)
- `lib/utils/tauri-detection.ts`

### Target Architecture (1 layer with Tauri support)
```
api.get() → clientFetch() → fetch()  [web]
         → tauriFetch()              [tauri - lazy loaded]
```

### Step 2.1: Create New Unified Client

**Create file:** `lib/fetch/client.ts`

```typescript
"use client";

import { isTauri } from '@/lib/utils/tauri-detection';

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

function extractErrorMessage(data: unknown): string {
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (typeof obj.detail === 'string') return obj.detail;
    if (Array.isArray(obj.detail) && obj.detail[0]?.msg) {
      return obj.detail[0].msg;
    }
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.error === 'string') return obj.error;
  }
  return 'Request failed';
}

const DEFAULT_TIMEOUT = 30000;

// Cached Tauri client
let tauriClient: typeof import('./tauri-fetch') | null = null;

async function getTauriClient() {
  if (!tauriClient) {
    tauriClient = await import('./tauri-fetch');
  }
  return tauriClient;
}

async function clientFetch<T>(
  url: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    timeout?: number;
  } = {}
): Promise<T> {
  // Use Tauri client if in Tauri environment
  if (isTauri()) {
    const tauri = await getTauriClient();
    return tauri.tauriFetch<T>(url, options);
  }

  // Web client
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
      if (response.status === 401) {
        if (typeof window !== 'undefined') {
          window.location.href = '/login?session_expired=true';
        }
        throw new ApiError('Session expired', 401);
      }

      if (response.status === 403) {
        const detail = (data as Record<string, unknown>)?.detail;
        if (typeof detail === 'string' && detail.includes('blocked')) {
          if (typeof window !== 'undefined') {
            window.location.href = `/login?blocked=true&message=${encodeURIComponent(detail)}`;
          }
        }
      }

      throw new ApiError(extractErrorMessage(data), response.status, data);
    }

    return data as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('Request timeout', 408);
    }
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      error instanceof Error ? error.message : 'Network error',
      500
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export const api = {
  get: <T>(url: string, opts?: { headers?: Record<string, string> }): Promise<T> =>
    clientFetch<T>(url, { ...opts, method: 'GET' }),

  post: <T>(url: string, body?: unknown, opts?: { headers?: Record<string, string> }): Promise<T> =>
    clientFetch<T>(url, { ...opts, method: 'POST', body }),

  put: <T>(url: string, body?: unknown, opts?: { headers?: Record<string, string> }): Promise<T> =>
    clientFetch<T>(url, { ...opts, method: 'PUT', body }),

  patch: <T>(url: string, body?: unknown, opts?: { headers?: Record<string, string> }): Promise<T> =>
    clientFetch<T>(url, { ...opts, method: 'PATCH', body }),

  delete: <T>(url: string, opts?: { headers?: Record<string, string> }): Promise<T> =>
    clientFetch<T>(url, { ...opts, method: 'DELETE' }),
};

// Legacy compatibility - keep these for gradual migration
export const apiClient = api;
export function getApiClient() { return api; }

export default api;
```

### Step 2.2: Create Tauri Fetch Module

**Create file:** `lib/fetch/tauri-fetch.ts`

```typescript
/**
 * Tauri-specific fetch implementation
 * Only imported when running in Tauri environment
 */

import { ApiError } from './client';
import { getUnifiedAccessToken } from '@/lib/utils/auth-storage';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const API_BASE_PATH = '/api/v1';

export async function tauriFetch<T>(
  url: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
): Promise<T> {
  const accessToken = await getUnifiedAccessToken();

  // In Tauri, call backend directly
  const fullUrl = `${API_URL}${API_BASE_PATH}${url}`;

  const response = await fetch(fullUrl, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken && { 'Authorization': `Bearer ${accessToken}` }),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    const detail = (data as Record<string, unknown>)?.detail;
    throw new ApiError(
      typeof detail === 'string' ? detail : 'Request failed',
      response.status,
      data
    );
  }

  return data as T;
}
```

### Step 2.3: Update Imports (23 files)

**Files to update:**

```
lib/hooks/use-chat-mutations.ts
lib/hooks/use-global-metadata.ts
lib/hooks/use-request-assignees.ts
lib/hooks/use-request-notes.ts
lib/hooks/use-request-ticket.ts
lib/hooks/use-technicians.ts
lib/api/business-unit-regions.ts
lib/api/business-units.ts
lib/api/index.ts
lib/api/profile.ts
lib/api/request-statuses.ts
lib/api/request-types.ts
lib/api/requests-details.ts
lib/api/roles.ts
lib/api/service-request.ts
lib/api/service-sections.ts
lib/api/system-events.ts
lib/api/system-messages.ts
lib/api/user-status.ts
lib/api/users.ts
hooks/use-domain-users.tsx
```

**Search and replace pattern:**

```typescript
// BEFORE
import { apiClient } from '@/lib/api/client-fetch';
// or
import { getApiClient } from '@/lib/api/api-client';
const client = getApiClient();
await client.get<T>('/endpoint');

// AFTER
import { api } from '@/lib/fetch/client';
await api.get<T>('/endpoint');
```

### Step 2.4: Delete Old Files (after all imports updated)

```
lib/api/api-client.ts
lib/api/client-fetch.ts
lib/api/tauri-fetch.ts
```

### Validation
```bash
npx tsc --noEmit
npm run build
```

---

## Phase 3: Simplify Server-Side Fetch

### Current State
- `lib/api/server-fetch.ts` - 604 lines with 3 functions + CACHE_PRESETS
- 176 files use `makeAuthenticatedRequest` or `makePublicRequest`

### Target State
- Single `serverFetch` function with inline cache options
- ~150 lines

### Step 3.1: Create New Server Fetch

**Create file:** `lib/fetch/server.ts`

```typescript
"use server";

import { cookies, headers } from 'next/headers';

export class ServerApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public detail?: string
  ) {
    super(message);
    this.name = 'ServerApiError';
  }
}

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_BASE_PATH = process.env.NEXT_PUBLIC_API_BASE_PATH || "/api/v1";

async function getAccessToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get("access_token")?.value;
}

async function getForwardingHeaders(): Promise<Record<string, string>> {
  try {
    const headersList = await headers();
    const forwarding: Record<string, string> = {};
    const xff = headersList.get("x-forwarded-for");
    if (xff) forwarding["X-Forwarded-For"] = xff;
    const xri = headersList.get("x-real-ip");
    if (xri) forwarding["X-Real-IP"] = xri;
    return forwarding;
  } catch {
    return {};
  }
}

function extractErrorMessage(data: unknown): string {
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (typeof obj.detail === 'string') return obj.detail;
    if (Array.isArray(obj.detail) && obj.detail[0]?.msg) return obj.detail[0].msg;
    if (typeof obj.message === 'string') return obj.message;
  }
  return 'Request failed';
}

/**
 * Unified server-side fetch
 *
 * @example
 * // Simple GET
 * await serverFetch<User>('/users/me');
 *
 * // With caching
 * await serverFetch<Users>('/users', { revalidate: 60 });
 *
 * // POST request
 * await serverFetch<User>('/users', { method: 'POST', body: userData });
 */
export async function serverFetch<T>(
  endpoint: string,
  options?: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    headers?: Record<string, string>;
    revalidate?: number | false;
    tags?: string[];
    timeout?: number;
  }
): Promise<T> {
  const fullUrl = `${API_URL}${API_BASE_PATH}${endpoint}`;
  const method = options?.method || 'GET';

  const accessToken = await getAccessToken();
  const forwardedHeaders = await getForwardingHeaders();

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...forwardedHeaders,
    ...options?.headers,
  };

  if (accessToken) {
    requestHeaders['Authorization'] = `Bearer ${accessToken}`;
  }

  const fetchOptions: RequestInit = {
    method,
    headers: requestHeaders,
  };

  if (options?.body !== undefined) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  if (options?.revalidate !== undefined || options?.tags) {
    fetchOptions.next = {
      revalidate: options.revalidate,
      tags: options.tags,
    };
  }

  const response = await fetch(fullUrl, fetchOptions);

  if (!response.ok) {
    let errorData: unknown = {};
    try { errorData = await response.json(); } catch {}
    throw new ServerApiError(
      extractErrorMessage(errorData),
      response.status,
      typeof (errorData as Record<string, unknown>)?.detail === 'string'
        ? (errorData as Record<string, unknown>).detail as string
        : undefined
    );
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

// Public request (no auth required)
export async function publicFetch<T>(
  endpoint: string,
  options?: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    headers?: Record<string, string>;
  }
): Promise<T> {
  const fullUrl = `${API_URL}${API_BASE_PATH}${endpoint}`;
  const forwardedHeaders = await getForwardingHeaders();

  const response = await fetch(fullUrl, {
    method: options?.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...forwardedHeaders,
      ...options?.headers,
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    let errorData: unknown = {};
    try { errorData = await response.json(); } catch {}
    throw new ServerApiError(extractErrorMessage(errorData), response.status);
  }

  return response.json();
}

// Legacy compatibility aliases
export const makeAuthenticatedRequest = serverFetch;
export const makePublicRequest = publicFetch;

// Cache shortcuts (use inline options instead for new code)
export const CACHE_PRESETS = {
  NO_CACHE: () => ({ revalidate: 0 as const }),
  SHORT_LIVED: () => ({ revalidate: 60 }),
  REFERENCE_DATA: (tag?: string) => ({ revalidate: 300, tags: tag ? [tag] : undefined }),
  STATIC: (tag?: string) => ({ revalidate: 3600, tags: tag ? [tag] : undefined }),
  USER_PAGES: (userId: string) => ({ revalidate: 300, tags: [`user-pages-${userId}`] }),
};
```

### Step 3.2: Update lib/api/server-fetch.ts

Replace the entire file with the new content from Step 3.1. The legacy exports at the bottom ensure backward compatibility.

### Step 3.3: Gradual Migration (Optional)

For new code, use:
```typescript
await serverFetch<T>('/endpoint', { revalidate: 60 });
```

Instead of:
```typescript
await serverFetch<T>('/endpoint', CACHE_PRESETS.SHORT_LIVED());
```

### Validation
```bash
npx tsc --noEmit
npm run build
```

---

## Files Summary

### New Files to Create
```
lib/fetch/client.ts       # Unified client-side fetch
lib/fetch/tauri-fetch.ts  # Tauri-specific implementation
```

### Files to Replace
```
lib/api/server-fetch.ts   # Replace with simplified version
```

### Files to Delete (Phase 2, after migration)
```
lib/api/api-client.ts
lib/api/client-fetch.ts
lib/api/tauri-fetch.ts
```

### Files to Update Imports (Phase 2)
23 files - see Step 2.3 for complete list

---

## Execution Order

1. **Phase 1**: Update `package.json` → test `npm run dev`
2. **Phase 2**: Create new files → update imports → delete old files → `npm run build`
3. **Phase 3**: Replace `server-fetch.ts` → `npm run build`

Each phase can be committed separately.
