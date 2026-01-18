"use client";

import { ColumnDef } from "@tanstack/react-table";
import { StatusSwitch } from "@/components/ui/status-switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Eye, Pencil, Trash2 } from "lucide-react";
import type { SystemMessageResponse } from "@/types/system-messages";

interface SystemMessagesTableColumnsProps {
  updatingIds: Set<number>;
  onToggleStatus: (id: number) => Promise<void>;
  onView: (message: SystemMessageResponse) => void;
  onEdit: (message: SystemMessageResponse) => void;
  onDelete: (messageId: number) => void;
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
 * Combine unique placeholders from both EN and AR templates
 */
function getCombinedPlaceholders(templateEn: string, templateAr: string): string[] {
  const enPlaceholders = extractPlaceholders(templateEn);
  const arPlaceholders = extractPlaceholders(templateAr);
  const combined = [...new Set([...enPlaceholders, ...arPlaceholders])];
  return combined;
}

/**
 * Truncate text with ellipsis
 */
function truncateText(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * Create column definitions for the system messages table
 */
export function createSystemMessagesTableColumns({
  updatingIds,
  onToggleStatus,
  onView,
  onEdit,
  onDelete,
  locale = 'en',
}: SystemMessagesTableColumnsProps): ColumnDef<SystemMessageResponse>[] {
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
      accessorKey: "messageType",
      header: () => <div className="text-left">Message Type</div>,
      cell: (info) => {
        const message = info.row.original;
        const isRowUpdating = Boolean(message.id && updatingIds.has(message.id));

        return (
          <div className={`${isRowUpdating ? "opacity-60 pointer-events-none" : ""}`}>
            <div className="font-medium font-mono text-sm">
              {message.messageType}
            </div>
          </div>
        );
      },
      size: 200,
    },

    {
      accessorKey: "templateEn",
      header: () => <div className="text-left">English Template</div>,
      cell: (info) => {
        const message = info.row.original;
        const isRowUpdating = Boolean(message.id && updatingIds.has(message.id));
        const template = message.templateEn;
        const truncated = truncateText(template, 80);
        const isTruncated = template.length > 80;

        return (
          <div
            className={`text-sm ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            <div className="text-left" dir="ltr">
              <span className="text-muted-foreground">{truncated}</span>
              {isTruncated && (
                <Badge variant="outline" className="ml-2 text-xs">
                  +{template.length - 80}
                </Badge>
              )}
            </div>
          </div>
        );
      },
      size: 300,
    },

    {
      accessorKey: "templateAr",
      header: () => <div className="text-right">Arabic Template</div>,
      cell: (info) => {
        const message = info.row.original;
        const isRowUpdating = Boolean(message.id && updatingIds.has(message.id));
        const template = message.templateAr;
        const truncated = truncateText(template, 80);
        const isTruncated = template.length > 80;

        return (
          <div
            className={`text-sm ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            <div className="text-right" dir="rtl">
              <span className="text-muted-foreground">{truncated}</span>
              {isTruncated && (
                <Badge variant="outline" className="mr-2 text-xs">
                  +{template.length - 80}
                </Badge>
              )}
            </div>
          </div>
        );
      },
      size: 300,
    },

    {
      id: "placeholders",
      header: () => <div className="text-left">Placeholders</div>,
      cell: ({ row }) => {
        const message = row.original;
        const isRowUpdating = Boolean(message.id && updatingIds.has(message.id));
        const placeholders = getCombinedPlaceholders(message.templateEn, message.templateAr);

        return (
          <div
            className={`flex flex-wrap gap-1 ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            {placeholders.length > 0 ? (
              placeholders.map((placeholder, idx) => (
                <Badge key={idx} variant="outline" className="text-xs font-mono">
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
      accessorKey: "isActive",
      header: () => <div className="text-center">Status</div>,
      cell: (info) => {
        const message = info.row.original;
        const isRowUpdating = Boolean(message.id && updatingIds.has(message.id));

        return (
          <div
            className={`flex justify-center ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <StatusSwitch
              checked={info.getValue() as boolean}
              onToggle={async () => onToggleStatus(message.id)}
              title={message.isActive ? "Deactivate message" : "Activate message"}
              description={message.isActive ? "This message will be deactivated" : "This message will be activated"}
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
      cell: (info) => {
        const message = info.row.original;
        const isRowUpdating = Boolean(message.id && updatingIds.has(message.id));

        return (
          <div
            className={`flex items-center justify-center gap-1 ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onView(message)}
              disabled={isRowUpdating}
              title="View"
              className="h-8 w-8 p-0"
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(message)}
              disabled={isRowUpdating}
              title="Edit"
              className="h-8 w-8 p-0"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(message.id)}
              disabled={isRowUpdating}
              title="Delete"
              className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
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
