"use server";

import { cache } from "react";
import { serverGet, serverPost, serverPut } from "@/lib/fetch";
import type {
  SettingUsersResponse,
  AuthUserResponse,
  UserCreate,
  UserUpdateRolesRequest,
  UserWithRolesResponse
} from "@/types/users";
import type { Page } from "@/types/pages";
import type { RoleResponse } from "@/types/roles";

/**
 * Fetches all active roles for user forms (add/edit user)
 * This is a dedicated function for the users page to avoid coupling with roles page logic
 * Backend limit is 100 per page, so we fetch with max per_page
 *
 * Cache: NO_CACHE (reference data that rarely changes)
 * Invalidate via: revalidateTag('reference:roles', {})
 */
export async function getActiveRolesForUserForms(): Promise<RoleResponse[]> {
  try {
    const params = new URLSearchParams();
    params.append('page', '1');
    params.append('per_page', '100'); // Backend max is 100
    params.append('is_active', 'true');

    const response = await serverGet<{ roles: RoleResponse[] }>(
      `/roles?${params.toString()}`,
      { revalidate: 0 }
    );
    return response.roles ?? [];
  } catch (error: unknown) {
    console.error("Failed to fetch roles for user forms:", error);
    // Return empty array instead of throwing - forms can still work without role options
    return [];
  }
}

/**
 * Fetches users with their roles, pagination, filtering, and sorting
 * Uses the /api/v1/users/with-roles/ endpoint
 *
 * Cache: NO_CACHE (dynamic filters/sorting require fresh data)
 */
export async function getUsers(
  limit: number,
  skip: number,
  filters?: {
    is_active?: string;
    username?: string;
    role_id?: string;
    [key: string]: string | undefined;
  },
  sort?: Array<{ id: string; desc: boolean }>
): Promise<SettingUsersResponse> {
  const params = new URLSearchParams();

  // Convert skip/limit to page/per_page for backend
  const page = Math.floor(skip / limit) + 1;
  params.append('page', page.toString());
  params.append('per_page', limit.toString());

  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, value);
      }
    });
  }

  if (sort && sort.length > 0) {
    params.append('sort', JSON.stringify(sort));
  }

  return serverGet<SettingUsersResponse>(
    `/users/with-roles?${params.toString()}`,
    { revalidate: 0 }
  );
}

/**
 * Fetches domain users with optional update parameter
 *
 * Cache: NO_CACHE (may trigger AD sync based on shouldUpdate param)
 */
export async function getDomainUsers(
  shouldUpdate: boolean = true
): Promise<AuthUserResponse[]> {
  const params = new URLSearchParams();
  params.append("update", shouldUpdate ? "true" : "false");

  return serverGet<AuthUserResponse[]>(
    `/users/domain-users?${params.toString()}`,
    { revalidate: 0 }
  );
}

/**
 * Creates a new user with role assignments
 */
export async function createUser(userData: UserCreate) {
  return serverPost(
    '/users',
    userData
  );
}

/**
 * Updates user roles
 */
export async function updateUserRoles(
  userData: UserUpdateRolesRequest
): Promise<{ message: string; added: number; removed: number }> {
  return serverPut<{ message: string; added: number; removed: number }>(
    `/users/${userData.userId}/roles`,
    userData
  );
}

/**
 * Toggles user status (active/inactive)
 */
export async function toggleUserStatus(
  userId: string,
  newStatus: boolean
): Promise<UserWithRolesResponse> {
  return serverPut<UserWithRolesResponse>(
    `/users/${userId}/status`,
    { userId, isActive: newStatus }
  );
}

/**
 * Fetches pages associated with a user
 * @deprecated Use getUserPagesCached for layout-level fetching
 */
export async function getUserPages(userId: string): Promise<Array<Page>> {
  return getUserPagesCached(userId);
}

/**
 * Fetches pages associated with a user, deduplicated per request via React cache().
 *
 * Multiple layouts (parent + admin) call this for the same userId within a single
 * server render. React cache() ensures only ONE backend call is made per request.
 */
export const getUserPagesCached = cache(async (userId: string): Promise<Array<Page>> => {
  return serverGet<Page[]>(
    `/users/${userId}/pages`,
    { revalidate: 0 }
  );
});

/**
 * Updates status for multiple users (bulk operation)
 */
export async function updateUsersStatus(
  userIds: string[],
  isActive: boolean
): Promise<{ updatedUsers: UserWithRolesResponse[] }> {
  return serverPost<{ updatedUsers: UserWithRolesResponse[] }>(
    '/users/bulk-status',
    { userIds, isActive }
  );
}

/**
 * Fetches user count statistics
 *
 * Cache: NO_CACHE (dashboard stats, short-lived)
 */
export async function getUserCounts(): Promise<{
  total: number;
  activeCount: number;
  inactiveCount: number;
}> {
  return serverGet<{
    total: number;
    activeCount: number;
    inactiveCount: number;
  }>(
    '/users/counts',
    { revalidate: 0 }
  );
}
