/**
 * Admin Layout
 *
 * Layout for admin pages with:
 * - Left sidebar with admin navigation (hidden on /admin hub, visible on sub-pages)
 * - Breadcrumb navigation (hidden on /admin hub)
 * - Admin access control
 *
 * NOTE: The horizontal topbar is provided by the parent (it-pages) layout.
 * This layout only handles the left sidebar and content area.
 *
 * HYDRATION: Always renders the same structure to avoid hydration mismatch.
 * Sidebar visibility is controlled via CSS classes based on pathname.
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

  return (
    <div className="flex h-[calc(100svh-48px)]">
      {/* Left Sidebar - hidden on admin hub, visible on sub-pages */}
      <AdminLeftSidebar className={isAdminHub ? "hidden" : ""} />

      {/* Main Content Area */}
      <main className={cn(
        "flex-1 overflow-auto bg-muted/30",
        // On admin hub: full width, on sub-pages: normal width
        isAdminHub && "w-full"
      )}>
        <div className={cn(
          "container mx-auto px-6 py-4",
          // On admin hub: use full width without extra padding constraints
          isAdminHub && "px-6 py-0"
        )}>
          {/* Breadcrumb - hidden on admin hub */}
          {!isAdminHub && (
            <AdminBreadcrumb className="mb-4" />
          )}

          {/* Page Content */}
          {children}
        </div>
      </main>
    </div>
  );
}

// Helper function for conditional className (like cn from utils)
function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}
