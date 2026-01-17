"use client";

import { ColumnDef } from "@tanstack/react-table";
import { StatusSwitch } from "@/components/ui/status-switch";
import { Loader2 } from "lucide-react";
import type { BusinessUnitResponse } from "@/types/business-units";
import type { BusinessUnitRegionResponse } from "@/types/business-unit-regions";

interface BusinessUnitsTableColumnsProps {
  updatingIds: Set<number>;
  onToggleStatus: (id: number) => Promise<void>;
  regions: BusinessUnitRegionResponse[];
}

/**
 * Create column definitions for the business units table
 */
export function createBusinessUnitsTableColumns({
  updatingIds,
  onToggleStatus,
  regions,
}: BusinessUnitsTableColumnsProps): ColumnDef<BusinessUnitResponse>[] {
  // Create a region map for quick lookups
  const regionMap = new Map(regions.map((r) => [r.id, r.name]));

  return [
    {
      id: "select",
      header: ({ table }) => (
        <div className="flex justify-center items-center">
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
      accessorKey: "name",
      header: () => <div className="text-center">Name</div>,
      cell: (info) => {
        const isRowUpdating = Boolean(
          info.row.original.id && updatingIds.has(info.row.original.id)
        );
        return (
          <div
            className={`text-center font-medium ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            {info.getValue() as string}
          </div>
        );
      },
    },

    {
      accessorKey: "businessUnitRegionId",
      header: () => <div className="text-center">Region</div>,
      cell: (info) => {
        const isRowUpdating = Boolean(
          info.row.original.id && updatingIds.has(info.row.original.id)
        );
        const regionId = info.getValue() as number;
        const regionName = regionMap.get(regionId) || "Unknown";
        return (
          <div
            className={`text-center text-sm ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            {regionName}
          </div>
        );
      },
    },

    {
      accessorKey: "description",
      header: () => <div className="text-center">Description</div>,
      cell: (info) => {
        const isRowUpdating = Boolean(
          info.row.original.id && updatingIds.has(info.row.original.id)
        );
        const value = info.getValue() as string | null;
        return (
          <div
            className={`text-center text-sm text-muted-foreground ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            {value || "—"}
          </div>
        );
      },
    },

    {
      accessorKey: "network",
      header: () => <div className="text-center">Network</div>,
      cell: (info) => {
        const isRowUpdating = Boolean(
          info.row.original.id && updatingIds.has(info.row.original.id)
        );
        const value = info.getValue() as string | null;
        return (
          <div
            className={`text-center text-sm font-mono ${
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
        const unit = info.row.original;
        const isRowUpdating = Boolean(unit.id && updatingIds.has(unit.id));
        const isActive = info.getValue() as boolean;

        return (
          <div
            className={`flex justify-center items-center ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <StatusSwitch
              checked={isActive}
              onToggle={() => onToggleStatus(unit.id)}
              title={isActive ? "Disable Business Unit" : "Enable Business Unit"}
              description={
                isActive
                  ? `Are you sure you want to disable "${unit.name}"? This will make it inactive.`
                  : `Are you sure you want to enable "${unit.name}"? This will make it active.`
              }
              disabled={isRowUpdating}
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
