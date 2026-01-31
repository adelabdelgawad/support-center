"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useRef } from "react";
import type { SettingUsersResponse, UserWithRolesResponse } from "@/types/users";
import type { RoleResponse } from "@/types/roles";
import { StatusPanel } from "../sidebar/status-panel";
import UsersTableBody from "./users-table-body";
import { UsersActionsProvider } from "../../context/users-actions-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import type { AppUser } from "@/types/auth";
import { Pagination } from "@/components/data-table/table/pagination";
import { toastSuccess, toastError } from "@/lib/toast";
import { MobileUsersView } from "../mobile/mobile-users-view";
import {
  toggleUserStatus,
  toggleUserTechnicianStatus,
  updateUsersStatus,
  updateUsersTechnicianStatus,
} from "@/lib/api/users";

interface UsersTableProps {
  initialData: SettingUsersResponse | null;
  roles: RoleResponse[];
}

/**
 * Fetcher function for manual data fetching
 * Uses Next.js internal API routes for authentication
 */
const fetcher = async (url: string): Promise<SettingUsersResponse> => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🌍 [Fetcher] FETCHING DATA');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('URL:', url);
  console.log('Timestamp:', new Date().toISOString());

  const response = await fetch(url, {
    credentials: "include",
  });

  console.log('Response status:', response.status);
  console.log('Response OK:', response.ok);

  if (!response.ok) {
    const error = await response.json();
    console.log('❌ [Fetcher] ERROR RESPONSE:', error);

    // Redirect to login on 401 (authentication required)
    if (response.status === 401) {
      console.log('🔒 [Fetcher] Authentication required - redirecting to login');
      window.location.href = '/login';
      throw new Error('Authentication required');
    }

    throw new Error(error.detail || "Failed to fetch users");
  }

  const data = await response.json();
  console.log('✅ [Fetcher] RESPONSE DATA:');
  console.log('  - Total:', data.total);
  console.log('  - Active Count:', data.activeCount);
  console.log('  - Inactive Count:', data.inactiveCount);
  console.log('  - Users array length:', data.users?.length);
  console.log('  - First user:', data.users?.[0] ? {
    id: data.users[0].id,
    username: data.users[0].username,
    isActive: data.users[0].isActive,
    isTechnician: data.users[0].isTechnician
  } : 'None');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  return data;
};

