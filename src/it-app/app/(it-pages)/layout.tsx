/**
 * Support Center Layout
 *
 * Layout for technician users
 * Provides navigation and authentication
 *
 * PERFORMANCE OPTIMIZATION (Phase 2.1):
 * - Layout renders IMMEDIATELY without blocking network calls
 * - Navigation is read from cookie (instant, no API call)
 * - Fresh navigation is fetched in background via SWR
 * - Only redirects to login if session cookie is missing (fast check)
 *
 * NOTE: Access control is enforced by backend via role dependencies
 * If non-technician accesses this route, backend will return 403 Forbidden
 */

import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { NavigationProvider } from "@/components/navbar/navigation-provider";
import { SidebarNavWrapper } from "@/components/navbar/sidebar-nav-wrapper";
import { ChildrenTabsWrapper } from "@/components/navbar/children-tabs-wrapper";
import { PageRedirectWrapper } from "@/components/navbar/page-redirect-wrapper";
import { NavigationProgressProvider } from "@/lib/context/navigation-progress-context";
import {
  getNavigationCookieName,
  parseNavigationCookie,
} from "@/lib/utils/navigation-cookies";
import { serverFetch } from "@/lib/api/server-fetch";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { ReactNode } from "react";
import type { Page } from "@/types/pages";

interface SupportCenterLayoutProps {
  children: ReactNode;
}

// NavItem structure for pre-built navigation
interface NavItem {
  id: string;
  title: string;
  path: string | null;
  icon: string | null;
  children: NavItem[];
  isParent: boolean;
}

// Build navigation structure from pages (server-side)
function buildServerNavigation(pages: Page[]): NavItem[] {
  const navigation: NavItem[] = [];

  // Filter active pages excluding Profile
  const activePages = pages.filter((page) => {
    const isActive = (page as any).isActive ?? (page as any).is_active ?? true;
    return isActive && page.title !== "Profile";
  });

  // Helper to get parent ID (handles both camelCase and snake_case)
  const getParentId = (page: Page): string | null => {
    const parentId = (page as any).parentId ?? page.parent_id;
    return parentId != null ? String(parentId) : null;
  };

  // Get root pages (pages without parent)
  const rootPages = activePages.filter((page) => {
    const parentId = getParentId(page);
    return !parentId;
  });

  rootPages.forEach((rootPage) => {
    const rootId = String(rootPage.id);
    const children = activePages.filter((page) => {
      const parentId = getParentId(page);
      return parentId === rootId;
    });

    const navItem: NavItem = {
      id: rootPage.id.toString(),
      title: rootPage.title,
      path: rootPage.path
        ? rootPage.path.startsWith("/")
          ? rootPage.path
          : "/" + rootPage.path
        : null,
      icon: rootPage.icon || null,
      children: children.map((child) => ({
        id: child.id.toString(),
        title: child.title,
        path: child.path
          ? child.path.startsWith("/")
            ? child.path
            : "/" + child.path
          : null,
        icon: child.icon || null,
        children: [],
        isParent: false,
      })),
      isParent: children.length > 0,
    };
    navigation.push(navItem);
  });

  return navigation;
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

  // Pre-build navigation structure on server for instant render
  const serverNavigation = buildServerNavigation(cachedPages);

  return (
    <div className="h-svh flex flex-col overflow-hidden">
      <NavigationProgressProvider>
        <NavigationProvider userId={user.id} initialPages={cachedPages}>
          <SidebarProvider className="flex-1 min-h-0">
            {/* Handle auto-redirect for parent pages without paths */}
            <PageRedirectWrapper />

            {/* Vertical Sidebar Navigation (uses pre-built structure immediately) */}
            <SidebarNavWrapper
              user={user}
              serverPathname={pathname}
              serverNavigation={serverNavigation}
            />

            {/* Main Content Area with Sidebar Inset */}
            <SidebarInset className="flex flex-col min-h-0 overflow-x-hidden">
              {/* Header with Trigger and Children Tabs */}
              <header className="flex shrink-0 items-center gap-2 border-b bg-background">
                <div className="flex items-center gap-2 px-3 py-2">
                  {/* SidebarTrigger: Opens mobile drawer on < lg, toggles sidebar on >= lg */}
                  <SidebarTrigger />
                  <Separator orientation="vertical" className="h-6 hidden lg:block" />
                </div>

                {/* Children Tab Navigation (uses cached data immediately) */}
                <ChildrenTabsWrapper
                  serverPathname={pathname}
                />
              </header>

              {/* Page Content */}
              <main className="flex flex-1 min-h-0 flex-col overflow-x-hidden">
                <NuqsAdapter>{children}</NuqsAdapter>
              </main>
            </SidebarInset>
          </SidebarProvider>
        </NavigationProvider>
      </NavigationProgressProvider>
    </div>
  );
}
