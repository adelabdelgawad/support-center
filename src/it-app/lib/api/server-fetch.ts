import { cookies, headers } from 'next/headers';
import { ApiError, extractErrorMessage } from '@/lib/fetch/errors';

// Re-export ApiError under legacy names for backward compatibility
export { ApiError as ServerApiError } from '@/lib/fetch/errors';
export { ApiError as ServerFetchError } from '@/lib/fetch/errors';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_BASE_PATH = process.env.NEXT_PUBLIC_API_BASE_PATH || "/backend";
const DEFAULT_TIMEOUT = 30000;
const MAX_RETRIES = 2;
const RETRYABLE_STATUSES = [429, 500, 502, 503];

type ResponseType = 'json' | 'arraybuffer' | 'blob' | 'text';

function getRetryDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 4000);
}

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

/**
 * Handle successful 2xx responses
 */
async function handleSuccessfulResponse<T>(
  response: Response,
  method: string
): Promise<T> {
  // 204 No Content - return undefined
  if (response.status === 204) {
    return undefined as T;
  }

  // Parse JSON response
  const responseData = await response.json();

  // Return response data
  return responseData as T;
}

/**
 * Handle error responses (4xx, 5xx)
 * Returns true if the request should be retried
 */
async function handleErrorResponse(
  response: Response,
  attempt: number,
  maxRetries: number,
  fullUrl: string,
  method: string
): Promise<ApiError> {
  const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));

  return new ApiError(
    extractErrorMessage(errorData),
    response.status,
    errorData,
    fullUrl,
    method,
  );
}

/**
 * Attempt token refresh for 401 responses
 * Returns true if refresh succeeded, false otherwise
 */
async function attemptTokenRefresh(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get('refresh_token')?.value;
    if (!refreshToken) return false;

    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010';
    const refreshResponse = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (refreshResponse.ok) {
      const refreshData = await refreshResponse.json();
      cookieStore.set('access_token', refreshData.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 60 * 60, // 1 hour
      });
      return true;
    }
  } catch {
    // Refresh failed - fall through
  }
  return false;
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
 *
 * // Public request (no auth required)
 * await makePublicRequest('/users/me');
 */
export async function serverFetch<T>(
  endpoint: string,
  options?: {
    revalidate?: number | false;
    tags?: string[];
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    body?: unknown;
    headers?: Record<string, string>;
    responseType?: ResponseType;
    timeout?: number;
    cache?: RequestCache;
    retries?: number;
  }
): Promise<T> {
  const fullUrl = `${API_URL}${API_BASE_PATH}${endpoint}`;
  const method = options?.method || 'GET';
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT;
  const maxRetries = options?.retries ?? MAX_RETRIES;

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
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
  };

  let lastError: ApiError | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(fullUrl, {
        ...fetchOptions,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // ========== SUCCESSFUL RESPONSES (2xx) - Handle FIRST ==========
      if (response.ok) {
        return await handleSuccessfulResponse<T>(response, method);
      }

      // ========== ERROR RESPONSES (4xx, 5xx) ==========

      // 401 Unauthorized - try token refresh once
      if (response.status === 401) {
        if (attempt === 1 && await attemptTokenRefresh()) {
          // Token refreshed, get new access token and retry
          const newAccessToken = await getAccessToken();
          if (newAccessToken) {
            requestHeaders['Authorization'] = `Bearer ${newAccessToken}`;
            continue; // Retry with new token
          }
        }
        // Refresh failed or this wasn't the first attempt - throw 401
        const errorData = await response.json().catch(() => ({ detail: 'Unauthorized' }));
        throw new ApiError(
          extractErrorMessage(errorData),
          401,
          errorData,
          fullUrl,
          method,
        );
      }

      // 403 Forbidden - no retry
      if (response.status === 403) {
        const errorData = await response.json().catch(() => ({ detail: 'Forbidden' }));
        throw new ApiError(
          extractErrorMessage(errorData),
          403,
          errorData,
          fullUrl,
          method,
        );
      }

      // 404 Not Found - no retry
      if (response.status === 404) {
        const errorData = await response.json().catch(() => ({ detail: 'Not found' }));
        throw new ApiError(
          extractErrorMessage(errorData),
          404,
          errorData,
          fullUrl,
          method,
        );
      }

      // Other 4xx errors (except 429) - no retry
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        lastError = await handleErrorResponse(response, attempt, maxRetries, fullUrl, method);
        throw lastError;
      }

      // 429 Too Many Requests, 5xx server errors - retryable
      if (response.status === 429 || response.status >= 500) {
        lastError = await handleErrorResponse(response, attempt, maxRetries, fullUrl, method);
        // Don't throw yet - allow retry loop
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, getRetryDelay(attempt)));
          continue;
        }
        throw lastError;
      }

    } catch (error: unknown) {
      clearTimeout(timeoutId);

      // AbortError from timeout - retryable
      if (error instanceof Error && error.name === 'AbortError') {
        lastError = new ApiError('Request timeout', 408, undefined, fullUrl, method);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, getRetryDelay(attempt)));
          continue;
        }
        throw lastError;
      }

      // Re-throw ApiError directly (already handled above)
      if (error instanceof ApiError) {
        throw error;
      }

      // Network errors
      const message = error instanceof Error ? error.message : 'Unknown network error';
      lastError = new ApiError(message, 500, { message }, fullUrl, method);
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, getRetryDelay(attempt)));
        continue;
      }
      throw lastError;
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError || new ApiError('Unknown error', 500, undefined, fullUrl, method);
}

