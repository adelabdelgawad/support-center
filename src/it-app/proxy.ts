/**
 * Next.js Proxy (Next.js 16+)
 *
 * This proxy handles:
 * 1. Adding pathname to request headers for server components
 * 2. Authentication validation and automatic token refresh
 * 3. Redirecting unauthenticated users to login
 *
 * IMPORTANT: This proxy includes auth logic to prevent 403 errors before SSR.
 * It validates access tokens and attempts automatic refresh when tokens are expired.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  '/login',
  '/sso',
  '/not-authorized',
];

// Public API routes
const PUBLIC_API_ROUTES = [
  '/api/auth/ad-login',
  '/api/auth/sso',
  '/api/auth/token',
];

// Check if a path is public (doesn't require authentication)
function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(route => pathname.startsWith(route)) ||
         PUBLIC_API_ROUTES.some(route => pathname.startsWith(route));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Clone the request headers
  const requestHeaders = new Headers(request.headers);

  // Add the pathname to headers so layouts can access it
  requestHeaders.set("x-pathname", pathname);

  // Add the full URL for reference
  requestHeaders.set("x-url", request.url);

  // Skip auth checks for public routes and static assets
  if (
    isPublicRoute(pathname) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico)$/)
  ) {
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  // Get access token and refresh token from cookies
  const accessToken = request.cookies.get('access_token')?.value;
  const refreshToken = request.cookies.get('refresh_token')?.value;

  // If no access token, try to refresh
  if (!accessToken && refreshToken) {
    try {
      // Build the refresh endpoint URL
      const refreshUrl = new URL('/api/auth/refresh', request.url);

      const refreshResponse = await fetch(refreshUrl.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (refreshResponse.ok) {
        // Refresh successful - extract new tokens from response
        const refreshData = await refreshResponse.json();

        // Create response that continues the request
        const response = NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });

        // Determine if we should use secure cookies based on request protocol
        const isSecure = request.url.startsWith('https://');

        // Set new access token cookie (15 minutes for technicians)
        if (refreshData.accessToken) {
          response.cookies.set('access_token', refreshData.accessToken, {
            httpOnly: true,
            secure: isSecure,
            sameSite: 'strict',
            path: '/',
            maxAge: 15 * 60, // 15 minutes
          });
        }

        // Set new refresh token cookie (7 days)
        if (refreshData.refreshToken) {
          response.cookies.set('refresh_token', refreshData.refreshToken, {
            httpOnly: true,
            secure: isSecure,
            sameSite: 'strict',
            path: '/',
            maxAge: 7 * 24 * 60 * 60, // 7 days
          });
        }

        // Set expiration timestamp (non-sensitive, client-readable)
        if (refreshData.expiresIn) {
          const expiresAt = Date.now() + (refreshData.expiresIn * 1000);
          response.cookies.set('access_token_expires', expiresAt.toString(), {
            httpOnly: false, // OK: expiration timestamp is not sensitive
            secure: isSecure,
            sameSite: 'strict',
            path: '/',
            maxAge: 15 * 60,
          });
        }

        return response;
      } else {
        console.error('Token refresh failed in proxy:', refreshResponse.status);
      }
    } catch (error) {
      console.error('Token refresh error in proxy:', error);
    }
  }

  // If still no access token after refresh attempt, redirect to login
  if (!accessToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Valid token exists, proceed with the request
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

/**
 * Matcher configuration - run proxy on all routes except:
 * - Static files (_next/static)
 * - Images (_next/image)
 * - Favicon
 * - API routes (handled separately)
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
