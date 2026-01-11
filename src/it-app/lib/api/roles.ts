'use client';

/**
 * Client-side API for roles
 * All calls go through Next.js API routes (/api/setting/roles/*)
 * which then proxy to the backend. This ensures the backend is only
 * accessible from the server.
 */

import { apiClient, getClientErrorMessage as getErrorMessage } from '../fetch/client';
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

const API_BASE = "/api/setting/roles";

/**
 * Fetches roles with pagination, filtering, and sorting capabilities
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
  try {
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

    return await apiClient.get<SettingRolesResponse>(`${API_BASE}?${queryParams}`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Creates a new role
 */
export async function createRole(roleData: RoleCreateRequest): Promise<RoleResponse> {
  try {
    return await apiClient.post<RoleResponse>(API_BASE, roleData);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Updates an existing role
 */
export async function updateRole(
  roleId: string,
  roleData: RoleUpdateRequest
): Promise<RoleResponse> {
  try {
    return await apiClient.put<RoleResponse>(`${API_BASE}/${roleId}`, roleData);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Toggles role status (active/inactive)
 */
export async function toggleRoleStatus(
  roleId: string,
  newStatus: boolean
): Promise<RoleResponse> {
  try {
    return await apiClient.put<RoleResponse>(
      `${API_BASE}/${roleId}/status?is_active=${newStatus}`
    );
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Fetches pages associated with a role
 */
export async function getRolePages(
  roleId: string,
  includeInactive: boolean = false
): Promise<RolePagesResponse> {
  try {
    const params = new URLSearchParams();
    if (includeInactive) {
      params.set("include_inactive", "true");
    }

    return await apiClient.get<RolePagesResponse>(
      `${API_BASE}/${roleId}/pages?${params.toString()}`
    );
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Updates pages associated with a role
 */
export async function updateRolePages(
  roleId: string,
  originalPageIds: number[],
  updatedPageIds: number[]
): Promise<void> {
  try {
    const request: RolePagesUpdateRequest = {
      originalPageIds,
      updatedPageIds,
    };

    await apiClient.put(`${API_BASE}/${roleId}/pages`, request);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Fetches all users (with max pagination)
 */
export async function getAllUsers(): Promise<AuthUserResponse[]> {
  try {
    return await apiClient.get<AuthUserResponse[]>('/api/setting/users?per_page=100');
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Fetches users associated with a role
 */
export async function fetchRoleUsers(roleId: string): Promise<AuthUserResponse[]> {
  try {
    return await apiClient.get<AuthUserResponse[]>(`${API_BASE}/${roleId}/users`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Updates users associated with a role
 */
export async function updateRoleUsers(
  roleId: string,
  originalUserIds: number[],
  updatedUserIds: number[]
): Promise<{ message: string; added: number; removed: number }> {
  try {
    const request: RoleUsersUpdateRequest = {
      originalUserIds,
      updatedUserIds,
    };

    return await apiClient.put<{ message: string; added: number; removed: number }>(
      `${API_BASE}/${roleId}/users`,
      request
    );
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Fetches role count statistics
 */
export async function getRoleCounts(): Promise<{
  total: number;
  activeCount: number;
  inactiveCount: number;
}> {
  try {
    return await apiClient.get<{ total: number; activeCount: number; inactiveCount: number }>(
      `${API_BASE}/counts`
    );
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}
