"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eye } from "lucide-react";
import type { AuditLog } from "@/types/audit";

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  UPDATE: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  DELETE: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  LOGIN: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  LOGOUT: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
  ASSIGN: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  UNASSIGN: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
};

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function getAuditColumns(
  onViewDetail: (log: AuditLog) => void
): ColumnDef<AuditLog>[] {
  return [
    {
      accessorKey: "createdAt",
      header: "Time",
      cell: ({ row }) => {
        const date = row.original.createdAt;
        return (
          <span title={new Date(date).toLocaleString()} className="text-sm text-muted-foreground whitespace-nowrap">
            {formatRelativeTime(date)}
          </span>
        );
      },
    },
    {
      accessorKey: "userFullName",
      header: "User",
      cell: ({ row }) => (
        <div className="min-w-[120px]">
          <div className="text-sm font-medium">{row.original.userFullName || "System"}</div>
          {row.original.username && (
            <div className="text-xs text-muted-foreground">{row.original.username}</div>
          )}
        </div>
      ),
    },
    {
      accessorKey: "action",
      header: "Action",
      cell: ({ row }) => {
        const action = row.original.action;
        const colorClass = ACTION_COLORS[action] || "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300";
        return (
          <Badge variant="outline" className={`${colorClass} border-0 font-medium`}>
            {action}
          </Badge>
        );
      },
    },
    {
      accessorKey: "resourceType",
      header: "Resource",
      cell: ({ row }) => (
        <Badge variant="secondary" className="font-normal">
          {row.original.resourceType}
        </Badge>
      ),
    },
    {
      accessorKey: "resourceId",
      header: "Resource ID",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground max-w-[100px] truncate block">
          {row.original.resourceId || "-"}
        </span>
      ),
    },
    {
      accessorKey: "changesSummary",
      header: "Summary",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground max-w-[200px] truncate block">
          {row.original.changesSummary || "-"}
        </span>
      ),
    },
    {
      accessorKey: "ipAddress",
      header: "IP",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.ipAddress || "-"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onViewDetail(row.original)}
        >
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ];
}
