"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Lock, Eye, Pencil, Trash2 } from "lucide-react";
import type { RequestStatusResponse } from "@/types/request-statuses";

interface RequestStatusesTableColumnsProps {
  updatingIds: Set<number>;
  onToggleRequesterVisibility: (id: number, currentValue: boolean) => Promise<void>;
  onToggleCountAsSolved: (id: number, currentValue: boolean) => Promise<void>;
  onView: (status: RequestStatusResponse) => void;
  onEdit: (status: RequestStatusResponse) => void;
  onDelete: (status: RequestStatusResponse) => void;
}

/**
 * Create column definitions for the request statuses table
 */
export function createRequestStatusesTableColumns({
  updatingIds,
  onToggleRequesterVisibility,
  onToggleCountAsSolved,
  onView,
  onEdit,
  onDelete,
}: RequestStatusesTableColumnsProps): ColumnDef<RequestStatusResponse>[] {
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
                disabled={Boolean(updatingIds.size > 0) || isRowUpdating || row.original.readonly}
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
        const status = info.row.original;
        const isRowUpdating = Boolean(status.id && updatingIds.has(status.id));

        return (
          <div className={`flex items-center gap-2 ${isRowUpdating ? "opacity-60 pointer-events-none" : ""}`}>
            <span className="font-medium">{info.getValue() as string}</span>
            {status.readonly && (
              <Lock className="h-3 w-3 text-muted-foreground" aria-label="Read-only status" />
            )}
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
      accessorKey: "color",
      header: () => <div className="text-center">Color</div>,
      cell: (info) => {
        const isRowUpdating = Boolean(
          info.row.original.id && updatingIds.has(info.row.original.id)
        );
        const color = info.getValue() as string | null;

        return (
          <div
            className={`flex justify-center ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            {color && (
              <Badge variant="outline" style={{ borderColor: color, color: color }}>
                {color}
              </Badge>
            )}
          </div>
        );
      },
      size: 100,
    },

    {
      accessorKey: "countAsSolved",
      header: () => <div className="text-center">Counts as Solved</div>,
      cell: (info) => {
        const status = info.row.original;
        const isRowUpdating = Boolean(status.id && updatingIds.has(status.id));
        const value = info.getValue() as boolean;

        return (
          <div
            className={`flex justify-center ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <StatusSwitch
              checked={value}
              onToggle={async () => onToggleCountAsSolved(status.id, value)}
              title={value ? "Mark as not solved" : "Mark as solved"}
              description={
                value
                  ? `Requests with status "${status.name}" will no longer count as solved.`
                  : `Requests with status "${status.name}" will count as solved.`
              }
              disabled={isRowUpdating}
            />
          </div>
        );
      },
      enableSorting: false,
      size: 120,
    },

    {
      accessorKey: "visibleOnRequesterPage",
      header: () => <div className="text-center">Visible to Requester</div>,
      cell: (info) => {
        const status = info.row.original;
        const isRowUpdating = Boolean(status.id && updatingIds.has(status.id));
        const value = info.getValue() as boolean;

        return (
          <div
            className={`flex justify-center ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <StatusSwitch
              checked={value}
              onToggle={async () => onToggleRequesterVisibility(status.id, value)}
              title={value ? "Hide from requester" : "Show to requester"}
              description={
                value
                  ? `Requests with status "${status.name}" will be hidden from the requester's ticket page.`
                  : `Requests with status "${status.name}" will be visible on the requester's ticket page.`
              }
              disabled={isRowUpdating}
            />
          </div>
        );
      },
      enableSorting: false,
      size: 120,
    },

    {
      id: "actions",
      header: () => <div className="text-center">Actions</div>,
      cell: (info) => {
        const status = info.row.original;
        const isRowUpdating = Boolean(status.id && updatingIds.has(status.id));

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
              onClick={() => onView(status)}
              disabled={isRowUpdating}
              className="h-8 w-8"
              title="View details"
            >
              <Eye className="h-4 w-4" />
            </Button>
            {!status.readonly && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(status)}
                  disabled={isRowUpdating}
                  className="h-8 w-8"
                  title="Edit status"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(status)}
                  disabled={isRowUpdating}
                  className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                  title="Delete status"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        );
      },
      enableSorting: false,
      enableHiding: false,
      size: 120,
    },
  ];
}
