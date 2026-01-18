/**
 * Admin Hub Layout
 *
 * Simple layout for the /admin hub page.
 * - No sidebar (full-width content)
 * - Admin access control
 *
 * NOTE: Admin sub-pages use (admin-pages) layout with sidebar.
 * The horizontal topbar is provided by the parent (it-pages) layout.
 */

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
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

  // Simple layout - full width content, no sidebar
  return (
    <main className="flex-1 overflow-auto bg-muted/30 h-[calc(100svh-64px)]">
      {children}
    </main>
  );
}
