/**
 * Admin Access Validation Actions
 *
 * Server-side validation for admin-only routes
 */

import { redirect } from "next/navigation";
import { cookies } from "next/headers";

interface UserData {
  id: string;
  username: string;
  fullName?: string;
  email?: string;
  isTechnician?: boolean;
  is_technician?: boolean;
  isSuperAdmin?: boolean;
  is_super_admin?: boolean;
}

/**
 * Validates that the current user has admin/technician access.
 * Redirects to unauthorized page if validation fails.
 *
 * @returns Promise<void> - Redirects on failure, resolves on success
 */
export async function validateAdminAccess(): Promise<void> {
  const user = await getCurrentUser();

  if (!user) {
    const currentPath = await getCurrentPathname();
    redirect(`/login?redirect=${encodeURIComponent(currentPath)}`);
  }

  const isTechnician =
    user.isTechnician === true ||
    user.is_technician === true ||
    user.isSuperAdmin === true ||
    user.is_super_admin === true;

  if (!isTechnician) {
    redirect('/unauthorized?reason=not_admin');
  }
}

/**
 * Gets the current user from the user_data cookie.
 *
 * @returns Promise<UserData | null>
 */
export async function getCurrentUser(): Promise<UserData | null> {
  try {
    const cookieStore = await cookies();
    const userDataCookie = cookieStore.get('user_data');

    if (!userDataCookie || !userDataCookie.value) {
      return null;
    }

    const userData = JSON.parse(userDataCookie.value) as UserData;
    return userData;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

/**
 * Gets the current pathname from headers.
 * Used for redirect after login.
 *
 * @returns Promise<string>
 */
async function getCurrentPathname(): Promise<string> {
  try {
    const headersList = await headers();
    return headersList.get("x-pathname") || "/admin";
  } catch {
    return "/admin";
  }
}

/**
 * Checks if the current user is an admin/technician.
 * Does not redirect - returns boolean for conditional rendering.
 *
 * @returns Promise<boolean>
 */
export async function isAdminUser(): Promise<boolean> {
  const user = await getCurrentUser();

  if (!user) {
    return false;
  }

  return (
    user.isTechnician === true ||
    user.is_technician === true ||
    user.isSuperAdmin === true ||
    user.is_super_admin === true
  );
}
