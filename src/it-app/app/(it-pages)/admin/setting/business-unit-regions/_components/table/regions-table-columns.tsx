"use client";

import { ColumnDef } from "@tanstack/react-table";
import { StatusSwitch } from "@/components/ui/status-switch";
import { Loader2 } from "lucide-react";
import type { BusinessUnitRegionResponse } from "@/types/business-unit-regions";

interface RegionsTableColumnsProps {
  updatingIds: Set<number>;
  onToggleStatus: (id: number) => Promise<void>;
}

/**
 * Create column definitions for the regions table
 */
export function createRegionsTableColumns({
  updatingIds,
  onToggleStatus,
}: RegionsTableColumnsProps): ColumnDef<BusinessUnitRegionResponse>[] {
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
        const isRowUpdating = row.original.id ? updatingIds.has(row.original.id) : false;

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
                disabled={updatingIds.size > 0 || isRowUpdating}
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
      accessorKey: "name",
      header: () => <div className="text-left">Name</div>,
      cell: (info) => {
        const isRowUpdating = Boolean(
          info.row.original.id && updatingIds.has(info.row.original.id)
        );
        return (
          <div
            className={`font-medium ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            {info.getValue() as string}
          </div>
        );
      },
    },

    {
      accessorKey: "description",
      header: () => <div className="text-left">Description</div>,
      cell: (info) => {
        const isRowUpdating = Boolean(
          info.row.original.id && updatingIds.has(info.row.original.id)
        );
        const value = info.getValue() as string | null;
        return (
          <div
            className={`text-sm text-muted-foreground ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            {value || "—"}
          </div>
        );
      },
    },

    {
      accessorKey: "isActive",
      header: () => <div className="text-center">Status</div>,
      cell: (info) => {
        const region = info.row.original;
        const isRowUpdating = region.id ? updatingIds.has(region.id) : false;
        const isActive = info.getValue() as boolean;

        return (
          <div
            className={`flex justify-center ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <StatusSwitch
              checked={isActive}
              onToggle={async () => {
                await onToggleStatus(region.id);
              }}
              title={isActive ? "Deactivate Region" : "Activate Region"}
              description={
                isActive
                  ? `Are you sure you want to deactivate "${region.name}"? This will prevent it from being used in the system.`
                  : `Are you sure you want to activate "${region.name}"? This will make it available for use in the system.`
              }
              disabled={isRowUpdating}
              size="sm"
            />
          </div>
        );
      },
      enableSorting: false,
      size: 80,
    },

    {
      id: "actions",
      header: () => <div className="text-center">Actions</div>,
      cell: () => null, // Will be replaced in table body with inline actions
      enableSorting: false,
      enableHiding: false,
      size: 120,
    },
  ];
}
