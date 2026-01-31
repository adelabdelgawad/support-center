import { cookies, headers } from 'next/headers';

export class ServerApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public detail?: string,
    public url?: string,
    public method?: string
  ) {
    super(message);
    this.name = 'ServerApiError';
  }
}

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_BASE_PATH = process.env.NEXT_PUBLIC_API_BASE_PATH || "/api/v1";

type ResponseType = 'json' | 'arraybuffer' | 'blob' | 'text';

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
    cache?: RequestCache;
    responseType?: ResponseType;
  }
): Promise<T> {
  const fullUrl = `${API_URL}${API_BASE_PATH}${endpoint}`;
  const method = options?.method || 'GET';

  const accessToken = await getAccessToken();
  const forwardedHeaders = await getForwardingHeaders();

  const requestHeaders: Record<string, string> = {
    ...forwardedHeaders,
    ...options?.headers,
  };

  // Only set Content-Type for JSON requests (default behavior)
  // Binary downloads should not send Content-Type or let the browser handle it
  if (!options?.responseType || options.responseType === 'json') {
    requestHeaders['Content-Type'] = 'application/json';
  }

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

  if (options?.cache) {
    fetchOptions.cache = options.cache;
  } else if (options?.revalidate !== undefined || options?.tags) {
    fetchOptions.next = {
      revalidate: options.revalidate,
      tags: options.tags,
    };
  }

  const response = await fetch(fullUrl, fetchOptions);

  if (!response.ok) {
    // If 401/403 and we have a refresh token, try to refresh
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get('refresh_token')?.value;

    if ((response.status === 401 || response.status === 403) && refreshToken) {
      try {
        // Attempt token refresh
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3010';
        const refreshResponse = await fetch(`${baseUrl}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json();

          // Update cookies with new tokens
          const isSecure = process.env.NODE_ENV === 'production';

          if (refreshData.accessToken) {
            cookieStore.set('access_token', refreshData.accessToken, {
              httpOnly: true,
              secure: isSecure,
              sameSite: 'strict',
              path: '/',
              maxAge: 15 * 60, // 15 minutes
            });

            // Retry the original request with new token
            const retryHeaders: Record<string, string> = {
              ...requestHeaders,
              'Authorization': `Bearer ${refreshData.accessToken}`,
            };

            const retryResponse = await fetch(fullUrl, {
              ...fetchOptions,
              headers: retryHeaders,
            });

            if (retryResponse.ok) {
              // Successful retry - return the response
              if (retryResponse.status === 204) return undefined as T;

              const responseType = options?.responseType || 'json';
              switch (responseType) {
                case 'arraybuffer':
                  return (await retryResponse.arrayBuffer()) as T;
                case 'blob':
                  return (await retryResponse.blob()) as T;
                case 'text':
                  return (await retryResponse.text()) as T;
                case 'json':
                default:
                  return retryResponse.json();
              }
            }
          }
        }
      } catch (refreshError) {
        console.error('Token refresh failed during API call:', refreshError);
      }
    }

    // Original error handling (refresh failed or not applicable)
    let errorData: unknown = {};
    try { errorData = await response.json(); } catch {}
    throw new ServerApiError(
      extractErrorMessage(errorData),
      response.status,
      typeof (errorData as Record<string, unknown>)?.detail === 'string'
        ? (errorData as Record<string, unknown>).detail as string
        : undefined,
      fullUrl,
      method
    );
  }

  if (response.status === 204) return undefined as T;

  // Handle response based on responseType
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
}

// Public request (no auth required)
// Legacy signature: makePublicRequest<T>(method, url, data?, config?)
// New signature: publicFetch<T>(url, options?)
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

  const response = await fetch(fullUrl, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...forwardedHeaders,
      ...config?.headers,
    },
    body: data !== undefined ? JSON.stringify(data) : undefined,
  });

  if (!response.ok) {
    let errorData: unknown = {};
    try { errorData = await response.json(); } catch {}
    throw new ServerApiError(extractErrorMessage(errorData), response.status, undefined, fullUrl, method);
  }

  return response.json();
}

// New simplified public fetch
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

// Legacy compatibility aliases
// Legacy signature: makeAuthenticatedRequest<T>(method, url, data?, config?)
// New signature: serverFetch<T>(url, options?)

// Legacy wrapper for makeAuthenticatedRequest (3-arg signature)
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
  });
}

// Cache shortcuts (use inline options instead for new code)
export const CACHE_PRESETS = {
  NO_CACHE: () => ({ revalidate: 0 as const }),
  SHORT_LIVED: () => ({ revalidate: 60 }),
  REFERENCE_DATA: (tag?: string) => ({ revalidate: 300, tags: tag ? [tag] : undefined }),
  STATIC: (tag?: string) => ({ revalidate: 3600, tags: tag ? [tag] : undefined }),
  USER_PAGES: (userId: string) => ({ revalidate: 300, tags: [`user-pages-${userId}`] }),
};

// Legacy exports for backward compatibility
export async function getServerAccessToken(): Promise<string | undefined> {
  return await getAccessToken();
}

export async function getServerSessionId(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get("session_id")?.value;
}

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

export function getServerErrorMessage(error: unknown): string {
  if (error instanceof ServerApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "An unknown error occurred";
}

export function isServerAPIError(error: unknown): error is ServerApiError {
  return error instanceof ServerApiError;
}

// Re-export ServerApiError as ServerFetchError for backward compatibility
export { ServerApiError as ServerFetchError };

export default makeAuthenticatedRequest;
