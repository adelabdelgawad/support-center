"use client";

import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { useCallback, useEffect, useRef } from "react";
import type { SettingUsersResponse, UserWithRolesResponse } from "@/types/users";
import type { RoleResponse } from "@/types/roles";
import { StatusPanel } from "../sidebar/status-panel";
import UsersTableBody from "./users-table-body";
import LoadingSkeleton from "@/components/loading-skelton";
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

interface Session {
  accessToken: string;
  user: AppUser;
}

interface UsersTableProps {
  session: Session;
  initialData: SettingUsersResponse | null;
  roles: RoleResponse[];
}

/**
 * Fetcher function for SWR - optimized for caching and deduping
 * Uses Next.js internal API routes for authentication
 */
const fetcher = async (url: string) => {
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
  session,
  initialData,
  roles,
}: UsersTableProps) {
  const searchParams = useSearchParams();

  // Read URL parameters
  const page = Number(searchParams?.get("page") || "1");
  const limit = Number(searchParams?.get("limit") || "10");
  const filter = searchParams?.get("filter") || "";
  const isActiveFilter = searchParams?.get("is_active") || "";
  const userTypeFilter = searchParams?.get("user_type") || "";
  const role = searchParams?.get("role") || "";

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📍 [UsersTable] URL PARAMETERS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Status Filter (is_active):', isActiveFilter || 'NONE');
  console.log('User Type Filter (user_type):', userTypeFilter || 'NONE');
  console.log('Search Filter (filter):', filter || 'NONE');
  console.log('Role Filter (role):', role || 'NONE');
  console.log('Page:', page);
  console.log('Limit:', limit);

  // Build API URL with current filters - use Next.js API route
  const params = new URLSearchParams();
  params.append("page", page.toString());
  params.append("per_page", limit.toString());
  if (filter) params.append("username", filter);
  if (isActiveFilter) params.append("is_active", isActiveFilter);
  if (userTypeFilter) params.append("user_type", userTypeFilter);
  if (role) params.append("role_id", role);

  // Use Next.js internal API route for authentication
  const apiUrl = `/api/users/with-roles?${params.toString()}`;

  console.log('🌐 [UsersTable] API URL:', apiUrl);

  /**
   * SWR Configuration - Manual Refetch Only
   *
   * ALL automatic client-side refetching is DISABLED:
   * - No refetch on mount
   * - No refetch on window focus
   * - No refetch on reconnect
   * - No refetch when data becomes stale
   *
   * Data ONLY refetches when:
   * - Filters change (isActiveFilter, userTypeFilter, filter, role)
   * - Page changes
   * - Manual refetch is called (via refresh button, etc.)
   *
   * This is handled by the useEffect below that watches filter parameters.
   */
  // Check if initial data is empty - if so, we need to fetch on mount
  const hasRealInitialData = initialData && initialData.users && initialData.users.length > 0;

  const { data, mutate, isLoading, isValidating, error } = useSWR<SettingUsersResponse>(
    apiUrl,
    fetcher,
    {
      // Use server-side data as initial cache
      fallbackData: initialData ?? undefined,

      // Keep previous data for smooth transitions
      keepPreviousData: true,

      // Fetch on mount if no real initial data (e.g., came from empty fallback)
      revalidateOnMount: !hasRealInitialData,
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,

      // Dedupe requests within 2 seconds
      dedupingInterval: 2000,
    }
  );

  // Track if this is the initial mount to avoid unnecessary refetch
  const isInitialMount = useRef(true);
  // Track the previous initialData to detect SSR navigation
  const prevInitialDataRef = useRef(initialData);

  // When initialData changes (SSR navigation), update SWR cache directly
  // This avoids a redundant CSR fetch after URL navigation
  useEffect(() => {
    // If initialData changed (due to URL navigation with SSR data)
    if (initialData && initialData !== prevInitialDataRef.current) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📦 [useEffect] SSR DATA CHANGED - UPDATING SWR CACHE');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      // Update SWR cache with new SSR data (no revalidation needed)
      mutate(initialData, { revalidate: false });
      prevInitialDataRef.current = initialData;
    }
  }, [initialData, mutate]);

  // Force revalidation ONLY for manual refresh (not on filter/page changes)
  // URL navigation already provides fresh SSR data via initialData
  useEffect(() => {
    // Skip the first render - we already have data from SSR
    if (isInitialMount.current) {
      isInitialMount.current = false;
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🚀 [useEffect] INITIAL MOUNT - SKIPPING REFETCH (using SSR data)');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      return;
    }

    // If initialData is available and matches current filters, skip refetch
    // The SSR data update effect above handles this case
    if (initialData) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📦 [useEffect] SSR DATA AVAILABLE - SKIPPING CSR REFETCH');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      return;
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔄 [useEffect] NO SSR DATA - TRIGGERING CSR REFETCH');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Only fetch if we don't have SSR data
    mutate();
  }, [isActiveFilter, userTypeFilter, filter, role, page, mutate, initialData]);

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
   * Optimistic update - updates specific users in SWR cache WITHOUT refetching
   * Use this for updates where we already have the new data from API response
   */
  const updateUsersOptimistic = useCallback(
    async (updatedUsers: UserWithRolesResponse[]) => {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('⚡ [updateUsersOptimistic] OPTIMISTIC UPDATE');
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

      console.log('Updating SWR cache with updated users (will revalidate to get fresh counts)');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      // For status/technician updates, just update the users list
      // and let the backend provide accurate counts on next fetch
      const newData: SettingUsersResponse = {
        ...currentData,
        users: updatedUsersList,
      };

      // Revalidate to get fresh counts from backend
      await mutate(newData, { revalidate: true });
    },
    [mutate, data]
  );

  /**
   * Add new user to cache
   */
  const addUserToCache = useCallback(
    async (newUser: UserWithRolesResponse) => {
      const currentData = data;
      if (!currentData) return;

      // Add user to list and revalidate to get fresh counts from backend
      const newData: SettingUsersResponse = {
        ...currentData,
        users: [newUser, ...currentData.users],
        total: currentData.total + 1,
        // These will be refreshed from backend on revalidate
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
      };

      await mutate(newData, { revalidate: true });
    },
    [mutate, data]
  );

  /**
   * Force refetch
   */
  const refetch = useCallback(() => {
    mutate();
  }, [mutate]);

  // Error state with retry button
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="text-destructive mb-2">Failed to load users</div>
          <div className="text-muted-foreground text-sm mb-4">{error.message}</div>
          <button onClick={() => mutate()} className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90">
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
        await updateUsersOptimistic([updatedUser]);
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
        await updateUsersOptimistic([updatedUser]);
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
        await updateUsersOptimistic([data]);
        toastSuccess("User updated successfully");
        return { success: true, data };
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "Failed to update user";
        toastError(errorMessage);
        return { success: false, error: errorMessage };
      }
    },
    updateUsers: updateUsersOptimistic,
    addUser: addUserToCache,
    onBulkUpdateStatus: async (userIds: number[], isActive: boolean) => {
      try {
        // Use Next.js API route via lib/api/users.ts
        const response = await updateUsersStatus(userIds.map(String), isActive);
        if (response.updatedUsers?.length > 0) {
          await updateUsersOptimistic(response.updatedUsers);
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
          await updateUsersOptimistic(response.updatedUsers);
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
      await mutate();
      return { success: true };
    },
    refetch,
    counts,
  };

  return (
    <UsersActionsProvider actions={actions}>
      <div className="relative h-full bg-background min-h-0">
        {/* Loading Overlay */}
        {isLoading && <LoadingSkeleton />}

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
                  updateUsers={updateUsersOptimistic}
                  addUser={addUserToCache}
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
              updateUsers={updateUsersOptimistic}
              addUser={addUserToCache}
              isValidating={isValidating}
            />
          </ErrorBoundary>
        </div>
      </div>
    </UsersActionsProvider>
  );
}

export default UsersTable;
