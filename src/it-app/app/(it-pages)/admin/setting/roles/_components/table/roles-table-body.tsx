"use client";

import {
  DataTable,
  SettingsTableHeader,
} from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { toastSuccess, toastWarning, toastError } from "@/lib/toast";
import { ColumnDef } from "@tanstack/react-table";
import { Shield, FileText, Loader2 } from "lucide-react";
import { useMemo, useState, useCallback } from "react";
import { AddRoleButton } from "../actions/add-role-button";
import { RoleActions } from "../actions/role-actions-menu";
import { StatusSwitch } from "@/components/ui/status-switch";
import { toggleRoleStatus } from "@/lib/api/roles";
import { RolesActionsProvider } from "@/app/(it-pages)/setting/roles/context/roles-actions-context";
import type { RoleResponse } from "@/types/roles";
import type { PageResponse } from "@/types/pages";
import type { AuthUserResponse } from "@/types/users";

interface RolesTableBodyProps {
  roles: RoleResponse[];
  page: number;
  refetch: () => void;
  updateRoles: (updatedRoles: RoleResponse[]) => Promise<void>;
  addRole: (newRole: RoleResponse) => Promise<void>;
  preloadedPages: PageResponse[];
  preloadedUsers: AuthUserResponse[];
  isValidating?: boolean;
  activeCount: number;
  inactiveCount: number;
}

