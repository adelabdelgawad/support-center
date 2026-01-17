"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Loader2, Eye, Pencil, Trash2 } from "lucide-react";
import type { RequestType } from "@/types/request-types";

interface RequestTypesTableColumnsProps {
  updatingIds: Set<number>;
  onView: (type: RequestType) => void;
  onEdit: (type: RequestType) => void;
  onDelete: (type: RequestType) => void;
}

/**
 * Create column definitions for the request types table
 */
export function createRequestTypesTableColumns({
  updatingIds,
  onView,
  onEdit,
  onDelete,
}: RequestTypesTableColumnsProps): ColumnDef<RequestType>[] {
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
      accessorKey: "nameEn",
      header: () => <div className="text-left">Name</div>,
      cell: (info) => {
        const type = info.row.original;
        const isRowUpdating = Boolean(type.id && updatingIds.has(type.id));

        return (
          <div className={`flex items-center gap-2 ${isRowUpdating ? "opacity-60 pointer-events-none" : ""}`}>
            <span className="font-medium">{info.getValue() as string}</span>
          </div>
        );
      },
    },

    {
      accessorKey: "briefEn",
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
            {value || "-"}
          </div>
        );
      },
    },

    {
      id: "actions",
      header: () => <div className="text-center">Actions</div>,
      cell: (info) => {
        const type = info.row.original;
        const isRowUpdating = Boolean(type.id && updatingIds.has(type.id));

        return (
          <div
            className={`flex items-center justify-center gap-1 ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onView(type)}
              disabled={isRowUpdating}
              className="h-8 w-8"
              title="View details"
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(type)}
              disabled={isRowUpdating}
              className="h-8 w-8"
              title="Edit type"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(type)}
              disabled={isRowUpdating}
              className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
              title="Delete type"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      },
      enableSorting: false,
      enableHiding: false,
      size: 120,
    },
  ];
}
