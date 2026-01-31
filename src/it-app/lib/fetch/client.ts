"use client";

/**
 * Web-only client-side fetch utilities
 *
 * Calls Next.js API routes with httpOnly cookie authentication.
 * The it-app is a web application (not Tauri) - Tauri desktop app
 * is the requester-app in a separate directory.
 */

import { ApiError, extractErrorMessage } from './errors';

// Re-export for consumers
export { ApiError, extractErrorMessage } from './errors';

const DEFAULT_TIMEOUT = 30000;
const MAX_RETRIES = 2;
const RETRYABLE_STATUSES = [429, 503];

function getRetryDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 4000);
}

async function clientFetch<T>(
  url: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    timeout?: number;
    retries?: number;
  } = {}
): Promise<T> {
  const maxRetries = options.retries ?? MAX_RETRIES;
  let lastError: ApiError | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
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

        const error = new ApiError(extractErrorMessage(data), response.status, data, url, options.method);

        // Retry on 429/503
        if (RETRYABLE_STATUSES.includes(response.status) && attempt < maxRetries) {
          lastError = error;
          await new Promise(r => setTimeout(r, getRetryDelay(attempt)));
          continue;
        }

        throw error;
      }

      return data as T;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApiError('Request timeout', 408, undefined, url, options.method);
      }
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(
        error instanceof Error ? error.message : 'Network error',
        500,
        undefined,
        url,
        options.method
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Should not reach here, but just in case
  throw lastError || new ApiError('Request failed after retries', 500, undefined, url, options.method);
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

  delete: <T>(url: string, data?: unknown, opts?: { headers?: Record<string, string> }): Promise<T> =>
    clientFetch<T>(url, { ...opts, method: 'DELETE', body: data }),
};

// Legacy compatibility
export const apiClient = api;
export function getApiClient() { return api; }

// Re-export error type for backward compatibility
export { ApiError as ClientFetchError };

export function getClientErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'An unknown error occurred';
}

export function getErrorMessage(error: unknown): string {
  return getClientErrorMessage(error);
}

export function isAPIError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export default api;
