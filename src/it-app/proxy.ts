/**
 * Next.js Proxy (Next.js 16+)
 *
 * This proxy handles:
 * 1. Adding pathname to request headers for server components
 * 2. NO auth logic (auth is handled in layouts/pages per Next.js best practices)
 *
 * Note: We explicitly avoid auth checks in proxy as recommended by Next.js.
 * Authentication is handled server-side in layouts and pages using the auth-guard utilities.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  // Clone the request headers
  const requestHeaders = new Headers(request.headers);

  // Add the pathname to headers so layouts can access it
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  // Add the full URL for reference
  requestHeaders.set("x-url", request.url);

  // Return response with updated headers
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
