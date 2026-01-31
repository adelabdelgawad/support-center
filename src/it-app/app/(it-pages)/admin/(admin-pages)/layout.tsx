/**
 * Admin Sub-Pages Layout
 *
 * Layout for admin sub-pages (/admin/setting/*, /admin/management/*)
 * - Left sidebar with admin navigation
 * - Admin access control
 *
 * HYDRATION FIX: Adopts network_manager's server-first pattern
 * - Server computes all navigation state before rendering
 * - Client receives exact state as props (no mismatches)
 * - Clear hydration boundary with isHydrated flag
 *
 * NOTE: The horizontal topbar is provided by the parent layouts.
 * This layout only handles the left sidebar and content area.
 */

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { AdminLeftSidebar } from "@/components/admin/admin-left-sidebar";
import { buildAdminNavigationWithState } from "@/lib/utils/admin-navigation-utils";
import { getUserPagesCached } from "@/lib/actions/users.actions";
import { ReactNode } from "react";

interface AdminPagesLayoutProps {
  children: ReactNode;
}

// Server-side function to get current user from cookie
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

export default async function AdminPagesLayout({ children }: AdminPagesLayoutProps) {
  // Get current pathname from headers (server-side)
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") || "/admin";

  // Get current user from cookies
  const user = await getCurrentUser();

  // Redirect to login if not authenticated
  if (!user) {
    redirect('/login?redirect=/admin');
  }

  // Check if user is a technician/admin - admin pages require technician access
  const isTechnician = user.isTechnician === true || user.is_technician === true ||
                       user.isSuperAdmin === true || user.is_super_admin === true;

  if (!isTechnician) {
    redirect('/unauthorized?reason=not_admin');
  }

  // HYDRATION FIX: Build navigation state server-side
  // This ensures the sidebar renders with correct state on first paint
  const pages = await getUserPagesCached(user.id);
  const { navigation, expandedSections, activeLink } = buildAdminNavigationWithState(pages, pathname);

  // Layout with sidebar for all admin sub-pages
  return (
    <div className="flex h-[calc(100svh-64px)]" suppressHydrationWarning>
      <AdminLeftSidebar
        serverNavigation={navigation}
        serverExpandedSections={expandedSections}
        serverActiveLink={activeLink}
        serverPathname={pathname}
      />

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto bg-muted/30">
        {children}
      </main>
    </div>
  );
}
