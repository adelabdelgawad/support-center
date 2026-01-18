"use client";

import { useCallback, useState } from "react";
import { RoleResponse } from "@/types/roles";
import { MobileToolbar } from "./mobile-toolbar";
import { MobileStatusFilter } from "./mobile-status-filter";
import { MobileRolesList } from "./mobile-roles-list";
import { MobilePagination } from "./mobile-pagination";
import { RolesActionsProvider } from "@/app/(it-pages)/admin/(admin-pages)/setting/roles/context/roles-actions-context";
import { toggleRoleStatus } from "@/lib/api/roles";
import { toastSuccess, toastError } from "@/lib/toast";
import type { PageResponse } from "@/types/pages";
import type { AuthUserResponse } from "@/types/users";

interface MobileRolesViewProps {
  roles: RoleResponse[];
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  activeCount: number;
  inactiveCount: number;
  refetch: () => void;
  updateRoles: (updatedRoles: RoleResponse[]) => Promise<void>;
  addRole: (newRole: RoleResponse) => Promise<void>;
  preloadedPages: PageResponse[];
  preloadedUsers: AuthUserResponse[];
  isValidating?: boolean;
}

/**
 * Complete mobile view for the Roles table
 * Includes toolbar, filters, list, and pagination
 * Full feature parity with desktop view
 */
export function MobileRolesView({
  roles,
  page,
  totalPages,
  totalItems,
  pageSize,
  activeCount,
  inactiveCount,
  refetch,
  updateRoles,
  addRole,
  preloadedPages,
  preloadedUsers,
  isValidating = false,
}: MobileRolesViewProps) {
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());

  // Calculate total for status filter
  const totalCount = activeCount + inactiveCount;

  const markUpdating = useCallback((ids: string[]) => {
    setUpdatingIds(new Set(ids));
  }, []);

  const clearUpdating = useCallback(() => {
    setUpdatingIds(new Set());
  }, []);

  const handleToggleStatus = useCallback(
    async (roleId: string, newStatus: boolean) => {
      try {
        markUpdating([roleId]);
        const updated = await toggleRoleStatus(roleId, newStatus);
        await updateRoles([updated]);
        toastSuccess(`Role ${newStatus ? "enabled" : "disabled"} successfully`);
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        toastError(`Failed to toggle status: ${errorMessage}`);
        throw error;
      } finally {
        clearUpdating();
      }
    },
    [markUpdating, updateRoles, clearUpdating]
  );

  const handleUpdateRole = useCallback(
    async (roleId: string, updatedRole: RoleResponse) => {
      await updateRoles([updatedRole]);
    },
    [updateRoles]
  );

  const updateCounts = useCallback(async () => {
    refetch();
  }, [refetch]);

  // Create actions object for context provider
  const actions = {
    handleToggleStatus,
    handleUpdateRole,
    mutate: refetch,
    updateCounts,
    markUpdating,
    clearUpdating,
    updateRoles,
    addRole,
  };

  return (
    <RolesActionsProvider actions={actions}>
      <div className="flex flex-col h-full bg-background">
        {/* Toolbar: Search, Add Role, Refresh */}
        <MobileToolbar onRefresh={refetch} isRefreshing={isValidating} />

        {/* Filters Section */}
        <div className="sticky top-[57px] z-10 bg-background border-b shadow-sm">
          <div className="space-y-1 py-1">
            {/* Status Filter: All / Active / Inactive */}
            <div className="border-b border-border/50 pb-1">
              <MobileStatusFilter
                activeCount={activeCount}
                inactiveCount={inactiveCount}
                totalCount={totalCount}
              />
            </div>
          </div>
        </div>

        {/* Roles List */}
        <div className="flex-1 overflow-hidden">
          <MobileRolesList
            roles={roles}
            refetch={refetch}
            updateRoles={updateRoles}
            preloadedPages={preloadedPages}
            preloadedUsers={preloadedUsers}
          />
        </div>

        {/* Pagination */}
        <div className="sticky bottom-0 bg-background border-t shadow-lg">
          <MobilePagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={pageSize}
            isLoading={isValidating}
          />
        </div>
      </div>
    </RolesActionsProvider>
  );
}