export function RolesTableBody({
  roles,
  page,
  refetch,
  updateRoles,
  addRole,
  preloadedPages,
  preloadedUsers,
  isValidating,
  activeCount,
  inactiveCount,
}: RolesTableBodyProps) {
  const [tableInstance, setTableInstance] = useState<any>(null);
  const [selectedRoles, setSelectedRoles] = useState<RoleResponse[]>([]);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const isUpdating = updatingIds.size > 0;
  const selectedIds = selectedRoles.map((role) => role.id).filter(Boolean) as string[];

  /**
   * Mark roles as being updated
   */
  const markUpdating = useCallback((ids: string[]) => {
    setUpdatingIds(new Set(ids));
  }, []);

  /**
   * Clear updating state
   */
  const clearUpdating = useCallback(() => {
    setUpdatingIds(new Set());
  }, []);

  /**
   * Handle clear selection after bulk operations
   */
  const handleClearSelection = () => {
    setSelectedRoles([]);
  };

  // Handle toggle role status (defined before columns useMemo to avoid hoisting issues)
  const handleToggleStatus = useCallback(async (roleId: string, newStatus: boolean) => {
    try {
      markUpdating([roleId]);
      const updated = await toggleRoleStatus(roleId, newStatus);
      await updateRoles([updated]);
      toastSuccess(`Role ${newStatus ? "enabled" : "disabled"} successfully`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toastError(`Failed to toggle status: ${errorMessage}`);
      throw error;
    } finally {
      clearUpdating();
    }
  }, [markUpdating, updateRoles, clearUpdating]);


  const columns: ColumnDef<RoleResponse>[] = useMemo(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <div className="flex justify-center">
            <input
              type="checkbox"
              className="rounded border-input cursor-pointer"
              checked={table.getIsAllPageRowsSelected()}
              onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
              disabled={isUpdating}
            />
          </div>
        ),
        cell: ({ row }) => {
          const isRowUpdating =
            row.original.id && updatingIds.has(row.original.id);

          return (
            <div
              className={`flex justify-center items-center px-2 ${
                isRowUpdating ? "opacity-60" : ""
              }`}
            >
              {isRowUpdating && (
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
              )}
              {!isRowUpdating && (
                <input
                  type="checkbox"
                  className="rounded border-input cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  checked={row.getIsSelected()}
                  onChange={(e) => {
                    e.stopPropagation();
                    row.toggleSelected(e.target.checked);
                  }}
                  disabled={isUpdating || isRowUpdating ? true : undefined}
                />
              )}
            </div>
          );
        },
        enableSorting: false,
        enableHiding: false,
        size: 40,
      },
      {
        id: "name",
        accessorKey: "name",
        header: () => <div className="text-center">Name</div>,
        cell: (info) => (
          <div className="flex items-center justify-center gap-2">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">{info.getValue() as string}</span>
          </div>
        ),
        enableHiding: true,
      },
      {
        id: "description",
        accessorKey: "description",
        header: () => <div className="text-center">Description</div>,
        cell: (info) => (
          <div className="text-center text-sm text-muted-foreground">
            {(info.getValue() as string) || "—"}
          </div>
        ),
        enableHiding: true,
      },
      {
        id: "pages",
        accessorKey: "pagePaths",
        header: () => <div className="text-center">Pages</div>,
        cell: (info) => {
          const pages = info.getValue() as string[] | null;
          return (
            <div className="text-center">
              {pages && pages.length > 0 ? (
                <Badge variant="outline" className="text-xs">
                  <FileText className="mr-1 h-3 w-3" />
                  {pages.length}
                </Badge>
              ) : (
                "—"
              )}
            </div>
          );
        },
        enableSorting: false,
        enableHiding: true,
      },
      {
        id: "totalUsers",
        accessorKey: "totalUsers",
        header: () => <div className="text-center">Users</div>,
        cell: (info) => {
          const userCount = info.getValue() as number | null;
          return (
            <div className="text-center">
              {userCount !== null && userCount !== undefined ? (
                <Badge variant="outline" className="text-xs">
                  {userCount}
                </Badge>
              ) : (
                "—"
              )}
            </div>
          );
        },
        enableSorting: false,
        enableHiding: true,
      },
      {
        id: "isActive",
        accessorKey: "isActive",
        header: () => <div className="text-center">Active</div>,
        cell: ({ row }) => {
          const role = row.original;
          const isRoleUpdating = updatingIds.has(role.id);

          return (
            <div
              className={`flex justify-center ${isRoleUpdating ? 'opacity-60' : ''}`}
              onClick={(e) => e.stopPropagation()}
            >
              <StatusSwitch
                checked={role.isActive}
                onToggle={async () => {
                  await handleToggleStatus(role.id, !role.isActive);
                }}
                title={role.isActive ? "Deactivate Role" : "Activate Role"}
                description={
                  role.isActive
                    ? `Are you sure you want to deactivate "${role.name}"? Users with this role may lose access to certain features.`
                    : `Are you sure you want to activate "${role.name}"? Users with this role will regain their permissions.`
                }
                size="sm"
              />
            </div>
          );
        },
        enableSorting: false,
        enableHiding: true,
      },
      {
        id: "actions",
        header: () => <div className="text-center">Actions</div>,
        cell: ({ row }) => (
          <div
            className="flex justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <RoleActions
              role={row.original}
              preloadedPages={preloadedPages}
              preloadedUsers={preloadedUsers}
            />
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
        size: 80,
      },
    ],
    [preloadedPages, preloadedUsers, isUpdating, updatingIds, handleToggleStatus]
  );

  // Handle disable roles
  const handleDisable = async (ids: string[] | number[]) => {
    try {
      if (ids.length === 0) {return;}

      // Convert to strings if needed (role IDs are strings)
      const stringIds = ids.map(id => String(id));

      // Filter to only active roles
      const activeRolesToDisable = roles.filter(
        (r) => r.id && stringIds.includes(r.id) && r.isActive
      );

      if (activeRolesToDisable.length === 0) {
        toastWarning("Selected roles are already disabled");
        return;
      }

      const roleIdsToDisable = activeRolesToDisable.map((r) => r.id!);

      // Mark roles as updating
      markUpdating(roleIdsToDisable);

      // Call API for each role
      const updatedRoles: RoleResponse[] = [];
      for (const roleId of roleIdsToDisable) {
        const updated = await toggleRoleStatus(roleId, false);
        updatedRoles.push(updated);
      }

      // Update local state
      if (updatedRoles.length > 0) {
        updateRoles(updatedRoles);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      toastSuccess(`Successfully disabled ${updatedRoles.length} role(s)`);

      // Keep selection for further actions
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toastError(`Failed to disable roles: ${errorMessage}`);
    } finally {
      clearUpdating();
    }
  };

  // Handle enable roles
  const handleEnable = async (ids: string[] | number[]) => {
    try {
      if (ids.length === 0) {return;}

      // Convert to strings if needed (role IDs are strings)
      const stringIds = ids.map(id => String(id));

      // Filter to only inactive roles
      const inactiveRolesToEnable = roles.filter(
        (r) => r.id && stringIds.includes(r.id) && !r.isActive
      );

      if (inactiveRolesToEnable.length === 0) {
        toastWarning("Selected roles are already enabled");
        return;
      }

      const roleIdsToEnable = inactiveRolesToEnable.map((r) => r.id!);

      // Mark roles as updating
      markUpdating(roleIdsToEnable);

      // Call API for each role
      const updatedRoles: RoleResponse[] = [];
      for (const roleId of roleIdsToEnable) {
        const updated = await toggleRoleStatus(roleId, true);
        updatedRoles.push(updated);
      }

      // Update local state
      if (updatedRoles.length > 0) {
        updateRoles(updatedRoles);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      toastSuccess(`Successfully enabled ${updatedRoles.length} role(s)`);

      // Keep selection for further actions
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toastError(`Failed to enable roles: ${errorMessage}`);
    } finally {
      clearUpdating();
    }
  };

  // Handle refresh
  const handleRefresh = () => {
    refetch();
  };

  // Handle update role
  const handleUpdateRole = async (roleId: string, updatedRole: RoleResponse) => {
    await updateRoles([updatedRole]);
  };

  // Update counts - refetch to get fresh data
  const updateCounts = async () => {
    refetch();
  };

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
      <div className="h-full w-full flex flex-col min-h-0 space-y-2">
        {/* Controller Bar */}
        <SettingsTableHeader<string>
          statusFilter={{
            activeCount,
            inactiveCount,
            totalCount: activeCount + inactiveCount,
          }}
          selection={{
            selectedIds,
            onClearSelection: handleClearSelection,
            itemName: "role",
          }}
          search={{
            placeholder: "Search roles...",
            urlParam: "name",
          }}
          addButton={<AddRoleButton />}
          bulkActions={{
            onDisable: handleDisable,
            onEnable: handleEnable,
            isUpdating,
          }}
          onRefresh={handleRefresh}
          tableInstance={tableInstance}
        />

        {/* Table */}
        <div className="flex-1 min-h-0 flex flex-col">
          <DataTable
            _data={roles}
            columns={columns}
            tableInstanceHook={(table) => setTableInstance(table)}
            onRowSelectionChange={setSelectedRoles}
            renderToolbar={() => null}
            enableRowSelection={true}
            enableSorting={false}
            _isLoading={isValidating}
          />
        </div>
      </div>
    </RolesActionsProvider>
  );
}