function UsersTable({
  initialData,
  roles,
}: UsersTableProps) {
  const searchParams = useSearchParams();

  // UUID validation helper
  const isValidUUID = (str: string): boolean => {
    if (!str) return false;
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return UUID_REGEX.test(str);
  };

  // Read URL parameters
  const page = Number(searchParams?.get("page") || "1");
  const limit = Number(searchParams?.get("limit") || "10");
  const filter = searchParams?.get("filter") || "";
  const isActiveFilter = searchParams?.get("is_active") || "";
  const userTypeFilter = searchParams?.get("user_type") || "";
  const roleParam = searchParams?.get("role") || "";

  // Validate role parameter - only use if it's a valid UUID
  const role = roleParam && isValidUUID(roleParam) ? roleParam : "";

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📍 [UsersTable] URL PARAMETERS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Status Filter (is_active):', isActiveFilter || 'NONE');
  console.log('User Type Filter (user_type):', userTypeFilter || 'NONE');
  console.log('Search Filter (filter):', filter || 'NONE');
  console.log('Role Filter (role - raw):', roleParam || 'NONE');
  console.log('Role Filter (role - validated):', role || 'NONE (invalid UUID filtered out)');
  console.log('Page:', page);
  console.log('Limit:', limit);

  // Build API URL with current filters - use Next.js API route
  const params = new URLSearchParams();
  params.append("page", page.toString());
  params.append("per_page", limit.toString());
  if (filter) params.append("username", filter);
  if (isActiveFilter) params.append("is_active", isActiveFilter);
  if (userTypeFilter) params.append("user_type", userTypeFilter);
  if (role) params.append("role_id", role); // Only add if validated as UUID

  // Use Next.js internal API route for authentication
  const apiUrl = `/api/users/with-roles?${params.toString()}`;

  console.log('🌐 [UsersTable] API URL:', apiUrl);

  // ============================================================
  // STATE MANAGEMENT (useState - Strategy A: Simple Fetching)
  // ============================================================

  // Initialize state with server-side data
  const [data, setData] = useState<SettingUsersResponse | null>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track if this is the initial mount to avoid unnecessary fetch
  const isInitialMount = useRef(true);
  // Track the previous initialData to detect SSR navigation
  const prevInitialDataRef = useRef(initialData);
  // Track current API URL to detect changes
  const currentUrlRef = useRef(apiUrl);

  /**
   * Manual refresh function - fetches data from API
   */
  const refresh = useCallback(async () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔄 [refresh] MANUAL REFRESH');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('URL:', apiUrl);
    console.log('Timestamp:', new Date().toISOString());

    setIsValidating(true);
    try {
      const response = await fetcher(apiUrl);
      console.log('✅ [refresh] FETCH SUCCESS - updating state');
      setData(response);
      setError(null);
    } catch (err) {
      console.log('❌ [refresh] FETCH ERROR:', err);
      setError(err as Error);
    } finally {
      setIsValidating(false);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }
  }, [apiUrl]);

  /**
   * Handle SSR data changes (URL navigation)
   * When initialData changes, update state directly without refetching
   */
  useEffect(() => {
    if (initialData && initialData !== prevInitialDataRef.current) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📦 [useEffect] SSR DATA CHANGED - updating state');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      setData(initialData);
      prevInitialDataRef.current = initialData;
    }
  }, [initialData]);

  /**
   * Handle URL parameter changes (filters, pagination)
   * When apiUrl changes, fetch new data
   */
  useEffect(() => {
    // Skip the first render - we already have data from SSR
    if (isInitialMount.current) {
      isInitialMount.current = false;
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🚀 [useEffect] INITIAL MOUNT - using SSR data');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      currentUrlRef.current = apiUrl;
      return;
    }

    // Only fetch if URL changed
    if (apiUrl !== currentUrlRef.current) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔍 [useEffect] URL CHANGED - fetching new data');
      console.log('Old URL:', currentUrlRef.current);
      console.log('New URL:', apiUrl);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      currentUrlRef.current = apiUrl;
      refresh();
    }
  }, [apiUrl, refresh]);

  const users = data?.users ?? [];

  // ============================================================
  // COUNTS FROM BACKEND (No frontend calculation needed!)
  // ============================================================

  // Global User Type counts (always reflect database totals - never change)
  // These are used for the User Type filter buttons
  const globalTotal = data?.globalTotal ?? initialData?.globalTotal ?? 0;
  const globalTechnicianCount = data?.technicianCount ?? initialData?.technicianCount ?? 0;
  const globalUserCount = data?.userCount ?? initialData?.userCount ?? 0;

  // Scoped Status counts (filtered by selected User Type)
  // These are used for the Status filter buttons and update when User Type changes
  const scopedActiveCount = data?.activeCount ?? initialData?.activeCount ?? 0;
  const scopedInactiveCount = data?.inactiveCount ?? initialData?.inactiveCount ?? 0;

  // Filtered total for pagination (all filters applied)
  const filteredTotal = data?.total ?? initialData?.total ?? 0;

  // Scoped Role counts (filtered by User Type AND Status)
  // These are used for the Role filter buttons and update when any filter changes
  const roleCounts = data?.roleCounts ?? initialData?.roleCounts ?? {};

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📦 [UsersTable] BACKEND-PROVIDED COUNTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Global User Type Counts (always database totals):');
  console.log('  - Global Total:', globalTotal);
  console.log('  - Technician Count:', globalTechnicianCount);
  console.log('  - User Count:', globalUserCount);
  console.log('');
  console.log('Scoped Status Counts (within selected User Type):');
  console.log('  - Active Count:', scopedActiveCount);
  console.log('  - Inactive Count:', scopedInactiveCount);
  console.log('');
  console.log('Filtered Total (for pagination):', filteredTotal);
  console.log('Number of users on current page:', users.length);

  // Counts object for context sharing
  const counts = {
    total: filteredTotal,
    // Scoped status counts (within selected User Type)
    activeCount: scopedActiveCount,
    inactiveCount: scopedInactiveCount,
    // Global user type counts (always database totals)
    globalTotal,
    technicianCount: globalTechnicianCount,
    userCount: globalUserCount,
  };

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📤 [UsersTable] PROPS TO COMPONENTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('StatusPanel will receive:');
  console.log('  - allUsers (globalTotal):', globalTotal);
  console.log('  - activeUsersCount (scoped):', scopedActiveCount);
  console.log('  - inactiveUsersCount (scoped):', scopedInactiveCount);
  console.log('  - technicianCount (global):', globalTechnicianCount);
  console.log('  - userCount (global):', globalUserCount);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  /**
   * Update users in state - updates specific users and refreshes to get accurate counts
   * Use this for updates where we already have the new data from API response
   */
  const updateUsers = useCallback(
    async (updatedUsers: UserWithRolesResponse[]) => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('⚡ [updateUsers] OPTIMISTIC UPDATE');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Updated users count:', updatedUsers.length);
      console.log('Updated users:', updatedUsers.map(u => ({
        id: u.id,
        username: u.username,
        isActive: u.isActive,
        isTechnician: u.isTechnician
      })));

      const currentData = data;
      if (!currentData) {
        console.log('❌ No current data, skipping optimistic update');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        return;
      }

      const updatedMap = new Map(updatedUsers.map((u) => [u.id, u]));

      // Update users with fresh data from API response
      const updatedUsersList = currentData.users.map((user) =>
        updatedMap.has(user.id) ? updatedMap.get(user.id)! : user
      );

      console.log('Updating state with updated users (will refresh to get fresh counts)');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      // Update state immediately with new user data
      setData({
        ...currentData,
        users: updatedUsersList,
      });

      // Then refresh to get accurate counts from backend
      await refresh();
    },
    [data, refresh]
  );

  /**
   * Add new user to state
   */
  const addUser = useCallback(
    async (newUser: UserWithRolesResponse) => {
      const currentData = data;
      if (!currentData) return;

      // Add user to list
      setData({
        ...currentData,
        users: [newUser, ...currentData.users],
        total: currentData.total + 1,
        // These will be refreshed from backend on refresh
        globalTotal: currentData.globalTotal + 1,
        technicianCount: newUser.isTechnician
          ? currentData.technicianCount + 1
          : currentData.technicianCount,
        userCount: !newUser.isTechnician
          ? currentData.userCount + 1
          : currentData.userCount,
        activeCount: newUser.isActive
          ? currentData.activeCount + 1
          : currentData.activeCount,
        inactiveCount: !newUser.isActive
          ? currentData.inactiveCount + 1
          : currentData.inactiveCount,
      });

      // Refresh to get accurate counts from backend
      await refresh();
    },
    [data, refresh]
  );

  /**
   * Force refetch - alias for refresh
   */
  const refetch = refresh;

  // Error state with retry button
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="text-destructive mb-2">Failed to load users</div>
          <div className="text-muted-foreground text-sm mb-4">{error.message}</div>
          <button onClick={refresh} className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90">
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Pagination should use filtered total (current query results)
  const totalItems = filteredTotal;
  const totalPages = Math.ceil(totalItems / limit);

  // Define actions for the context provider
  const actions = {
    onToggleUserStatus: async (userId: number, isActive: boolean) => {
      try {
        // Use Next.js API route via lib/api/users.ts
        const updatedUser = await toggleUserStatus(String(userId), isActive);
        // Optimistic update with response data
        await updateUsers([updatedUser]);
        toastSuccess(`User ${isActive ? "activated" : "deactivated"} successfully`);
        return { success: true };
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "Failed to update status";
        toastError(errorMessage);
        return { success: false, error: errorMessage };
      }
    },
    onToggleTechnicianStatus: async (userId: number, isTechnician: boolean) => {
      try {
        // Use Next.js API route via lib/api/users.ts
        const updatedUser = await toggleUserTechnicianStatus(String(userId), isTechnician);
        // Optimistic update with response data
        await updateUsers([updatedUser]);
        toastSuccess(`User ${isTechnician ? "marked as technician" : "unmarked as technician"} successfully`);
        return { success: true };
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "Failed to update technician status";
        toastError(errorMessage);
        return { success: false, error: errorMessage };
      }
    },
    onUpdateUser: async (userId: number, updatedUser: {
      fullName?: string | null;
      title?: string | null;
      roleIds: string[];
    }) => {
      try {
        // TODO: Create API route for user roles update if needed
        const response = await fetch(`/api/users/${userId}/roles`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(updatedUser),
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.detail || "Failed to update user");
        }
        const data = await response.json();
        await updateUsers([data]);
        toastSuccess("User updated successfully");
        return { success: true, data };
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "Failed to update user";
        toastError(errorMessage);
        return { success: false, error: errorMessage };
      }
    },
    updateUsers,
    addUser,
    onBulkUpdateStatus: async (userIds: number[], isActive: boolean) => {
      try {
        // Use Next.js API route via lib/api/users.ts
        const response = await updateUsersStatus(userIds.map(String), isActive);
        if (response.updatedUsers?.length > 0) {
          await updateUsers(response.updatedUsers);
        }
        toastSuccess(`Successfully ${isActive ? "activated" : "deactivated"} ${userIds.length} user(s)`);
        return { success: true, data: response.updatedUsers };
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "Failed to update users status";
        toastError(errorMessage);
        return { success: false, error: errorMessage };
      }
    },
    onBulkUpdateTechnician: async (userIds: number[], isTechnician: boolean) => {
      try {
        // Use Next.js API route via lib/api/users.ts
        const response = await updateUsersTechnicianStatus(userIds.map(String), isTechnician);
        if (response.updatedUsers?.length > 0) {
          await updateUsers(response.updatedUsers);
        }
        toastSuccess(`Successfully ${isTechnician ? "converted" : "removed"} ${userIds.length} user(s) ${isTechnician ? "to" : "from"} technician`);
        return { success: true, data: response.updatedUsers };
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "Failed to update technician status";
        toastError(errorMessage);
        return { success: false, error: errorMessage };
      }
    },
    onRefreshUsers: async () => {
      await refresh();
      return { success: true };
    },
    refetch,
    counts,
  };

  return (
    <UsersActionsProvider actions={actions}>
      <div className="relative h-full bg-background min-h-0">

        {/* Desktop View (md and up) */}
        <div className="hidden md:flex h-full p-1">
          {/* User Type & Role Filter Panel */}
          <StatusPanel
            roles={roles}
            roleCounts={roleCounts}
            technicianCount={globalTechnicianCount}
            userCount={globalUserCount}
            totalCount={globalTotal}
          />

          {/* Main Content */}
          <ErrorBoundary>
            <div className="flex-1 h-full flex flex-col min-h-0 min-w-0 ml-2 space-y-2">
              {/* Table */}
              <div className="flex-1 min-h-0 flex flex-col w-full">
                <UsersTableBody
                  users={users}
                  page={page}
                  refetch={refetch}
                  updateUsers={updateUsers}
                  addUser={addUser}
                  isValidating={isValidating}
                  activeCount={scopedActiveCount}
                  inactiveCount={scopedInactiveCount}
                />
              </div>

              {/* Pagination */}
              <div className="shrink-0 bg-card border-t border-border">
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  pageSize={limit}
                  totalItems={totalItems}
                />
              </div>
            </div>
          </ErrorBoundary>
        </div>

        {/* Mobile View (below md) */}
        <div className="md:hidden h-full">
          <ErrorBoundary>
            <MobileUsersView
              users={users}
              page={page}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={limit}
              technicianCount={globalTechnicianCount}
              userCount={globalUserCount}
              globalTotal={globalTotal}
              activeCount={scopedActiveCount}
              inactiveCount={scopedInactiveCount}
              totalCount={filteredTotal}
              roles={roles}
              roleCounts={roleCounts}
              refetch={refetch}
              updateUsers={updateUsers}
              addUser={addUser}
              isValidating={isValidating}
            />
          </ErrorBoundary>
        </div>
      </div>
    </UsersActionsProvider>
  );
}

export default UsersTable;
