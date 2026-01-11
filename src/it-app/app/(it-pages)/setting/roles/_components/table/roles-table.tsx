"use client";

import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Pagination } from "@/components/data-table";
import { RolesTableBody } from "./roles-table-body";
import { MobileRolesView } from "../mobile/mobile-roles-view";
import LoadingSkeleton from "@/components/loading-skelton";
import type { SettingRolesResponse, RoleResponse } from "@/types/roles";
import type { PageResponse } from "@/types/pages";
import type { AuthUserResponse } from "@/types/users";
import { useCallback } from "react";

interface RolesTableProps {
  initialData: SettingRolesResponse;
  preloadedPages: PageResponse[];
  preloadedUsers: AuthUserResponse[];
}

/**
 * Fetcher function for SWR - uses Next.js API routes
 * This ensures backend is only accessible from server
 */
const fetcher = async (url: string): Promise<SettingRolesResponse> => {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to fetch roles");
  }
  return response.json();
};

function RolesTable({
  initialData,
  preloadedPages,
  preloadedUsers,
}: RolesTableProps) {
  const searchParams = useSearchParams();

  // Read URL parameters
  const page = Number(searchParams?.get("page") || "1");
  const limit = Number(searchParams?.get("limit") || "10");
  const isActive = searchParams?.get("is_active") || "";
  const roleName = searchParams?.get("name") || "";
  const pageId = searchParams?.get("page_id") || "";

  // Build API URL with current filters - use Next.js API route
  const params = new URLSearchParams();
  params.append("page", page.toString());
  params.append("per_page", limit.toString());
  if (isActive) params.append("is_active", isActive);
  if (roleName) params.append("name", roleName);
  if (pageId) params.append("page_id", pageId);

  // Use Next.js API route - proxies to backend
  const apiUrl = `/api/setting/roles?${params.toString()}`;

  // Check if initial data is empty - if so, we need to fetch on mount
  const hasRealInitialData = initialData && initialData.roles && initialData.roles.length > 0;

  // SWR hook with optimized configuration
  const {
    data,
    mutate,
    isLoading,
    isValidating,
    error,
  } = useSWR<SettingRolesResponse>(apiUrl, fetcher, {
    // Use server-side data as initial cache
    fallbackData: initialData,

    // Keep showing previous data while fetching new data (smooth transitions)
    keepPreviousData: true,

    // Fetch on mount if no real initial data (e.g., came from empty fallback)
    revalidateOnMount: !hasRealInitialData,

    // Don't auto-refetch stale data - we control when to refetch
    revalidateIfStale: false,

    // Disable automatic refetch on window focus
    revalidateOnFocus: false,

    // Disable automatic refetch on reconnect
    revalidateOnReconnect: false,

    // Dedupe requests within 2 seconds
    dedupingInterval: 2000,
  });

  const roles = data?.roles ?? [];
  const activeCount = data?.activeCount ?? 0;
  const inactiveCount = data?.inactiveCount ?? 0;
  const totalItems = data?.total ?? 0;

  /**
   * Update roles in SWR cache with backend-returned data
   * Uses the returned record from API and triggers background revalidation for fresh counts
   */
  const updateRolesOptimistic = useCallback(
    async (updatedRoles: RoleResponse[]) => {
      // Get current data to compute new state
      const currentData = data;
      if (!currentData) return;

      const updatedMap = new Map(updatedRoles.map((r) => [r.id, r]));

      // Update roles with returned data from API
      const updatedRolesList = currentData.roles.map((role) =>
        updatedMap.has(role.id) ? updatedMap.get(role.id)! : role
      );

      // Create new data object - keep existing counts, backend will provide fresh ones on revalidate
      const newData: SettingRolesResponse = {
        ...currentData,
        roles: updatedRolesList,
      };

      // Update SWR cache and trigger background revalidation for fresh counts
      await mutate(newData, { revalidate: true });
    },
    [mutate, data]
  );

  /**
   * Add new role to cache - for when a new role is created
   * This adds the role to current page data and triggers a background refetch
   */
  const addRoleToCache = useCallback(
    async (newRole: RoleResponse) => {
      const currentData = data;
      if (!currentData) return;

      const newData: SettingRolesResponse = {
        ...currentData,
        roles: [newRole, ...currentData.roles],
        total: currentData.total + 1,
        activeCount: newRole.isActive
          ? currentData.activeCount + 1
          : currentData.activeCount,
        inactiveCount: !newRole.isActive
          ? currentData.inactiveCount + 1
          : currentData.inactiveCount,
      };

      // Update cache and trigger background refetch for accurate pagination
      await mutate(newData, { revalidate: true });
    },
    [mutate, data]
  );

  /**
   * Force refetch - use sparingly (e.g., manual refresh button)
   */
  const refetch = useCallback(() => {
    mutate();
  }, [mutate]);

  // Error state with retry button
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="text-destructive mb-2">Failed to load roles</div>
          <div className="text-muted-foreground text-sm mb-4">
            {error.message}
          </div>
          <button
            onClick={() => mutate()}
            className="text-primary hover:underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(totalItems / limit);

  return (
    <>
      {/* Desktop View (md and up) */}
      <div className="relative hidden md:flex h-full bg-muted min-h-0 p-1">
        {/* Loading Overlay - only show on initial load, not on optimistic updates */}
        {isLoading && <LoadingSkeleton />}

        {/* Main Content */}
        <div className="h-full flex-1 flex flex-col min-h-0 min-w-0 space-y-2">
          {/* Table */}
          <div className="flex-1 min-h-0 flex flex-col">
            <RolesTableBody
              roles={roles}
              page={page}
              refetch={refetch}
              updateRoles={updateRolesOptimistic}
              addRole={addRoleToCache}
              preloadedPages={preloadedPages}
              preloadedUsers={preloadedUsers}
              isValidating={isValidating}
              activeCount={activeCount}
              inactiveCount={inactiveCount}
            />
          </div>

          {/* Pagination */}
          <div className="shrink-0 bg-background border-t border-border rounded-md">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              pageSize={limit}
              totalItems={totalItems}
            />
          </div>
        </div>
      </div>

      {/* Mobile View (below md) */}
      <div className="md:hidden h-full">
        <MobileRolesView
          roles={roles}
          page={page}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={limit}
          activeCount={activeCount}
          inactiveCount={inactiveCount}
          refetch={refetch}
          updateRoles={updateRolesOptimistic}
          addRole={addRoleToCache}
          preloadedPages={preloadedPages}
          preloadedUsers={preloadedUsers}
          isValidating={isValidating}
        />
      </div>
    </>
  );
}

export default RolesTable;
