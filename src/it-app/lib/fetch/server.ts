/**
 * Server-side fetch helpers
 * Convenience wrappers for server actions and components
 */

import { serverFetch } from '@/lib/api/server-fetch';

// Re-export the main serverFetch function
export { serverFetch };

/**
 * GET request helper
 *
 * @example
 * const users = await serverGet<User[]>('/users');
 * const cachedUsers = await serverGet<User[]>('/users', { revalidate: 60 });
 */
export const serverGet = <T>(
  url: string,
  opts?: {
    headers?: Record<string, string>;
    revalidate?: number | false;
    tags?: string[];
    timeout?: number;
    cache?: RequestCache;
  }
) => serverFetch<T>(url, { method: 'GET', ...opts });

/**
 * POST request helper
 *
 * @example
 * const newUser = await serverPost<User>('/users', { name: 'John' });
 */
export const serverPost = <T>(
  url: string,
  body?: unknown,
  opts?: {
    headers?: Record<string, string>;
    timeout?: number;
  }
) => serverFetch<T>(url, { method: 'POST', body, ...opts });

/**
 * PUT request helper
 *
 * @example
 * const updatedUser = await serverPut<User>('/users/123', { name: 'Jane' });
 */
export const serverPut = <T>(
  url: string,
  body?: unknown,
  opts?: {
    headers?: Record<string, string>;
    timeout?: number;
  }
) => serverFetch<T>(url, { method: 'PUT', body, ...opts });

/**
 * PATCH request helper
 *
 * @example
 * const patchedUser = await serverPatch<User>('/users/123', { name: 'Jane' });
 */
export const serverPatch = <T>(
  url: string,
  body?: unknown,
  opts?: {
    headers?: Record<string, string>;
    timeout?: number;
  }
) => serverFetch<T>(url, { method: 'PATCH', body, ...opts });

/**
 * DELETE request helper
 *
 * @example
 * await serverDelete('/users/123');
 */
export const serverDelete = <T = void>(
  url: string,
  opts?: {
    headers?: Record<string, string>;
    timeout?: number;
  }
) => serverFetch<T>(url, { method: 'DELETE', ...opts });
