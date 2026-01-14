/**
 * ============================================================================
 * PHASE 4: Tauri HTTP Plugin Client (CORS-Free)
 * ============================================================================
 * Uses Tauri's HTTP plugin to bypass WebView2 CORS restrictions.
 *
 * Why this matters:
 * - WebView2 (Edge-based) enforces strict CORS even when server allows it
 * - Some corporate proxies intercept preflight requests and cause CORS failures
 * - Tauri HTTP plugin routes requests through Rust, completely bypassing WebView CORS
 *
 * Features:
 * - Automatic Bearer token attachment
 * - 401 auto-logout and redirect
 * - Request/response type safety
 * - Error handling utilities
 * - 30-second timeout
 * - CORS-free requests through Rust backend
 */

import { AuthStorage } from '@/lib/storage';
import { RuntimeConfig } from '@/lib/runtime-config';
import { invoke } from '@tauri-apps/api/core';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { logger } from '@/logging';

// ============================================================================
// Local IP caching for accurate client identification
// ============================================================================
// The Tauri app runs behind a corporate firewall, so the backend sees the
// firewall IP instead of the actual client IP. We get the local IP from
// the Rust backend and send it in a custom header.

let cachedLocalIP: string | null = null;
let localIPFetchPromise: Promise<string | null> | null = null;

/**
 * Get the local IP address from Tauri (cached after first call)
 */
async function getLocalIP(): Promise<string | null> {
  if (cachedLocalIP !== null) {
    return cachedLocalIP;
  }

  // Avoid concurrent fetches - reuse existing promise
  if (localIPFetchPromise !== null) {
    return localIPFetchPromise;
  }

  localIPFetchPromise = (async () => {
    try {
      const ip = await invoke<string>('get_local_ip');
      cachedLocalIP = ip;
      console.log('[fetch-client] Cached local IP:', ip);
      return ip;
    } catch (error) {
      console.warn('[fetch-client] Failed to get local IP:', error);
      cachedLocalIP = null;
      return null;
    } finally {
      localIPFetchPromise = null;
    }
  })();

  return localIPFetchPromise;
}

/**
 * API Error class for consistent error handling
 */
export class APIError extends Error {
  constructor(
    message: string,
    public status?: number,
    public statusText?: string,
    public data?: any
  ) {
    super(message);
    this.name = 'APIError';
  }
}

/**
 * Request options interface
 */
interface RequestOptions extends RequestInit {
  timeout?: number;
  params?: Record<string, string | number | boolean>;
}

/**
 * Create fetch request with timeout
 * Uses Tauri HTTP plugin - bypasses WebView CORS entirely
 */
async function fetchWithTimeout(
  url: string,
  options: RequestOptions = {}
): Promise<Response> {
  const { timeout = 30000, ...fetchOptions } = options;

  // Use Tauri HTTP plugin which runs through Rust (no CORS restrictions)
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    // tauriFetch bypasses WebView2 CORS - requests go through Rust
    const response = await tauriFetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new APIError('Request timeout', 408, 'Request Timeout');
    }
    throw error;
  }
}

/**
 * Build full URL with query parameters
 * Now uses runtime config (env vars)
 */
function buildURL(endpoint: string, params?: Record<string, string | number | boolean>): string {
  // Get base URL from runtime config (env vars)
  // Check if RuntimeConfig is initialized before calling
  if (!RuntimeConfig.isInitialized()) {
    console.error('[fetch-client] RuntimeConfig not initialized yet. This should not happen - check App.tsx initialization.');
    throw new Error('RuntimeConfig not initialized. Call RuntimeConfig.initialize() first in App.tsx');
  }

  const API_URL = RuntimeConfig.getServerAddress();

  const url = endpoint.startsWith('http') ? endpoint : `${API_URL}${endpoint}`;

  if (!params || Object.keys(params).length === 0) {
    return url;
  }

  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    searchParams.append(key, String(value));
  });

  return `${url}?${searchParams.toString()}`;
}

/**
 * Get auth token from Tauri Storage
 */
async function getAuthToken(): Promise<string | null> {
  try {
    return await AuthStorage.get('access_token');
  } catch (error) {
    console.error('[fetch-client] Failed to get auth token:', error);
    return null;
  }
}

/**
 * Handle 401 Unauthorized responses
 * CRITICAL: This stops all further requests and forces a clean redirect
 */
async function handleUnauthorized(): Promise<never> {
  console.error('[fetch-client] 401 Unauthorized - clearing auth and redirecting to login');

  // Clear stored auth data
  try {
    await AuthStorage.clearAll();
  } catch (error) {
    console.error('[fetch-client] Failed to clear auth data:', error);
  }

  // Redirect to SSO page with force reload to ensure clean state
  window.location.href = '/sso';

  // Force reload after a brief delay to ensure the href change takes effect
  setTimeout(() => {
    window.location.reload();
  }, 100);

  // Throw to stop execution immediately
  throw new APIError('Session expired - redirecting to login', 401, 'Unauthorized');
}

/**
 * Parse response body based on content type
 */
async function parseResponse(response: Response): Promise<any> {
  const contentType = response.headers.get('content-type');

  if (contentType?.includes('application/json')) {
    return await response.json();
  }

  if (contentType?.includes('text/')) {
    return await response.text();
  }

  // For binary data (images, files, etc.)
  return await response.blob();
}

/**
 * Response with headers for axios compatibility
 */
interface ResponseWithHeaders<T> {
  data: T;
  headers: Record<string, string>;
}

/**
 * Core request function
 */
