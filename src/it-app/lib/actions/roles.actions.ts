"use server";

import { serverFetch, CACHE_PRESETS } from "@/lib/api/server-fetch";
import type {
  SettingRolesResponse,
  RoleCreateRequest,
  RoleResponse,
  RoleUpdateRequest,
  RolePagesResponse,
  RolePagesUpdateRequest,
  RoleUsersUpdateRequest,
} from "@/types/roles";
import type { AuthUserResponse } from "@/types/users";

/**
 * Fetches roles with pagination, filtering, and sorting capabilities
 *
 * Cache: NO_CACHE (dynamic filters/sorting require fresh data)
 */
export async function getRoles(params?: {
  limit: number;
  skip: number;
  filterCriteria?: {
    is_active?: string;
    name?: string;
    page_id?: string;
    [key: string]: string | undefined;
  };
}): Promise<SettingRolesResponse> {
  const queryParams = new URLSearchParams();

  // Backend uses page/per_page, not skip/limit
  const page = params?.skip ? Math.floor(params.skip / params.limit) + 1 : 1;
  queryParams.append("page", page.toString());
  queryParams.append("per_page", params?.limit.toString() ?? "10");

  // Add filter criteria
  if (params?.filterCriteria) {
    Object.entries(params.filterCriteria).forEach(([key, value]) => {
      if (value?.trim()) {
        queryParams.append(key, value);
      }
    });
  }

  return serverFetch<SettingRolesResponse>(
    `/roles/?${queryParams}`,
    CACHE_PRESETS.NO_CACHE()
  );
}

/**
 * Create new role
 */
export async function createRole(
  roleData: RoleCreateRequest
): Promise<RoleResponse> {
  return serverFetch<RoleResponse>(
    '/roles/',
    { method: 'POST', body: roleData }
  );
}

/**
 * Update existing role
 */
export async function updateRole(
  roleId: string,
  roleData: RoleUpdateRequest
): Promise<RoleResponse> {
  return serverFetch<RoleResponse>(
    `/roles/${roleId}`,
    { method: 'PUT', body: roleData }
  );
}

/**
 * Toggle role status (active/inactive)
 */
export async function toggleRoleStatus(roleId: string, newStatus: boolean): Promise<RoleResponse> {
  return serverFetch<RoleResponse>(
    `/roles/${roleId}/status?is_active=${newStatus}`,
    { method: 'PUT' }
  );
}

/**
 * Get pages assigned to a role
 *
 * Cache: 5 minutes (permission data, changes infrequently)
 * Invalidate via: revalidateTag(`role-pages:${roleId}`, {})
 */
export async function getRolePages(
  roleId: string,
  includeInactive: boolean = false
): Promise<RolePagesResponse> {
  const params = new URLSearchParams();
  if (includeInactive) {
    params.set("include_inactive", "true");
  }

  return serverFetch<RolePagesResponse>(
    `/roles/${roleId}/pages?${params.toString()}`,
    {
      revalidate: 300,
      tags: [`role-pages:${roleId}`],
    }
  );
}

/**
 * Update pages assigned to a role
 */
export async function updateRolePages(
  roleId: string,
  originalPageIds: number[],
  updatedPageIds: number[]
): Promise<{ message: string; added: number; removed: number }> {
  const request: RolePagesUpdateRequest = {
    originalPageIds,
    updatedPageIds,
  };

  return serverFetch<{ message: string; added: number; removed: number }>(
    `/roles/${roleId}/pages`,
    { method: 'PUT', body: request }
  );
}

/**
 * Get all users (for role assignment)
 *
 * Cache: 1 minute (user list, may change frequently)
 */
export async function getAllUsers(): Promise<AuthUserResponse[]> {
  return serverFetch<AuthUserResponse[]>(
    '/users/?per_page=100',
    CACHE_PRESETS.SHORT_LIVED()
  );
}

/**
 * Get users assigned to a role
 *
 * Cache: 5 minutes (role membership, changes infrequently)
 * Invalidate via: revalidateTag(`role-users:${roleId}`, {})
 */
export async function fetchRoleUsers(roleId: string): Promise<AuthUserResponse[]> {
  return serverFetch<AuthUserResponse[]>(
    `/roles/${roleId}/users`,
    {
      revalidate: 300,
      tags: [`role-users:${roleId}`],
    }
  );
}

/**
 * Update users assigned to a role
 */
export async function updateRoleUsers(
  roleId: string,
  originalUserIds: number[],
  updatedUserIds: number[]
): Promise<{ message: string; added: number; removed: number }> {
  const request: RoleUsersUpdateRequest = {
    originalUserIds,
    updatedUserIds,
  };

  return serverFetch<{ message: string; added: number; removed: number }>(
    `/roles/${roleId}/users`,
    { method: 'PUT', body: request }
  );
}
