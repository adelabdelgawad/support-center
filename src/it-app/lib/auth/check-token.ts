/**
 * Server-side token validation utility.
 *
 * This utility runs on the server during page render or in server components.
 * It reads authentication tokens from HTTP-only cookies and validates them
 * against the backend validation endpoint.
 *
 * Key design decisions:
 * - Server-side only (uses cookies() from next/headers)
 * - Single backend call to GET /api/auth/me
 * - No heavy dependencies
 * - Returns simple { ok, user, reason } result
 */

import { cookies } from "next/headers";

/**
 * User information returned from token validation.
 */
export interface User {
  id: string; // UUID from backend
  username: string;
  fullName?: string;
  email?: string;
  isDomain?: boolean;
  isSuperAdmin?: boolean;
  isBlocked?: boolean;
  blockedMessage?: string;
  roles?: Array<{
    id: number;
    name: string;
    description?: string;
  }>;
  [key: string]: string | string | number | boolean | Array<any> | undefined;
}

/**
 * Result of token validation.
 */
export interface CheckTokenResult {
  ok: boolean;
  user?: User;
  reason?: "invalid" | "network" | "unauthorized";
}

/**
 * Validates an authentication token by calling the backend validation endpoint.
 *
 * This function runs on the server and should be called during page render or
 * in server components to check if a user is authenticated.
 *
 * Behavior:
 * 1. Reads authentication token from HTTP-only cookies
 * 2. Calls GET /api/auth/me with the token
 * 3. Returns { ok: true, user } on success (2xx response)
 * 4. Returns { ok: false, reason } on failure or network error
 *
 * Cookie name checked: 'access_token' (from our authentication system)
 *
 * @returns Promise<CheckTokenResult> - Validation result with user info or error reason
 *
 * @example
 * // In a server component or page
 * const result = await checkToken();
 * if (!result.ok) {
 *   redirect('/auth/login');
 * }
 * // result.user is now available
 */
export async function checkToken(): Promise<CheckTokenResult> {
  try {
    // Get cookies from the request
    const cookieStore = await cookies();

    // Look for authentication token in cookies
    // Our backend uses 'access_token' as the cookie name
    const token =
      cookieStore.get("access_token")?.value ||
      cookieStore.get("refresh_token")?.value ||
      cookieStore.get("auth-token")?.value ||
      cookieStore.get("session")?.value;

    // If no token found, return invalid
    if (!token) {
      return { ok: false, reason: "invalid" };
    }

    // We need to validate the token and get user data from the backend
    // This is necessary to get user information including roles
    try {
      const baseUrl = getBaseUrl();
      const meUrl = `${baseUrl}/api/auth/me`;

      // Call the /api/auth/me endpoint which handles token → session data
      // This endpoint reads the access token from cookies and returns full user data
      const response = await fetch(meUrl, {
        method: "GET",
        headers: {
          // Forward the cookie header with access token
          Cookie: `access_token=${token}`,
        },
        // Don't cache this request - always get fresh user data
        cache: "no-store",
      });

      if (!response.ok) {
        return { ok: false, reason: "unauthorized" };
      }

      const data = await response.json();

      if (!data.ok || !data.user) {
        return { ok: false, reason: "invalid" };
      }

      return {
        ok: true,
        user: data.user,
      };
    } catch {
      return { ok: false, reason: "network" };
    }
  } catch (error) {
    // Network errors, timeouts, JSON parsing errors, etc.
    console.error("Token validation error:", error);
    return { ok: false, reason: "network" };
  }
}

/**
 * Get the base URL for Next.js API routes (not backend API).
 *
 * This function returns the URL for the Next.js frontend server,
 * which hosts the /api/auth/* routes.
 *
 * Note: Do NOT use NEXT_PUBLIC_API_URL here as that points to the backend.
 */
function getBaseUrl(): string {
  // Production: Use Vercel URL
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // Custom deployment: Use NEXT_PUBLIC_BASE_URL if set
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL;
  }

  // Development: Use localhost (server-side calls should always use localhost)
  const port = process.env.PORT || "3010";
  return `http://localhost:${port}`;
}

/**
 * Helper to determine if a token is likely present.
 *
 * This does a lightweight check (presence only, no validation).
 * Useful for quick checks that want to avoid remote validation calls.
 *
 * @returns boolean - True if a token cookie exists
 */
export async function isTokenPresent(): Promise<boolean> {
  const cookieStore = await cookies();
  return !!(
    cookieStore.get("access_token")?.value ||
    cookieStore.get("refresh_token")?.value ||
    cookieStore.get("auth-token")?.value ||
    cookieStore.get("session")?.value
  );
}
