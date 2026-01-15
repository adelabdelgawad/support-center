"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { StatusSwitch } from "@/components/ui/status-switch";
import { Loader2, User as UserIcon } from "lucide-react";
import type { UserWithRolesResponse } from "@/types/users.d";
import { toggleUserStatus, toggleUserTechnicianStatus } from "@/lib/api/users";
import { toastSuccess, toastError } from "@/lib/toast";

interface UsersTableColumnsProps {
  updatingIds: Set<number>;
  refetch: () => void;
  markUpdating: (ids: number[]) => void;
  clearUpdating: (ids?: number[]) => void;
  updateUsers?: (users: UserWithRolesResponse[]) => void | Promise<void>;
}

/**
 * Create column definitions for the users table
 */
export function createUsersTableColumns({
  updatingIds,
  refetch,
  markUpdating,
  clearUpdating,
  updateUsers,
}: UsersTableColumnsProps): ColumnDef<UserWithRolesResponse>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <div className="flex justify-center">
          <input
            type="checkbox"
            className="rounded border-input cursor-pointer"
            checked={table.getIsAllPageRowsSelected()}
            onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
            disabled={updatingIds.size > 0}
          />
        </div>
      ),
      cell: ({ row }) => {
        const isRowUpdating = Boolean(
          row.original.id && updatingIds.has(typeof row.original.id === 'string' ? parseInt(row.original.id, 10) : row.original.id)
        );

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
                disabled={Boolean(updatingIds.size > 0) || isRowUpdating}
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
      accessorKey: "username",
      header: () => <div className="text-center">Username</div>,
      cell: (info) => {
        const isRowUpdating = Boolean(
          info.row.original.id && updatingIds.has(typeof info.row.original.id === 'string' ? parseInt(info.row.original.id, 10) : info.row.original.id)
        );
        return (
          <div
            className={`flex items-center justify-center gap-2 ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            <UserIcon className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">{info.getValue() as string}</span>
          </div>
        );
      },
    },

    {
      accessorKey: "fullName",
      header: () => <div className="text-center">Full Name</div>,
      cell: (info) => {
        const isRowUpdating = Boolean(
          info.row.original.id && updatingIds.has(typeof info.row.original.id === 'string' ? parseInt(info.row.original.id, 10) : info.row.original.id)
        );
        return (
          <div
            className={`text-center ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            {String(info.getValue() || "—")}
          </div>
        );
      },
    },

    {
      accessorKey: "email",
      header: () => <div className="text-center">Email</div>,
      cell: (info) => {
        const isRowUpdating = Boolean(
          info.row.original.id && updatingIds.has(typeof info.row.original.id === 'string' ? parseInt(info.row.original.id, 10) : info.row.original.id)
        );
        return (
          <div
            className={`text-center ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            {String(info.getValue() || "—")}
          </div>
        );
      },
    },

    {
      accessorKey: "title",
      header: () => <div className="text-center">Title</div>,
      cell: (info) => {
        const isRowUpdating = Boolean(
          info.row.original.id && updatingIds.has(typeof info.row.original.id === 'string' ? parseInt(info.row.original.id, 10) : info.row.original.id)
        );
        return (
          <div
            className={`text-center ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            {String(info.getValue() || "—")}
          </div>
        );
      },
    },

    {
      id: "isActive",
      accessorKey: "isActive",
      header: () => <div className="text-center">Active</div>,
      cell: ({ row }) => {
        const user = row.original;
        const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id;
        const isRowUpdating = Boolean(user.id && updatingIds.has(userId));
        return (
          <div
            className={`flex justify-center items-center ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <StatusSwitch
              checked={user.isActive}
              onToggle={async () => {
                if (!user.id) return;
                markUpdating([userId]);
                try {
                  const updatedUser = await toggleUserStatus(user.id, !user.isActive);
                  if (updateUsers) {
                    await updateUsers([updatedUser]);
                  }
                  toastSuccess(`User ${!user.isActive ? "activated" : "deactivated"} successfully`);
                } catch (error) {
                  toastError("Failed to update user status");
                  throw error;
                } finally {
                  clearUpdating([userId]);
                }
              }}
              title={user.isActive ? "Deactivate User" : "Activate User"}
              description={
                user.isActive
                  ? `Are you sure you want to deactivate ${user.username}? This will prevent them from accessing the system.`
                  : `Are you sure you want to activate ${user.username}? This will allow them to access the system.`
              }
              size="sm"
            />
          </div>
        );
      },
      enableHiding: true,
    },

    {
      id: "isTechnician",
      accessorKey: "isTechnician",
      header: () => <div className="text-center">Technician</div>,
      cell: ({ row }) => {
        const user = row.original;
        const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id;
        const isRowUpdating = Boolean(user.id && updatingIds.has(userId));
        return (
          <div
            className={`flex justify-center items-center ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <StatusSwitch
              checked={user.isTechnician}
              onToggle={async () => {
                if (!user.id) return;
                markUpdating([userId]);
                try {
                  const updatedUser = await toggleUserTechnicianStatus(user.id, !user.isTechnician);
                  if (updateUsers) {
                    await updateUsers([updatedUser]);
                  }
                  toastSuccess(`User ${!user.isTechnician ? "marked as technician" : "unmarked as technician"} successfully`);
                } catch (error) {
                  toastError("Failed to update technician status");
                  throw error;
                } finally {
                  clearUpdating([userId]);
                }
              }}
              title={user.isTechnician ? "Remove Technician Status" : "Mark as Technician"}
              description={
                user.isTechnician
                  ? `Are you sure you want to remove technician status from ${user.username}?`
                  : `Are you sure you want to mark ${user.username} as a technician?`
              }
              size="sm"
            />
          </div>
        );
      },
      enableHiding: true,
    },

    {
      id: "roles",
      header: () => <div className="text-center">Roles</div>,
      accessorFn: (row) => row.roles?.map(r => r.name).join(", ") || "",
      cell: ({ row }) => {
        const isRowUpdating = Boolean(
          row.original.id && updatingIds.has(typeof row.original.id === 'string' ? parseInt(row.original.id, 10) : row.original.id)
        );
        const userRoles = row.original.roles || [];
        const displayLimit = 3;
        const hasMore = userRoles.length > displayLimit;
        const displayRoles = hasMore ? userRoles.slice(0, displayLimit) : userRoles;

        if (!userRoles || userRoles.length === 0) {
          return (
            <div
              className={`flex justify-center ${
                isRowUpdating ? "opacity-60 pointer-events-none" : ""
              }`}
            >
              <Badge variant="secondary" className="text-xs">
                No Roles
              </Badge>
            </div>
          );
        }

        return (
          <div
            className={`flex flex-wrap gap-1 justify-center items-center ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            {displayRoles.map((role) => (
              <Badge key={role.id} variant="outline" className="text-xs">
                {role.name}
              </Badge>
            ))}
            {hasMore && (
              <span className="text-xs text-muted-foreground">...</span>
            )}
          </div>
        );
      },
    },

    {
      id: "businessUnits",
      header: () => <div className="text-center">Business Units</div>,
      accessorFn: (row) => row.businessUnits?.map(bu => bu.name).join(", ") || "",
      cell: ({ row }) => {
        const isRowUpdating = Boolean(
          row.original.id && updatingIds.has(typeof row.original.id === 'string' ? parseInt(row.original.id, 10) : row.original.id)
        );
        const businessUnits = row.original.businessUnits || [];
        const displayLimit = 3;
        const hasMore = businessUnits.length > displayLimit;
        const displayUnits = hasMore ? businessUnits.slice(0, displayLimit) : businessUnits;

        if (!businessUnits || businessUnits.length === 0) {
          return (
            <div
              className={`flex justify-center ${
                isRowUpdating ? "opacity-60 pointer-events-none" : ""
              }`}
            >
              <Badge variant="secondary" className="text-xs">
                No Units
              </Badge>
            </div>
          );
        }

        return (
          <div
            className={`flex flex-wrap gap-1 justify-center items-center ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            {displayUnits.map((bu) => (
              <Badge
                key={bu.id}
                variant={bu.isActive ? "default" : "secondary"}
                className="text-xs"
              >
                {bu.name}
              </Badge>
            ))}
            {hasMore && (
              <span className="text-xs text-muted-foreground">...</span>
            )}
          </div>
        );
      },
    },

    {
      id: "actions",
      header: () => <div className="text-center">Actions</div>,
      cell: ({ row }) => {
        const isRowUpdating = Boolean(
          row.original.id && updatingIds.has(typeof row.original.id === 'string' ? parseInt(row.original.id, 10) : row.original.id)
        );
        return (
          <div
            className={`flex justify-center ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* This will be populated in the body component */}
          </div>
        );
      },
      enableSorting: false,
      enableHiding: false,
    },
  ];
}
