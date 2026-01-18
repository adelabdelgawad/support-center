"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Star, Shield, ShieldOff } from "lucide-react";
import type { ClientVersion } from "@/types/client-versions";
import { setVersionAsLatest, toggleVersionEnforcement } from "@/lib/api/client-versions";
import { toastSuccess, toastError } from "@/lib/toast";

interface ClientVersionsTableColumnsProps {
  updatingIds: Set<number>;
  refetch: () => void;
  markUpdating: (ids: number[]) => void;
  clearUpdating: (ids?: number[]) => void;
  updateVersions?: (versions: ClientVersion[]) => void | Promise<void>;
}

/**
 * Create column definitions for the client versions table
 */
export function createClientVersionsTableColumns({
  updatingIds,
  refetch,
  markUpdating,
  clearUpdating,
  updateVersions,
}: ClientVersionsTableColumnsProps): ColumnDef<ClientVersion>[] {
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
          row.original.id && updatingIds.has(row.original.id)
        );

        return (
          <div
            className={`flex justify-center items-center px-2 ${
              isRowUpdating ? "opacity-60" : ""
            }`}
          >
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
          </div>
        );
      },
      enableSorting: false,
      enableHiding: false,
      size: 40,
    },

    {
      accessorKey: "versionString",
      header: () => <div className="text-center">Version</div>,
      cell: (info) => {
        const isRowUpdating = Boolean(
          info.row.original.id && updatingIds.has(info.row.original.id)
        );
        return (
          <div
            className={`text-center font-mono font-medium ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            {info.getValue() as string}
          </div>
        );
      },
    },

    {
      accessorKey: "platform",
      header: () => <div className="text-center">Platform</div>,
      cell: (info) => {
        const isRowUpdating = Boolean(
          info.row.original.id && updatingIds.has(info.row.original.id)
        );
        return (
          <div
            className={`text-center ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            <Badge variant="outline">{info.getValue() as string}</Badge>
          </div>
        );
      },
    },

    {
      id: "status",
      header: () => <div className="text-center">Status</div>,
      cell: ({ row }) => {
        const version = row.original;
        const isRowUpdating = Boolean(version.id && updatingIds.has(version.id));
        return (
          <div
            className={`flex flex-wrap gap-1 justify-center items-center ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            {version.isLatest && (
              <Badge className="bg-green-500 hover:bg-green-600">
                <Star className="h-3 w-3 mr-1" />
                Latest
              </Badge>
            )}
            {version.isEnforced && (
              <Badge className="bg-red-500 hover:bg-red-600">
                <Shield className="h-3 w-3 mr-1" />
                Enforced
              </Badge>
            )}
            {!version.isActive && (
              <Badge variant="secondary">Inactive</Badge>
            )}
          </div>
        );
      },
    },

    {
      accessorKey: "releaseNotes",
      header: () => <div className="text-center">Release Notes</div>,
      cell: (info) => {
        const isRowUpdating = Boolean(
          info.row.original.id && updatingIds.has(info.row.original.id)
        );
        const notes = info.getValue() as string | null;
        return (
          <div
            className={`text-center text-muted-foreground text-sm max-w-[200px] truncate ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
            title={notes || ""}
          >
            {notes || <span className="text-muted-foreground/50">-</span>}
          </div>
        );
      },
    },

    {
      id: "isEnforced",
      accessorKey: "isEnforced",
      header: () => <div className="text-center">Enforced</div>,
      cell: ({ row }) => {
        const version = row.original;
        const isRowUpdating = Boolean(version.id && updatingIds.has(version.id));
        return (
          <div
            className={`flex justify-center items-center ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={async () => {
                if (!version.id) return;
                markUpdating([version.id]);
                try {
                  const updatedVersion = await toggleVersionEnforcement(version.id, !version.isEnforced);
                  if (updateVersions) {
                    await updateVersions([updatedVersion]);
                  }
                  toastSuccess(`Enforcement ${!version.isEnforced ? "enabled" : "disabled"} successfully`);
                } catch (error) {
                  toastError("Failed to toggle enforcement");
                  throw error;
                } finally {
                  clearUpdating([version.id]);
                }
              }}
              className={`p-2 rounded transition-colors ${
                version.isEnforced
                  ? "text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                  : "text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
              title={version.isEnforced ? "Disable enforcement" : "Enable enforcement"}
            >
              {version.isEnforced ? (
                <Shield className="h-4 w-4" />
              ) : (
                <ShieldOff className="h-4 w-4" />
              )}
            </button>
          </div>
        );
      },
      enableHiding: true,
    },

    {
      id: "actions",
      header: () => <div className="text-center">Actions</div>,
      cell: ({ row }) => {
        const isRowUpdating = Boolean(
          row.original.id && updatingIds.has(row.original.id)
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
