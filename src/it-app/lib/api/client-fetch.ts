/**
 * Client-side fetch utilities for API calls
 *
 * ARCHITECTURE NOTE:
 * Client components should call Next.js API routes (/api/*) using fetch(),
 * NOT the backend directly. This ensures:
 * - httpOnly cookies are handled server-side
 * - Authentication tokens never exposed to client JavaScript
 * - Consistent error handling and response formatting
 *
 * Usage:
 * - Use apiClient.get/post/etc for convenience wrapper
 * - Use getErrorMessage() for error handling
 */

// Performance optimization: Request timeout and retry constants
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000; // 1 second

/**
 * Custom error class for client-side fetch errors
 */
export class ClientFetchError extends Error {
  status: number;
  detail?: string;

  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name = 'ClientFetchError';
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Helper function to extract error message from various error types
 * Works with ClientFetchError and standard Error objects
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof ClientFetchError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return "An unknown error occurred";
}

/**
 * Type-safe API error check
 */
export function isAPIError(error: unknown): error is ClientFetchError {
  return error instanceof ClientFetchError;
}

/**
 * Extract a readable error message from API error responses
 * Handles various error formats including FastAPI validation errors
 */
function extractErrorMessage(errorData: Record<string, unknown>, status: number): string {
  // Handle string detail
  if (typeof errorData.detail === 'string') {
    return errorData.detail;
  }

  // Handle FastAPI validation errors (array of {loc, msg, type})
  if (Array.isArray(errorData.detail) && errorData.detail.length > 0) {
    const firstError = errorData.detail[0];
    if (firstError && typeof firstError === 'object') {
      const field = Array.isArray(firstError.loc) ? firstError.loc.join('.') : '';
      const msg = firstError.msg || firstError.message || 'Validation error';
      return field ? `${field}: ${msg}` : msg;
    }
  }

  // Handle object detail with message
  if (errorData.detail && typeof errorData.detail === 'object') {
    const detail = errorData.detail as Record<string, unknown>;
    if (typeof detail.message === 'string') return detail.message;
    if (typeof detail.msg === 'string') return detail.msg;
  }

  // Handle message field
  if (typeof errorData.message === 'string') {
    return errorData.message;
  }

  // Handle error field
  if (typeof errorData.error === 'string') {
    return errorData.error;
  }

  // Default fallback
  return `Request failed with status ${status}`;
}

/**
 * Fetch with timeout support
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number = DEFAULT_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      // Create a timeout error that will be handled by handleErrorResponse
      const timeoutError: ClientFetchError = new ClientFetchError(
        'Request timed out - please try again',
        408,
        'Request timeout'
      );
      throw timeoutError;
    }
    throw error;
  }
}

/**
 * Fetch with retry logic for transient failures
 */
async function fetchWithRetry(
  fetchFn: () => Promise<Response>,
  attempt: number = 1
): Promise<Response> {
  try {
    const response = await fetchFn();

    // Check for retryable status codes (429, 503)
    if ((response.status === 429 || response.status === 503) && attempt < MAX_RETRIES) {
      // Exponential backoff: 1s, 2s
      const delay = RETRY_DELAY * attempt;
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(fetchFn, attempt + 1);
    }

    return response;
  } catch (error) {
    // Only retry on network errors, not on ClientFetchError (which includes timeout)
    if (error instanceof ClientFetchError) {
      throw error;
    }
    // For network errors, retry if we haven't exceeded max retries
    if (attempt < MAX_RETRIES) {
      const delay = RETRY_DELAY * attempt;
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(fetchFn, attempt + 1);
    }
    throw error;
  }
}

/**
 * Handle error responses consistently
 * Redirects to login on 401, handles blocked users on 403
 */
function handleErrorResponse(response: Response, errorData: Record<string, unknown>): never {
  // Handle 401 Unauthorized - session expired or invalid
  if (response.status === 401) {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.clear();
        localStorage.removeItem('user_data');
      } catch {
        // Ignore storage errors
      }
      window.location.href = "/login?session_expired=true";
    }
  }

  // Handle 403 Forbidden - blocked user
  if (response.status === 403) {
    const detail = errorData.detail;
    if (typeof detail === "string" && detail.includes("blocked")) {
      if (typeof window !== "undefined") {
        const blockMessage = encodeURIComponent(detail);
        window.location.href = `/login?blocked=true&message=${blockMessage}`;
      }
    }
  }

  const message = extractErrorMessage(errorData, response.status);
  throw new ClientFetchError(message, response.status, typeof errorData.detail === 'string' ? errorData.detail : undefined);
}

/**
 * Convenience wrapper for fetch with standard options
 * Use this for consistent API calls to Next.js routes
 */
export const apiClient = {
  async get<T>(url: string): Promise<T> {
    const response = await fetchWithRetry(() => fetchWithTimeout(url, {
      method: 'GET',
      credentials: 'include',
    }));
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      handleErrorResponse(response, errorData);
    }
    return response.json();
  },

  async post<T>(url: string, data?: unknown): Promise<T> {
    const response = await fetchWithRetry(() => fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: data ? JSON.stringify(data) : undefined,
    }));
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      handleErrorResponse(response, errorData);
    }
    return response.json();
  },

  async put<T>(url: string, data?: unknown): Promise<T> {
    const response = await fetchWithRetry(() => fetchWithTimeout(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: data ? JSON.stringify(data) : undefined,
    }));
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      handleErrorResponse(response, errorData);
    }
    return response.json();
  },

  async patch<T>(url: string, data?: unknown): Promise<T> {
    const response = await fetchWithRetry(() => fetchWithTimeout(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: data ? JSON.stringify(data) : undefined,
    }));
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      handleErrorResponse(response, errorData);
    }
    return response.json();
  },

  async delete<T>(url: string, data?: unknown): Promise<T> {
    const response = await fetchWithRetry(() => fetchWithTimeout(url, {
      method: 'DELETE',
      headers: data ? { 'Content-Type': 'application/json' } : undefined,
      credentials: 'include',
      body: data ? JSON.stringify(data) : undefined,
    }));
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      handleErrorResponse(response, errorData);
    }
    return response.json();
  },
};

export default apiClient;
