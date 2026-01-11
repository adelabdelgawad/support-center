"use server";

import { serverFetch, CACHE_PRESETS } from "@/lib/api/server-fetch";
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
 * Cache: 10 minutes (reference data that rarely changes)
 * Invalidate via: revalidateTag('reference:roles', {})
 */
export async function getActiveRolesForUserForms(): Promise<RoleResponse[]> {
  try {
    const params = new URLSearchParams();
    params.append('page', '1');
    params.append('per_page', '100'); // Backend max is 100
    params.append('is_active', 'true');

    const response = await serverFetch<{ roles: RoleResponse[] }>(
      `/roles/?${params.toString()}`,
      CACHE_PRESETS.REFERENCE_DATA('roles')
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

  return serverFetch<SettingUsersResponse>(
    `/users/with-roles/?${params.toString()}`,
    CACHE_PRESETS.NO_CACHE()
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

  return serverFetch<AuthUserResponse[]>(
    `/users/domain-users/?${params.toString()}`,
    CACHE_PRESETS.NO_CACHE()
  );
}

/**
 * Creates a new user with role assignments
 */
export async function createUser(userData: UserCreate) {
  return serverFetch(
    '/users/',
    { method: 'POST', body: userData }
  );
}

/**
 * Updates user roles
 */
export async function updateUserRoles(
  userData: UserUpdateRolesRequest
): Promise<{ message: string; added: number; removed: number }> {
  return serverFetch<{ message: string; added: number; removed: number }>(
    `/users/${userData.userId}/roles`,
    { method: 'PUT', body: userData }
  );
}

/**
 * Toggles user status (active/inactive)
 */
export async function toggleUserStatus(
  userId: string,
  newStatus: boolean
): Promise<UserWithRolesResponse> {
  return serverFetch<UserWithRolesResponse>(
    `/users/${userId}/status`,
    {
      method: 'PUT',
      body: { userId, isActive: newStatus },
    }
  );
}

/**
 * Fetches pages associated with a user
 * @deprecated Use getUserPagesCached for layout-level fetching with Next.js cache
 *
 * Cache: NO_CACHE (deprecated function, use getUserPagesCached instead)
 */
export async function getUserPages(userId: string): Promise<Array<Page>> {
  return serverFetch<Page[]>(
    `/users/${userId}/pages`,
    CACHE_PRESETS.NO_CACHE()
  );
}

/**
 * Fetches pages associated with a user with Next.js cache semantics
 *
 * Uses time-based revalidation (5 minutes) and cache tags for precise invalidation.
 * This is the preferred method for layout-level data fetching as it:
 * - Reduces navigation blocking
 * - Caches per-user (scoped tags prevent cross-user cache sharing)
 * - Allows precise cache invalidation via revalidateTag()
 *
 * Cache invalidation (Next.js 16+):
 * ```typescript
 * import { revalidateTag } from 'next/cache';
 * revalidateTag(`user-pages:${userId}`, {});
 * ```
 */
export async function getUserPagesCached(userId: string): Promise<Array<Page>> {
  return serverFetch<Page[]>(
    `/users/${userId}/pages`,
    CACHE_PRESETS.USER_PAGES(userId)
  );
}

/**
 * Updates status for multiple users (bulk operation)
 */
export async function updateUsersStatus(
  userIds: string[],
  isActive: boolean
): Promise<{ updatedUsers: UserWithRolesResponse[] }> {
  return serverFetch<{ updatedUsers: UserWithRolesResponse[] }>(
    '/users/bulk-status',
    {
      method: 'POST',
      body: { userIds, isActive },
    }
  );
}

/**
 * Fetches user count statistics
 *
 * Cache: 1 minute (dashboard stats, short-lived)
 */
export async function getUserCounts(): Promise<{
  total: number;
  activeCount: number;
  inactiveCount: number;
}> {
  return serverFetch<{
    total: number;
    activeCount: number;
    inactiveCount: number;
  }>(
    '/users/counts/',
    CACHE_PRESETS.SHORT_LIVED()
  );
}
