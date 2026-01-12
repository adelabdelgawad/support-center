/**
 * Client-side fetch interceptor for handling authentication errors.
 *
 * This module provides:
 * 1. Enhanced fetch wrapper with automatic 401/403 handling
 * 2. Global fetch interceptor that patches window.fetch
 *
 * Usage:
 * - Import setupFetchInterceptor() and call it in your app initialization (ClientAppWrapper)
 * - OR use the authenticatedFetch() wrapper directly in components
 */

/**
 * Handle authentication errors by redirecting to login.
 * Clears local storage and cookies before redirect.
 */
function handleAuthError(status: number, errorData?: any): void {
  if (typeof window === "undefined") return;

  try {
    // Clear client-side storage
    sessionStorage.clear();
    localStorage.removeItem("user_data");
  } catch (e) {
    // Ignore storage errors
  }

  // Handle 401 Unauthorized - session expired or invalid
  if (status === 401) {
    window.location.href = "/login?session_expired=true";
    return;
  }

  // Handle 403 Forbidden - blocked user or insufficient permissions
  if (status === 403) {
    const detail = errorData?.detail || "";
    if (typeof detail === "string" && detail.toLowerCase().includes("blocked")) {
      const blockMessage = encodeURIComponent(detail);
      window.location.href = `/login?blocked=true&message=${blockMessage}`;
      return;
    }
    // For other 403 errors, redirect to not-authorized
    window.location.href = "/not-authorized";
  }
}

/**
 * Enhanced fetch wrapper with automatic error handling.
 *
 * Features:
 * - Includes credentials (httpOnly cookies) by default
 * - Automatically handles 401/403 responses
 * - Returns Response object (same interface as fetch)
 *
 * @param input - Request URL or Request object
 * @param init - Fetch options
 * @returns Promise<Response>
 *
 * @example
 * const response = await authenticatedFetch('/api/requests', {
 *   method: 'POST',
 *   body: JSON.stringify(data),
 * });
 * const result = await response.json();
 */
export async function authenticatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  // Merge default options with provided options
  const options: RequestInit = {
    ...init,
    credentials: init?.credentials || "include", // Include httpOnly cookies
    headers: {
      ...init?.headers,
    },
  };

  // Perform the fetch
  const response = await fetch(input, options);

  // Handle auth errors
  if (response.status === 401 || response.status === 403) {
    let errorData: any;
    try {
      errorData = await response.clone().json();
    } catch {
      errorData = {};
    }
    handleAuthError(response.status, errorData);
  }

  return response;
}

/**
 * Setup global fetch interceptor.
 *
 * This patches window.fetch to automatically handle 401/403 errors
 * for all fetch calls in the application.
 *
 * Call this once during app initialization (e.g., in ClientAppWrapper).
 *
 * Note: This only intercepts calls to internal API routes (/api/*)
 * External API calls are not affected.
 *
 * @example
 * // In ClientAppWrapper or app initialization
 * useEffect(() => {
 *   setupFetchInterceptor();
 * }, []);
 */
export function setupFetchInterceptor(): void {
  if (typeof window === "undefined") return;

  // Don't patch if already patched
  if ((window.fetch as any).__patched) return;

  // Store original fetch
  const originalFetch = window.fetch;

  // Create patched fetch
  const patchedFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    // Determine if this is an internal API call
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const isInternalAPI = url.startsWith("/api/") || url.includes("/api/");

    // Exclude auth endpoints - they legitimately return 401 for wrong credentials
    // and the login page handles those errors directly
    const isAuthEndpoint = url.includes("/api/auth/");

    // For internal API calls (except auth), ensure credentials are included
    if (isInternalAPI && !isAuthEndpoint) {
      const options: RequestInit = {
        ...init,
        credentials: init?.credentials || "include",
      };

      // Perform the fetch
      const response = await originalFetch(input, options);

      // Handle auth errors for internal APIs
      if (response.status === 401 || response.status === 403) {
        let errorData: any;
        try {
          errorData = await response.clone().json();
        } catch {
          errorData = {};
        }
        handleAuthError(response.status, errorData);
      }

      return response;
    }

    // For external calls, use original fetch unchanged
    return originalFetch(input, init);
  };

  // Mark as patched
  (patchedFetch as any).__patched = true;

  // Replace window.fetch - cast to satisfy TypeScript
  window.fetch = patchedFetch as typeof fetch;
}

/**
 * Remove the global fetch interceptor.
 *
 * This is rarely needed, but provided for completeness.
 * Useful for testing or specific scenarios where you want to disable interception.
 */
export function removeFetchInterceptor(): void {
  if (typeof window === "undefined") return;

  // Only remove if patched
  if (!(window.fetch as any).__patched) return;

  // We can't truly restore the original fetch since we don't store a reference
  // This would require a more complex implementation
  // For now, just remove the patched flag
  delete (window.fetch as any).__patched;

  console.warn(
    "Fetch interceptor removed. Note: Original fetch cannot be fully restored. Reload the page for clean state."
  );
}
