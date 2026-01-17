/**
 * Admin Layout
 *
 * Layout for admin pages with:
 * - Horizontal topbar with admin-specific navigation
 * - Left sidebar with admin navigation
 * - Breadcrumb navigation
 * - Admin access control
 */

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AdminLeftSidebar } from "@/components/admin/admin-left-sidebar";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { HorizontalTopbar } from "@/components/navbar/horizontal-topbar";
import { ReactNode } from "react";

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

  return (
    <div className="h-svh flex flex-col">
      {/* Horizontal Topbar */}
      <HorizontalTopbar user={user} />

      {/* Admin Content Area with Left Sidebar */}
      <div className="flex flex-1 overflow-hidden">
        <AdminLeftSidebar />

        {/* Main Content Area */}
        <main className="flex-1 overflow-auto bg-[var(--sdp-content-bg)]">
          <div className="container mx-auto px-6 py-4">
            {/* Breadcrumb */}
            <AdminBreadcrumb className="mb-4" />

            {/* Page Content */}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