/**
 * Make public API request without authentication
 */
export async function makePublicRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  endpoint: string,
  data?: unknown,
  config?: {
    headers?: Record<string, string>;
    timeout?: number;
  }
): Promise<T> {
  const fullUrl = `${API_URL}${API_BASE_PATH}${endpoint}`;
  const forwardedHeaders = await getForwardingHeaders();
  const timeout = config?.timeout ?? DEFAULT_TIMEOUT;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(fullUrl, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...forwardedHeaders,
        ...config?.headers,
      },
      body: data !== undefined ? JSON.stringify(data) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorData: unknown = {};
      try {
        errorData = await response.json();
      } catch {
        // Use empty object if JSON parsing fails
      }
      throw new ApiError(
        extractErrorMessage(errorData),
        response.status,
        errorData,
        fullUrl,
        method,
      );
    }

    // 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return await response.json() as T;
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    if (error instanceof ApiError) {
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('Request timeout', 408, undefined, fullUrl, method);
    }
    throw new ApiError(
      error instanceof Error ? error.message : 'Network error',
      500,
      undefined,
      fullUrl,
      method,
    );
  }
}

/**
 * Simplified public fetch
 */
export async function publicFetch<T>(
  endpoint: string,
  options?: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    headers?: Record<string, string>;
  }
): Promise<T> {
  return makePublicRequest<T>(
    options?.method || 'GET',
    endpoint,
    options?.body,
    { headers: options?.headers }
  );
}

/**
 * Legacy wrapper for authenticated requests
 * Old signature: makeAuthenticatedRequest<T>(method, url, data?, config?)
 */
export async function makeAuthenticatedRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  data?: unknown,
  config?: {
    headers?: Record<string, string>;
    responseType?: 'json' | 'blob' | 'arraybuffer' | 'text' | 'stream';
    timeout?: number;
  }
): Promise<T> {
  return serverFetch<T>(url, {
    method,
    body: data,
    headers: config?.headers,
    responseType: config?.responseType === 'stream' ? 'arraybuffer' : config?.responseType,
    timeout: config?.timeout,
  });
}

/**
 * Get server access token
 */
export async function getServerAccessToken(): Promise<string | undefined> {
  return await getAccessToken();
}

/**
 * Get server session ID
 */
export async function getServerSessionId(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get("session_id")?.value;
}

/**
 * Get server user info from cookie
 */
export async function getServerUserInfo() {
  const cookieStore = await cookies();
  const userData = cookieStore.get("user_data")?.value;
  if (!userData) return null;
  try {
    return JSON.parse(decodeURIComponent(userData));
  } catch {
    return null;
  }
}

/**
 * Extract error message from unknown error
 */
export function getServerErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "An unknown error occurred";
}

/**
 * Type guard for ApiError
 */
export function isServerAPIError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

// Cache shortcuts (use inline options for new code)
export const CACHE_PREFSETS = {
  NO_CACHE: () => ({ revalidate: 0 as const }),
  SHORT_LIVED: () => ({ revalidate: 60 }),
  USER_PAGES: (userId: string) => ({ revalidate: 300, tags: [`user-pages-${userId}`] }),
  REFERENCE_DATA: (tag?: string) => ({ revalidate: 3000, tags: tag ? [tag] : undefined }),
};

// Legacy alias for backward compatibility
export const CACHE_PRESETS = CACHE_PREFSETS;

// Default export for backward compatibility
export default makeAuthenticatedRequest;
