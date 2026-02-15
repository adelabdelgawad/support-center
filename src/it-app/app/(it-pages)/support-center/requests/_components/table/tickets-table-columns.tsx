"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, Eye } from "lucide-react";
import Link from "next/link";
import type { TicketListItem } from "@/lib/types/api/requests";

interface TicketsTableColumnsProps {
  onView?: (ticketId: number) => void;
  onAssign?: (ticketId: number) => void;
  onEdit?: (ticketId: number) => void;
}

/**
 * Get priority badge color based on priority name
 */
function getPriorityColorClass(priorityName: string): string {
  const lower = priorityName.toLowerCase();
  if (lower.includes("critical") || lower.includes("urgent")) {
    return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
  }
  if (lower.includes("high")) {
    return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300";
  }
  if (lower.includes("medium") || lower.includes("normal")) {
    return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
  }
  return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
}

/**
 * Create column definitions for tickets table
 */
export function createTicketsTableColumns({
  onView,
  onAssign,
  onEdit,
}: TicketsTableColumnsProps = {}): ColumnDef<TicketListItem>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <div className="flex justify-center">
          <Checkbox
            checked={table.getIsAllPageRowsSelected() || false}
            onCheckedChange={(checked) => {
              if (typeof checked === "boolean") {
                table.toggleAllRowsSelected(checked);
              }
            }}
            aria-label="Select all tickets"
            className="mx-auto"
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex justify-center">
          <Checkbox
            checked={row.getIsSelected() || false}
            onCheckedChange={(checked) => {
              if (typeof checked === "boolean") {
                row.toggleSelected(checked);
              }
            }}
            aria-label={`Select ticket ${row.original.id}`}
            className="mx-auto"
          />
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
      size: 40,
    },
    {
      accessorKey: "status",
      header: () => <div className="text-center">Status</div>,
      cell: ({ row }) => {
        const status = row.original.status;
        return (
          <div className="flex justify-center">
            <Badge
              variant="secondary"
              className="text-xs font-medium"
              style={status.color ? {
                backgroundColor: `${status.color}20`,
                color: status.color,
                borderColor: status.color,
              } : undefined}
            >
              {status.name}
            </Badge>
          </div>
        );
      },
      size: 120,
    },
    {
      accessorKey: "subject",
      header: () => <div className="text-center">Subject</div>,
      cell: ({ row }) => {
        const ticket = row.original;
        return (
          <div className="flex items-center justify-center gap-2">
            {ticket.parentTaskId && (
              <div className="flex items-center gap-1 text-muted-foreground flex-shrink-0">
                <ChevronRight className="h-3 w-3" />
                <Badge variant="outline" className="text-xs px-1.5 py-0 h-5">
                  Subtask
                </Badge>
              </div>
            )}
            <Link
              href={`/support-center/requests/${ticket.id}`}
              className="text-primary hover:text-primary/80 hover:underline truncate max-w-[300px]"
            >
              {ticket.subject}
            </Link>
          </div>
        );
      },
      size: 300,
    },
    {
      accessorKey: "requester",
      header: () => <div className="text-center">Requester</div>,
      cell: ({ row }) => (
        <div className="text-center">
          {row.original.requester?.fullName || (
            <span className="text-muted-foreground">Unknown</span>
          )}
        </div>
      ),
      size: 150,
    },
    {
      id: "businessUnit",
      accessorKey: "businessUnit",
      header: () => <div className="text-center">Business Unit</div>,
      cell: ({ row }) => (
        <div className="text-center">
          {row.original.businessUnit?.name || (
            <span className="text-muted-foreground">Unassigned</span>
          )}
        </div>
      ),
      size: 150,
    },
    {
      accessorKey: "priority",
      header: () => <div className="text-center">Priority</div>,
      cell: ({ row }) => {
        const priority = row.original.priority;
        return (
          <div className="flex justify-center">
            <Badge
              variant="secondary"
              className={`text-xs font-medium ${getPriorityColorClass(priority.name)}`}
            >
              {priority.name}
            </Badge>
          </div>
        );
      },
      size: 100,
    },
    {
      accessorKey: "requested",
      header: () => <div className="text-center">Requested</div>,
      cell: ({ row }) => (
        <div className="text-center text-sm text-muted-foreground">
          {row.original.requestedDuration}
        </div>
      ),
      size: 120,
    },
    {
      accessorKey: "dueDate",
      header: () => <div className="text-center">Due Date</div>,
      cell: ({ row }) => {
        const ticket = row.original;
        const isOverdue = ticket.isDueDateOverdue;
        return (
          <div
            className={`text-center text-sm ${
              isOverdue
                ? "text-red-600 dark:text-red-400 font-semibold"
                : ticket.dueDateDuration === "-"
                  ? "text-muted-foreground"
                  : "text-foreground"
            }`}
          >
            {ticket.dueDateDuration}
          </div>
        );
      },
      size: 120,
    },
    {
      id: "lastMessage",
      accessorKey: "lastMessage",
      header: () => <div className="text-center">Last Message</div>,
      cell: ({ row }) => {
        const lastMessage = row.original.lastMessage;
        if (!lastMessage) {
          return (
            <div className="text-center text-sm text-muted-foreground/50">
              No messages
            </div>
          );
        }
        return (
          <div className="text-center text-sm text-muted-foreground max-w-[200px] truncate">
            <span className="font-medium text-foreground">
              {lastMessage.senderName || "Unknown"}:
            </span>{" "}
            {lastMessage.content.substring(0, 40)}
            {lastMessage.content.length > 40 ? "..." : ""}
          </div>
        );
      },
      size: 200,
    },
    {
      id: "actions",
      header: () => <div className="text-center">Actions</div>,
      cell: ({ row }) => {
        const ticket = row.original;
        return (
          <div
            className="flex justify-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <Link
              href={`/support-center/requests/${ticket.id}`}
              className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
              aria-label="View ticket"
            >
              <Eye className="h-4 w-4 text-blue-600" />
            </Link>
          </div>
        );
      },
      enableSorting: false,
      enableHiding: false,
      size: 100,
    },
  ];
}
