"use client";

import { ColumnDef } from "@tanstack/react-table";
import { StatusSwitch } from "@/components/ui/status-switch";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import type { SystemEventResponse } from "@/types/system-events";

interface SystemEventsTableColumnsProps {
  updatingIds: Set<number>;
  onToggleStatus: (id: number) => Promise<void>;
  locale?: string;
}

/**
 * Extract placeholders from template string
 */
function extractPlaceholders(template: string | null | undefined): string[] {
  if (!template) return [];
  const matches = template.match(/\{([^}]+)\}/g);
  return matches ? matches.map(m => m.slice(1, -1)) : [];
}

/**
 * Create column definitions for the system events table
 */
export function createSystemEventsTableColumns({
  updatingIds,
  onToggleStatus,
  locale = 'en',
}: SystemEventsTableColumnsProps): ColumnDef<SystemEventResponse>[] {
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
      accessorKey: "eventName",
      header: () => <div className="text-left">Event Name</div>,
      cell: (info) => {
        const event = info.row.original;
        const isRowUpdating = Boolean(event.id && updatingIds.has(event.id));
        const eventName = locale === 'ar' ? event.eventNameAr : event.eventNameEn;

        return (
          <div className={`${isRowUpdating ? "opacity-60 pointer-events-none" : ""}`}>
            <div className="font-medium">{eventName}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {event.eventKey}
            </div>
          </div>
        );
      },
      size: 200,
    },

    {
      accessorKey: "systemMessage",
      header: () => <div className="text-left">Linked Message</div>,
      cell: (info) => {
        const event = info.row.original;
        const isRowUpdating = Boolean(event.id && updatingIds.has(event.id));
        const template = event.systemMessage
          ? locale === 'ar'
            ? event.systemMessage.templateAr
            : event.systemMessage.templateEn
          : null;

        return (
          <div
            className={`text-sm ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            {template ? (
              <div className="max-w-md truncate text-muted-foreground">
                {template}
              </div>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        );
      },
      size: 300,
    },

    {
      id: "placeholders",
      header: () => <div className="text-left">Placeholders</div>,
      cell: ({ row }) => {
        const event = row.original;
        const isRowUpdating = Boolean(event.id && updatingIds.has(event.id));
        const template = event.systemMessage
          ? locale === 'ar'
            ? event.systemMessage.templateAr
            : event.systemMessage.templateEn
          : null;
        const placeholders = extractPlaceholders(template);

        return (
          <div
            className={`flex flex-wrap gap-1 ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            {placeholders.length > 0 ? (
              placeholders.map((placeholder, idx) => (
                <Badge key={idx} variant="outline" className="text-xs">
                  {placeholder}
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground text-sm">—</span>
            )}
          </div>
        );
      },
      size: 200,
    },

    {
      accessorKey: "triggerTiming",
      header: () => <div className="text-center">Trigger</div>,
      cell: (info) => {
        const isRowUpdating = Boolean(
          info.row.original.id && updatingIds.has(info.row.original.id)
        );
        const value = info.getValue() as string;

        return (
          <div
            className={`flex justify-center ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            <Badge variant={value === 'immediate' ? 'default' : 'secondary'}>
              {value}
            </Badge>
          </div>
        );
      },
      size: 100,
    },

    {
      accessorKey: "isActive",
      header: () => <div className="text-center">Status</div>,
      cell: (info) => {
        const event = info.row.original;
        const isRowUpdating = Boolean(event.id && updatingIds.has(event.id));

        return (
          <div
            className={`flex justify-center ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <StatusSwitch
              checked={info.getValue() as boolean}
              onToggle={async () => onToggleStatus(event.id)}
              title={event.isActive ? "Deactivate event" : "Activate event"}
              description={event.isActive ? "This event will be deactivated" : "This event will be activated"}
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
