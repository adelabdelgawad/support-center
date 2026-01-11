/**
 * Server-side authentication guard utility.
 *
 * This module provides auth guard functions for server components and pages.
 * Use these to enforce authentication requirements before rendering protected content.
 *
 * Key features:
 * - Server-side only (uses cookies() and redirect() from Next.js)
 * - Validates token with backend
 * - Automatic redirect to login on auth failure
 * - Support for public pages (login, SSO, etc.)
 */

import { redirect } from "next/navigation";
import { checkToken, type User } from "./check-token";

/**
 * Public routes that don't require authentication.
 * These pages can be accessed without a valid token.
 */
const PUBLIC_ROUTES = [
  "/login",
  "/sso",
  "/not-authorized",
];

/**
 * Check if a path is public (doesn't require authentication).
 */
export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(route => pathname.startsWith(route));
}

/**
 * Server-side auth guard that enforces authentication.
 *
 * This function should be called in server components or pages that require authentication.
 * It validates the user's token and redirects to login if invalid.
 *
 * Behavior:
 * 1. Validates authentication token with backend
 * 2. Returns user if authenticated
 * 3. Redirects to /login if not authenticated or token invalid
 *
 * @param options - Optional configuration
 * @param options.redirectTo - Custom redirect URL (default: /login)
 * @returns Promise<User> - Authenticated user object
 * @throws Redirect to login page if not authenticated
 *
 * @example
 * // In a server component or page
 * export default async function DashboardPage() {
 *   const user = await requireAuth();
 *   return <div>Welcome {user.fullName}</div>;
 * }
 *
 * @example
 * // In a layout
 * export default async function ProtectedLayout({ children }) {
 *   const user = await requireAuth();
 *   return <div>{children}</div>;
 * }
 */
export async function requireAuth(options?: {
  redirectTo?: string;
}): Promise<User> {
  const redirectTo = options?.redirectTo || "/login";

  const result = await checkToken();

  if (!result.ok || !result.user) {
    // Add reason as query param for better UX
    const reason = result.reason === "unauthorized" ? "?session_expired=true" : "";
    redirect(`${redirectTo}${reason}`);
  }

  return result.user;
}

/**
 * Server-side auth check that returns null instead of redirecting.
 *
 * Use this when you want to check auth status without forcing a redirect.
 * Useful for pages that show different content for authenticated vs unauthenticated users.
 *
 * @returns Promise<User | null> - User if authenticated, null otherwise
 *
 * @example
 * // In a page that shows different content based on auth
 * export default async function HomePage() {
 *   const user = await getAuthUser();
 *   if (user) {
 *     return <AuthenticatedHome user={user} />;
 *   }
 *   return <PublicHome />;
 * }
 */
export async function getAuthUser(): Promise<User | null> {
  const result = await checkToken();
  return result.ok && result.user ? result.user : null;
}

/**
 * Verify that the current user is NOT authenticated.
 *
 * Use this on public pages like login/register to redirect already-authenticated
 * users away from auth pages.
 *
 * @param redirectTo - Where to redirect authenticated users (default: /support-center/requests)
 *
 * @example
 * // In login page
 * export default async function LoginPage() {
 *   await requireGuest();
 *   return <LoginForm />;
 * }
 */
export async function requireGuest(redirectTo?: string): Promise<void> {
  const user = await getAuthUser();

  if (user) {
    redirect(redirectTo || "/support-center/requests");
  }
}