async function request<T = any>(
  method: string,
  endpoint: string,
  options: RequestOptions = {}
): Promise<ResponseWithHeaders<T>> {
  const { params, timeout, ...fetchOptions } = options;

  // Build URL with query params
  let url: string;
  try {
    url = buildURL(endpoint, params);
  } catch (buildError) {
    console.error('[fetch-client] Failed to build URL:', {
      endpoint,
      params,
      error: buildError,
    });
    throw buildError;
  }

  console.log('[fetch-client] Making request:', { method, url });

  // Get auth token and local IP concurrently for better performance
  const [token, localIP] = await Promise.all([
    getAuthToken(),
    getLocalIP(),
  ]);

  // Prepare headers
  const headers = new Headers(fetchOptions.headers);

  // Add auth token if available
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Add local IP for accurate client identification (bypasses firewall NAT)
  if (localIP) {
    headers.set('X-Client-Private-IP', localIP);
  }

  // Add Content-Type for JSON requests (unless already set)
  if (!headers.has('Content-Type') && fetchOptions.body && typeof fetchOptions.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  // Make request
  let response: Response;
  try {
    response = await fetchWithTimeout(url, {
      ...fetchOptions,
      method,
      headers,
      timeout,
    });
    console.log('[fetch-client] Response received:', { status: response.status, ok: response.ok });
  } catch (fetchError) {
    // Log to file for production debugging
    logger.error('network', 'API request failed', {
      url,
      method,
      errorType: typeof fetchError,
      errorConstructor: (fetchError as any)?.constructor?.name ?? 'unknown',
      errorMessage: fetchError instanceof Error ? fetchError.message : String(fetchError),
      errorStack: fetchError instanceof Error ? fetchError.stack : undefined,
      errorKeys: fetchError && typeof fetchError === 'object' ? Object.keys(fetchError) : [],
      errorJSON: JSON.stringify(fetchError, Object.getOwnPropertyNames(fetchError || {})),
    });
    throw fetchError;
  }

  // Handle 401 Unauthorized
  if (response.status === 401) {
    await handleUnauthorized();
    throw new APIError('Unauthorized', 401, 'Unauthorized');
  }

  // Parse response body
  const data = await parseResponse(response);

  // Handle non-2xx responses
  if (!response.ok) {
    const message = typeof data === 'object' && data?.detail
      ? (typeof data.detail === 'string' ? data.detail : data.detail[0]?.msg || 'Request failed')
      : response.statusText;

    throw new APIError(
      message,
      response.status,
      response.statusText,
      data
    );
  }

  // Convert headers to plain object for axios compatibility
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key.toLowerCase()] = value;
  });

  return { data, headers: responseHeaders };
}

/**
 * Fetch API Client - Drop-in replacement for axios
 */
export const fetchClient = {
  /**
   * GET request
   */
  async get<T = any>(endpoint: string, options: RequestOptions = {}): Promise<{ data: T; headers: Record<string, string> }> {
    return await request<T>('GET', endpoint, options);
  },

  /**
   * POST request
   */
  async post<T = any>(
    endpoint: string,
    body?: any,
    options: RequestOptions = {}
  ): Promise<{ data: T; headers: Record<string, string> }> {
    return await request<T>('POST', endpoint, {
      ...options,
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  /**
   * PUT request
   */
  async put<T = any>(
    endpoint: string,
    body?: any,
    options: RequestOptions = {}
  ): Promise<{ data: T; headers: Record<string, string> }> {
    return await request<T>('PUT', endpoint, {
      ...options,
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  /**
   * PATCH request
   */
  async patch<T = any>(
    endpoint: string,
    body?: any,
    options: RequestOptions = {}
  ): Promise<{ data: T; headers: Record<string, string> }> {
    return await request<T>('PATCH', endpoint, {
      ...options,
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  /**
   * DELETE request
   */
  async delete<T = any>(endpoint: string, options: RequestOptions = {}): Promise<{ data: T; headers: Record<string, string> }> {
    return await request<T>('DELETE', endpoint, options);
  },

  /**
   * Request with custom config (for advanced use cases)
   */
  async request<T = any>(config: {
    method: string;
    url: string;
    data?: any;
    params?: Record<string, string | number | boolean>;
    headers?: Record<string, string>;
    timeout?: number;
  }): Promise<{ data: T; headers: Record<string, string> }> {
    const { method, url, data: body, ...options } = config;
    return await request<T>(method, url, {
      ...options,
      body: body ? JSON.stringify(body) : undefined,
    });
  },
};

/**
 * Extract error message from API error
 * Compatible with axios error handling
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof APIError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  // Log non-standard errors to file for debugging (critical for production)
  const errorContext = {
    type: typeof error,
    constructor: (error as any)?.constructor?.name ?? 'unknown',
    keys: error && typeof error === 'object' ? Object.keys(error) : [],
    stringified: JSON.stringify(error, null, 2),
  };

  logger.error('network', 'Non-standard error received in getErrorMessage', errorContext);

  // Try to extract message from object-like errors (Tauri HTTP plugin errors)
  if (error && typeof error === 'object') {
    const errObj = error as Record<string, unknown>;
    if (typeof errObj.message === 'string') {
      return errObj.message;
    }
    if (typeof errObj.error === 'string') {
      return errObj.error;
    }
    if (typeof errObj.detail === 'string') {
      return errObj.detail;
    }
    // Return stringified version if it has useful content
    const stringified = JSON.stringify(error);
    if (stringified && stringified !== '{}') {
      return `Error: ${stringified}`;
    }
  }

  return 'An unexpected error occurred';
}

/**
 * Type guard to check if error is an APIError
 */
export function isAPIError(error: unknown): error is APIError {
  return error instanceof APIError;
}

/**
 * Default export for compatibility
 */
export default fetchClient;
