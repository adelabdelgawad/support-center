/**
 * Support Center Layout
 *
 * Layout for technician users
 * Provides navigation and authentication
 *
 * UI TRANSFORMATION (ServiceDesk Plus):
 * - Uses horizontal top navigation instead of vertical sidebar
 * - Dark header with teal accent colors
 * - Admin hub accessible via gear icon for technicians
 *
 * PERFORMANCE OPTIMIZATION (Phase 2.1):
 * - Layout renders IMMEDIATELY without blocking network calls
 * - Navigation is read from cookie (instant, no API call)
 * - Fresh navigation is fetched in background via SWR
 * - Only redirects to login if session cookie is missing (fast check)
 *
 * NOTE: Admin routes (/admin/*) use their own layout with left sidebar
 * This layout handles main app pages (support-center, reports, etc.)
 */

import { NavigationProvider } from "@/components/navbar/navigation-provider";
import { PageRedirectWrapper } from "@/components/navbar/page-redirect-wrapper";
import { NavigationProgressProvider } from "@/lib/context/navigation-progress-context";
import {
  getNavigationCookieName,
  parseNavigationCookie,
} from "@/lib/utils/navigation-cookies";
import { serverFetch } from "@/lib/api/server-fetch";
import { HorizontalTopbar } from "@/components/navbar/horizontal-topbar";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { ReactNode } from "react";
import type { Page } from "@/types/pages";

interface SupportCenterLayoutProps {
  children: ReactNode;
}

// Server-side function to get current user from cookie (FAST - no network call)
async function getCurrentUser() {
  try {
    const cookieStore = await cookies();
    const userDataCookie = cookieStore.get('user_data');

    if (!userDataCookie || !userDataCookie.value) {
      return null;
    }

    const userData = JSON.parse(userDataCookie.value);
    return userData;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

// Server-side function to get navigation
// First tries cookie cache (fast), falls back to API fetch on first visit
async function getCachedNavigation(userId: string): Promise<Page[]> {
  try {
    const cookieStore = await cookies();
    const navCookie = cookieStore.get(getNavigationCookieName());

    // If we have a cached cookie, use it (fast path)
    if (navCookie?.value) {
      const pages = parseNavigationCookie(navCookie.value, userId);
      if (pages && pages.length > 0) {
        return pages;
      }
    }

    // No cache - fetch from backend (first visit or cache expired)
    // This blocks initial render but ensures navbar is visible
    try {
      const pages = await serverFetch<Page[]>(`/users/${userId}/pages`, {
        cache: 'no-store', // Don't cache since we have our own cookie cache
      });
      return pages || [];
    } catch (fetchError) {
      // If fetch fails (e.g., no auth), return empty - SWR will retry client-side
      console.warn('Failed to fetch navigation from backend:', fetchError);
      return [];
    }
  } catch (error) {
    console.error('Error getting cached navigation:', error);
    return [];
  }
}

export default async function SupportCenterLayout({ children }: SupportCenterLayoutProps) {
  // Get current pathname from headers (synchronous after await)
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") || "/support-center";

  // Get current user from cookies (FAST - no network call)
  const user = await getCurrentUser();

  // Redirect to login if not authenticated (session cookie missing)
  // This is a fast check - no network validation here
  if (!user) {
    const redirectUrl = encodeURIComponent(pathname);
    redirect(`/login?redirect=${redirectUrl}`);
  }

  // Check if user is a technician - agent portal requires technician access
  // This ensures navbar and pages are in sync with actual permissions
  // Skip check for /unauthorized page to prevent redirect loop
  const isUnauthorizedPage = pathname === '/unauthorized' || pathname.startsWith('/unauthorized');
  if (!isUnauthorizedPage) {
    const isTechnician = user.isTechnician === true || user.is_technician === true || user.isSuperAdmin === true || user.is_super_admin === true;
    if (!isTechnician) {
      redirect('/unauthorized?reason=not_technician');
    }
  }

  // PERFORMANCE: Get cached navigation from cookie (instant, no API call)
  // This enables server-side rendering of navigation
  // Fresh data is fetched in background via SWR
  const cachedPages = await getCachedNavigation(user.id);

  return (
    <div className="h-svh flex flex-col overflow-hidden">
      <NavigationProgressProvider>
        <NavigationProvider userId={user.id} initialPages={cachedPages}>
          {/* Handle auto-redirect for parent pages without paths */}
          <PageRedirectWrapper />

          {/* Horizontal Top Navigation Bar */}
          <HorizontalTopbar user={user} />

          {/* Main Content Area */}
          <main className="flex-1 overflow-auto bg-[var(--sdp-content-bg)]">
            <NuqsAdapter>{children}</NuqsAdapter>
          </main>
        </NavigationProvider>
      </NavigationProgressProvider>
    </div>
  );
}
