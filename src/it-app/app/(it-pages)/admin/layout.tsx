/**
 * Admin Layout
 *
 * Layout for admin pages with:
 * - Left sidebar with admin navigation (ONLY on sub-pages, NOT on /admin hub)
 * - Breadcrumb navigation (NOT on /admin hub)
 * - Admin access control
 *
 * NOTE: The horizontal topbar is provided by the parent (it-pages) layout.
 * This layout only handles the left sidebar and content area.
 */

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AdminLeftSidebar } from "@/components/admin/admin-left-sidebar";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { ReactNode } from "react";
import { headers } from "next/headers";

interface AdminLayoutProps {
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

export default async function AdminLayout({ children }: AdminLayoutProps) {
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

  // Check if we're on the admin hub page (/admin) or a sub-page
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") || "/admin";
  const isAdminHub = pathname === "/admin" || pathname === "/admin/";

  // On admin hub page: no sidebar, full width content
  // On sub-pages: show sidebar and breadcrumb
  if (isAdminHub) {
    return (
      <main className="flex-1 overflow-auto bg-muted/30 h-[calc(100svh-48px)]">
        {children}
      </main>
    );
  }

  // Sub-page layout with sidebar and breadcrumb
  return (
    <div className="flex h-[calc(100svh-48px)]">
      <AdminLeftSidebar />

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto bg-muted/30">
        <div className="container mx-auto px-6 py-4">
          {/* Breadcrumb */}
          <AdminBreadcrumb className="mb-4" />

          {/* Page Content */}
          {children}
        </div>
      </main>
    </div>
  );
}
