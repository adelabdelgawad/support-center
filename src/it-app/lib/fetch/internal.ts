/**
 * Internal API Fetch Utilities
 * Server-side functions that call Next.js API routes (not backend directly)
 *
 * These are used by server actions to route through Next.js API routes,
 * establishing a single auditable gateway for all backend access.
 *
 * Key differences from server.ts:
 * - Calls Next.js API routes (http://localhost:3010/api/...)
 * - NOT backend direct calls (http://localhost:8000/backend/...)
 * - Forwards all cookies as Cookie header
 * - Uses cache: 'no-store' for all calls
 */

import { cookies, headers } from 'next/headers';
import { ApiError, extractErrorMessage } from './errors';

const INTERNAL_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3010';
const DEFAULT_TIMEOUT = 30000;

/**
 * Read all cookies and format for forwarding
 */
async function getAllCookies(): Promise<string> {
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  return allCookies
    .map(c => `${c.name}=${c.value}`)
    .join('; ');
}

/**
 * Get forwarding headers (X-Forwarded-For, X-Real-IP)
 */
async function getForwardingHeaders(): Promise<Record<string, string>> {
  try {
    const headersList = await headers();
    const forwarding: Record<string, string> = {};
    const xff = headersList.get('x-forwarded-for');
    if (xff) forwarding['X-Forwarded-For'] = xff;
    const xri = headersList.get('x-real-ip');
    if (xri) forwarding['X-Real-IP'] = xri;
    return forwarding;
  } catch {
    return {};
  }
}

/**
 * Core internal fetch function
 * Calls Next.js API routes with cookie forwarding
 */
async function internalFetch<T>(
  path: string,
  options?: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    headers?: Record<string, string>;
    timeout?: number;
    responseType?: 'json' | 'text' | 'blob' | 'arraybuffer';
  }
): Promise<T> {
  const fullUrl = `${INTERNAL_BASE_URL}${path}`;
  const method = options?.method || 'GET';
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // Forward all cookies
    const cookieHeader = await getAllCookies();

    // Get forwarding headers
    const forwardedHeaders = await getForwardingHeaders();

    const requestHeaders: Record<string, string> = {
      ...forwardedHeaders,
      ...options?.headers,
    };

    // Add Cookie header
    if (cookieHeader) {
      requestHeaders.Cookie = cookieHeader;
    }

    const fetchOptions: RequestInit = {
      method,
      headers: requestHeaders,
      cache: 'no-store', // Never cache internal API calls
    };

    if (options?.body !== undefined) {
      fetchOptions.body = JSON.stringify(options.body);
      if (!requestHeaders['Content-Type']) {
        requestHeaders['Content-Type'] = 'application/json';
      }
    }

    const response = await fetch(fullUrl, {
      ...fetchOptions,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorData: unknown = {};
      try { errorData = await response.json(); } catch {}

      throw new ApiError(
        extractErrorMessage(errorData),
        response.status,
        errorData,
        fullUrl,
        method
      );
    }

    if (response.status === 204) return undefined as T;

    const responseType = options?.responseType || 'json';

    switch (responseType) {
      case 'arraybuffer':
        return (await response.arrayBuffer()) as T;
      case 'blob':
        return (await response.blob()) as T;
      case 'text':
        return (await response.text()) as T;
      case 'json':
      default:
        return response.json();
    }
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('Request timeout', 408, undefined, fullUrl, method);
    }
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      error instanceof Error ? error.message : 'Network error',
      0,
      undefined,
      fullUrl,
      method
    );
  }
}

/**
 * GET request to internal API route
 *
 * @example
 * const users = await internalGet<User[]>('/api/users');
 */
export const internalGet = <T>(
  path: string,
  opts?: {
    headers?: Record<string, string>;
    timeout?: number;
  }
) => internalFetch<T>(path, { method: 'GET', ...opts });

/**
 * POST request to internal API route
 *
 * @example
 * const newUser = await internalPost<User>('/api/users', { name: 'John' });
 */
export const internalPost = <T>(
  path: string,
  body?: unknown,
  opts?: {
    headers?: Record<string, string>;
    timeout?: number;
  }
) => internalFetch<T>(path, { method: 'POST', body, ...opts });

/**
 * PUT request to internal API route
 *
 * @example
 * const updatedUser = await internalPut<User>('/api/users/123', { name: 'Jane' });
 */
export const internalPut = <T>(
  path: string,
  body?: unknown,
  opts?: {
    headers?: Record<string, string>;
    timeout?: number;
  }
) => internalFetch<T>(path, { method: 'PUT', body, ...opts });

/**
 * PATCH request to internal API route
 *
 * @example
 * const patchedUser = await internalPatch<User>('/api/users/123', { name: 'Jane' });
 */
export const internalPatch = <T>(
  path: string,
  body?: unknown,
  opts?: {
    headers?: Record<string, string>;
    timeout?: number;
  }
) => internalFetch<T>(path, { method: 'PATCH', body, ...opts });

/**
 * DELETE request to internal API route
 *
 * @example
 * await internalDelete('/api/users/123');
 */
export const internalDelete = <T = void>(
  path: string,
  opts?: {
    headers?: Record<string, string>;
    timeout?: number;
  }
) => internalFetch<T>(path, { method: 'DELETE', ...opts });
