'use client';

/**
 * Client-side API functions for user management
 * Calls internal Next.js API routes (not backend directly)
 */

import { apiClient, getClientErrorMessage as getErrorMessage } from '../fetch/client';
import type {
  SettingUsersResponse,
  AuthUserResponse,
  UserCreate,
  UserUpdateRolesRequest,
  UserWithRolesResponse
} from "@/types/users";
import type { Page } from "@/types/pages";

/**
 * Fetches users with pagination, filtering, and sorting
 * Uses the /api/users/with-roles route
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
  try {
    const params = new URLSearchParams();

    // Convert skip/limit to page/per_page for backend
    const page = Math.floor(skip / limit) + 1;
    params.append("page", page.toString());
    params.append("per_page", limit.toString());

    // Add all filters to the URL parameters
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          params.append(key, value);
        }
      });
    }

    // Add sort parameter if provided
    if (sort && sort.length > 0) {
      params.append("sort", JSON.stringify(sort));
    }

    return await apiClient.get<SettingUsersResponse>(`/api/users/with-roles?${params.toString()}`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Fetches domain users with optional update parameter
 */
export async function getDomainUsers(
  shouldUpdate: boolean = true
): Promise<AuthUserResponse[]> {
  try {
    const params = new URLSearchParams();
    params.append("update", shouldUpdate ? "true" : "false");

    return await apiClient.get<AuthUserResponse[]>(`/api/setting/users/domain-users/search?${params.toString()}`);
  } catch {
    // Return a default user on error to match legacy behavior
    return [
      {
        id: "00000000-0000-0000-0000-000000000000",  // Changed from 1 to UUID format
        username: "administrator",
        fullName: "Administrator",
        email: "admin@domain.loc",
        title: "System Administrator",
        isTechnician: false,
        isOnline: false,
        isActive: true,
        isSuperAdmin: true,
        isDomain: true,
        isBlocked: false,
      },
    ];
  }
}

/**
 * Creates a new user with role assignments
 */
export async function createUser(userData: UserCreate): Promise<UserWithRolesResponse> {
  try {
    return await apiClient.post<UserWithRolesResponse>('/api/setting/users', userData);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Updates user roles
 */
export async function updateUserRoles(
  userData: UserUpdateRolesRequest
): Promise<{ message: string; added: number; removed: number }> {
  try {
    return await apiClient.put<{ message: string; added: number; removed: number }>(
      `/api/users/${userData.userId}/roles`,
      userData
    );
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Toggles user status (active/inactive)
 * Uses Next.js API route which proxies to backend
 */
export async function toggleUserStatus(
  userId: string,  // Changed from number to string UUID
  newStatus: boolean
): Promise<UserWithRolesResponse> {
  return apiClient.put<UserWithRolesResponse>(
    `/api/users/${userId}/status`,
    { userId, isActive: newStatus }
  );
}

/**
 * Fetches pages associated with a user
 */
export async function getUserPages(userId: string): Promise<Array<Page>> {  // Changed from number to string UUID
  try {
    return await apiClient.get<Array<Page>>(`/api/setting/users/${userId}/pages`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Updates status for multiple users (bulk operation)
 * Uses Next.js API route which proxies to backend
 */
export async function updateUsersStatus(
  userIds: string[],  // Changed from number[] to string[] UUID[]
  isActive: boolean
): Promise<{ updatedUsers: UserWithRolesResponse[] }> {
  return apiClient.post<{ updatedUsers: UserWithRolesResponse[] }>(
    '/api/users/bulk-status',
    { userIds, isActive }
  );
}

/**
 * Fetches user count statistics
 */
export async function getUserCounts(): Promise<{
  total: number;
  activeCount: number;
  inactiveCount: number;
}> {
  try {
    return await apiClient.get<{ total: number; activeCount: number; inactiveCount: number }>(
      '/api/setting/users/counts'
    );
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Toggles user technician status
 * Uses Next.js API route which proxies to backend
 */
export async function toggleUserTechnicianStatus(
  userId: string,  // Changed from number to string UUID
  isTechnician: boolean
): Promise<UserWithRolesResponse> {
  return apiClient.put<UserWithRolesResponse>(
    `/api/users/${userId}/technician`,
    { userId, isTechnician }
  );
}

/**
 * Updates technician status for multiple users (bulk operation)
 * Uses Next.js API route which proxies to backend
 */
export async function updateUsersTechnicianStatus(
  userIds: string[],  // Changed from number[] to string[] UUID[]
  isTechnician: boolean
): Promise<{ updatedUsers: UserWithRolesResponse[] }> {
  return apiClient.post<{ updatedUsers: UserWithRolesResponse[] }>(
    '/api/users/bulk-technician',
    { userIds, isTechnician }
  );
}
