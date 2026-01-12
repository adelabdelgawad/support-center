/**
 * Middleware Authentication Utilities
 *
 * Lightweight auth verification for Next.js middleware.
 * These functions run at the edge before page render.
 *
 * DESIGN NOTES:
 * - Only checks cookie PRESENCE, not validity
 * - Full validation happens in layout/server components
 * - This enables fast redirects without blocking on network calls
 */

import type { NextRequest } from 'next/server';

/**
 * Auth cookie names used in the application
 */
const AUTH_COOKIE_NAMES = [
  'access_token',
  'refresh_token',
  'auth-token',
  'session',
  'user_data', // Also contains user info
];

/**
 * Verify that at least one auth cookie is present
 *
 * This is a FAST check for middleware - it only verifies cookie existence,
 * not token validity. Full validation happens in the layout.
 *
 * @param request - Next.js request object
 * @returns true if any auth cookie is present, false otherwise
 */
export function verifyAuthCookie(request: NextRequest): boolean {
  // Check cookies from the request
  const cookies = request.cookies;

  for (const cookieName of AUTH_COOKIE_NAMES) {
    if (cookies.get(cookieName)) {
      return true;
    }
  }

  return false;
}

/**
 * Get the access token from cookies (if present)
 *
 * @param request - Next.js request object
 * @returns Access token value or undefined
 */
export function getAccessTokenFromRequest(request: NextRequest): string | undefined {
  return request.cookies.get('access_token')?.value;
}

/**
 * Get user data from cookies (if present)
 *
 * @param request - Next.js request object
 * @returns Parsed user data or undefined
 */
export function getUserDataFromRequest(request: NextRequest): Record<string, unknown> | undefined {
  const userDataCookie = request.cookies.get('user_data')?.value;
  if (!userDataCookie) {
    return undefined;
  }

  try {
    return JSON.parse(userDataCookie);
  } catch {
    return undefined;
  }
}
