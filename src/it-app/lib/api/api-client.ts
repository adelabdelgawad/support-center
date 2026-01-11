/**
 * Unified API Client for it-app (Web-Only)
 *
 * The it-app is a Next.js web application for IT agents/supervisors.
 * It runs in browsers only - Tauri desktop app is the separate requester-app.
 *
 * All client API calls go through Next.js API routes with httpOnly cookies:
 * - Client Component → fetch() → Next.js API Route → FastAPI Backend
 *
 * Usage:
 * ```typescript
 * import { getApiClient } from '@/lib/api/api-client';
 *
 * const client = getApiClient();
 * const data = await client.get<MyType>('/endpoint');
 * ```
 */

import { api as webApiClient } from '../fetch/client';

/**
 * API Client interface - standard HTTP methods
 */
export interface ApiClient {
  get<T>(url: string): Promise<T>;
  post<T>(url: string, data?: unknown): Promise<T>;
  put<T>(url: string, data?: unknown): Promise<T>;
  patch<T>(url: string, data?: unknown): Promise<T>;
  delete<T>(url: string): Promise<T>;
}

/**
 * Get the API client for the web application
 *
 * Note: Endpoints should be Next.js API routes (e.g., '/users', '/requests')
 * NOT direct backend paths (e.g., '/api/v1/users')
 *
 * @returns ApiClient instance for web
 */
export function getApiClient(): ApiClient {
  return webApiClient;
}

/**
 * Get API client asynchronously
 * Included for API compatibility, but returns the same synchronous client
 */
export async function getApiClientAsync(): Promise<ApiClient> {
  return webApiClient;
}

/**
 * Get the full API URL for web endpoints
 *
 * @param webPath - Next.js API route path (e.g., '/users')
 * @returns Full URL for the API route
 */
export function getApiUrl(webPath: string): string {
  return webPath;
}

// Re-export the web api for direct import
export { api } from '../fetch/client';
