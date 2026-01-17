"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Loader2 } from "lucide-react";
import type { BusinessUnitResponse } from "@/types/business-units";
import type { BusinessUnitRegionResponse } from "@/types/business-unit-regions";

interface BusinessUnitsTableColumnsProps {
  updatingIds: Set<number>;
  regions: BusinessUnitRegionResponse[];
}

/**
 * Create column definitions for the business units table
 */
export function createBusinessUnitsTableColumns({
  updatingIds,
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
      id: "actions",
      header: () => <div className="text-center">Actions</div>,
      cell: () => null, // Will be replaced in table body with inline actions
      enableSorting: false,
      enableHiding: false,
      size: 120,
    },
  ];
}
