/**
 * Centralized Error Handler for API Responses
 *
 * Handles 403 (Forbidden) and 404 (Not Found) errors by redirecting to appropriate error pages.
 * Also handles 401 (Unauthorized) by logging out user.
 */

import { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';

export interface ApiErrorResponse {
  error?: string;
  detail?: string;
  message?: string;
  status_code?: number;
}

/**
 * Handle API response errors and redirect appropriately
 *
 * @param response - Fetch Response object
 * @param router - Next.js router instance
 * @returns true if error was handled, false if response is OK
 */
export async function handleApiError(
  response: Response,
  router: AppRouterInstance
): Promise<boolean> {
  if (response.ok) {
    return false; // No error
  }

  const status = response.status;

  switch (status) {
    case 401:
      // Unauthorized - clear auth and redirect to login
      console.error('401 Unauthorized - redirecting to login');

      // Clear auth data
      if (typeof window !== 'undefined') {
        localStorage.removeItem('user');
        localStorage.removeItem('access_token');
        sessionStorage.clear();
      }

      // Redirect to login with return URL
      const currentPath = window.location.pathname;
      router.push(`/login?returnUrl=${encodeURIComponent(currentPath)}`);
      return true;

    case 403:
      // Forbidden - redirect to not-authorized page
      console.error('403 Forbidden - insufficient permissions');
      router.push('/not-authorized');
      return true;

    case 404:
      // Not Found - redirect to not-found page
      console.error('404 Not Found - resource does not exist');
      router.push('/not-found');
      return true;

    default:
      // Other errors - just return false and let caller handle
      return false;
  }
}

/**
 * Check if error response indicates permission issue
 */
export function isPermissionError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const apiError = error as ApiErrorResponse;
    return (
      apiError.status_code === 403 ||
      apiError.error === 'not_authorized' ||
      apiError.error === 'forbidden' ||
      (apiError.detail?.toLowerCase().includes('permission') ?? false) ||
      (apiError.message?.toLowerCase().includes('permission') ?? false)
    );
  }
  return false;
}

/**
 * Check if error response indicates resource not found
 */
export function isNotFoundError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const apiError = error as ApiErrorResponse;
    return (
      apiError.status_code === 404 ||
      apiError.error === 'not_found' ||
      (apiError.detail?.toLowerCase().includes('not found') ?? false) ||
      (apiError.message?.toLowerCase().includes('not found') ?? false)
    );
  }
  return false;
}

/**
 * Enhanced fetch wrapper with automatic error handling
 *
 * Usage:
 * ```typescript
 * const data = await fetchWithErrorHandling('/api/data', router);
 * ```
 */
export async function fetchWithErrorHandling(
  url: string,
  router: AppRouterInstance,
  options?: RequestInit
): Promise<Response | null> {
  try {
    const response = await fetch(url, {
      ...options,
      credentials: 'include', // Always include cookies
    });

    // Handle error responses
    const wasHandled = await handleApiError(response, router);

    if (wasHandled) {
      return null; // Error was handled, don't proceed
    }

    return response;
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
}

/**
 * Extract error message from various error formats
 */
export function extractErrorMessage(error: unknown): string {
  if (!error) return 'An unknown error occurred';

  if (typeof error === 'string') return error;

  if (error instanceof Error) return error.message;

  if (typeof error === 'object') {
    const apiError = error as ApiErrorResponse;
    return (
      apiError.detail ||
      apiError.message ||
      apiError.error ||
      'An error occurred'
    );
  }

  return 'An unknown error occurred';
}
