"use client";

import { useState, useCallback } from "react";
import { Pagination } from "@/components/data-table";
import { RolesTableBody } from "./roles-table-body";
import { MobileRolesView } from "../mobile/mobile-roles-view";
import type { SettingRolesResponse, RoleResponse } from "@/types/roles";
import type { PageResponse } from "@/types/pages";
import type { AuthUserResponse } from "@/types/users";

interface RolesTableProps {
  initialData: SettingRolesResponse;
  preloadedPages: PageResponse[];
  preloadedUsers: AuthUserResponse[];
  initialPage: number;
  initialLimit: number;
  initialFilters: {
    is_active?: string;
    name?: string;
    page_id?: string;
  };
}

/**
 * Fetcher function - uses Next.js API routes
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
  initialPage,
  initialLimit,
  initialFilters,
}: RolesTableProps) {
  // Use props instead of reading from URL to avoid hydration mismatches
  const page = initialPage;
  const limit = initialLimit;
  const isActive = initialFilters.is_active || "";
  const roleName = initialFilters.name || "";
  const pageId = initialFilters.page_id || "";

  // Build API URL with current filters - use Next.js API route
  const params = new URLSearchParams();
  params.append("page", page.toString());
  params.append("per_page", limit.toString());
  if (isActive) params.append("is_active", isActive);
  if (roleName) params.append("name", roleName);
  if (pageId) params.append("page_id", pageId);

  // Use Next.js API route - proxies to backend
  const apiUrl = `/api/setting/roles?${params.toString()}`;

  // Simple state management (useState instead of SWR)
  const [data, setData] = useState<SettingRolesResponse | null>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const roles = data?.roles ?? [];
  const activeCount = data?.activeCount ?? 0;
  const inactiveCount = data?.inactiveCount ?? 0;
  const totalItems = data?.total ?? 0;

  /**
   * Manual refresh function
   */
  const refresh = useCallback(async () => {
    setIsValidating(true);
    setError(null);
    try {
      const response = await fetcher(apiUrl);
      setData(response);
    } catch (err) {
      setError(err as Error);
    } finally {
      setIsValidating(false);
    }
  }, [apiUrl]);

  /**
   * Update roles with backend-returned data
   * Uses the returned record from API
   */
  const updateRoles = useCallback(
    async (updatedRoles: RoleResponse[]) => {
      const currentData = data;
      if (!currentData) return;

      const updatedMap = new Map(updatedRoles.map((r) => [r.id, r]));

      // Update roles with returned data from API
      const updatedRolesList = currentData.roles.map((role) =>
        updatedMap.has(role.id) ? updatedMap.get(role.id)! : role
      );

      // Create new data object with updated roles
      const newData: SettingRolesResponse = {
        ...currentData,
        roles: updatedRolesList,
      };

      // Update state without background refetch - API already returned fresh data
      setData(newData);
    },
    [data]
  );

  /**
   * Add new role to cache - for when a new role is created
   * This adds the role to current page data
   */
  const addRole = useCallback(
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

      // Update state
      setData(newData);
      // Refresh to get accurate pagination from backend
      await refresh();
    },
    [data, refresh]
  );

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
            onClick={refresh}
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

        {/* Main Content */}
        <div className="h-full flex-1 flex flex-col min-h-0 min-w-0 space-y-2">
          {/* Table */}
          <div className="flex-1 min-h-0 flex flex-col">
            <RolesTableBody
              roles={roles}
              page={page}
              refetch={refresh}
              updateRoles={updateRoles}
              addRole={addRole}
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
          refetch={refresh}
          updateRoles={updateRoles}
          addRole={addRole}
          preloadedPages={preloadedPages}
          preloadedUsers={preloadedUsers}
          isValidating={isValidating}
        />
      </div>
    </>
  );
}

export default RolesTable;
