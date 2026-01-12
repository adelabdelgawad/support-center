/**
 * Next.js Middleware for Authentication
 *
 * PERFORMANCE (F04):
 * - Auth checks happen at edge BEFORE page render
 * - Unblocks layout rendering by handling redirects early
 * - Uses lightweight cookie presence check (no network validation)
 *
 * Protected Routes:
 * - /support-center/* - Requires valid auth cookies
 * - /reports/* - Requires valid auth cookies
 * - /setting/* - Requires valid auth cookies
 * - /management/* - Requires valid auth cookies
 *
 * Public Routes:
 * - /login - Login page
 * - /unauthorized - Access denied page
 * - /not-authorized - Alternative access denied page
 * - /remote-session/* - Remote access connections
 * - /_next/* - Next.js internals
 * - /static/* - Static assets
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyAuthCookie } from '@/lib/auth/middleware-auth';

/**
 * Route matching configuration
 *
 * Defines which routes require authentication and which are public.
 */
const PROTECTED_ROUTES = [
  '/support-center',
  '/reports',
  '/setting',
  '/management',
];

const PUBLIC_ROUTES = [
  '/login',
  '/unauthorized',
  '/not-authorized',
  '/remote-session',
  '/_next',
  '/static',
  '/api/auth', // Auth endpoints (login, SSO, etc.)
  '/favicon.ico',
];

/**
 * Check if a path matches any of the given patterns
 */
function matchesPattern(pathname: string, patterns: string[]): boolean {
  return patterns.some(pattern => {
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return pathname.startsWith(prefix);
    }
    return pathname === pattern || pathname.startsWith(pattern + '/');
  });
}

/**
 * Check if route is public (no auth required)
 */
function isPublicRoute(pathname: string): boolean {
  return matchesPattern(pathname, PUBLIC_ROUTES);
}

/**
 * Check if route is protected (auth required)
 */
function isProtectedRoute(pathname: string): boolean {
  return matchesPattern(pathname, PROTECTED_ROUTES);
}

/**
 * Main middleware handler
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for public routes
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // For protected routes, check auth cookie presence
  if (isProtectedRoute(pathname)) {
    // Fast check: Does auth cookie exist?
    const hasAuthCookie = verifyAuthCookie(request);

    if (!hasAuthCookie) {
      // No auth cookie - redirect to login with return URL
      const redirectUrl = encodeURIComponent(pathname);
      const loginUrl = new URL(`/login?redirect=${redirectUrl}`, request.url);
      return NextResponse.redirect(loginUrl);
    }

    // Auth cookie exists - allow request to proceed
    // Layout will do full user data fetch and role checks
    return NextResponse.next();
  }

  // Unknown route pattern - allow through
  return NextResponse.next();
}

/**
 * Middleware matcher configuration
 *
 * Defines which routes this middleware should run on.
 * Uses negative match to skip static assets and API routes.
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder (public files)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
