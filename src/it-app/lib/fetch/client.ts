"use client";

/**
 * Web-only client-side fetch utilities
 *
 * Calls Next.js API routes with httpOnly cookie authentication.
 * The it-app is a web application (not Tauri) - Tauri desktop app
 * is the requester-app in a separate directory.
 */

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

async function clientFetch<T>(
  url: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    timeout?: number;
  } = {}
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

  delete: <T>(url: string, data?: unknown, opts?: { headers?: Record<string, string> }): Promise<T> =>
    clientFetch<T>(url, { ...opts, method: 'DELETE', body: data }),
};

// Legacy compatibility - keep these for gradual migration
export const apiClient = api;
export function getApiClient() { return api; }

// Re-export error type for backward compatibility
export { ApiError as ClientFetchError };

// Helper function for backward compatibility
export function getClientErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
}

export default api;
