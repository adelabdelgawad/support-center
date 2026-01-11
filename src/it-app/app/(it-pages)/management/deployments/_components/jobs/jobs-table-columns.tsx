"use client";

import { ColumnDef } from "@tanstack/react-table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { DeploymentJobListItem } from "@/types/deployment-job";
import { JobStatusBadge } from "./job-status-badge";

/**
 * Format date for display
 */
function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleString();
}

/**
 * Format payload for display
 */
function formatPayload(payload: Record<string, unknown>): string {
  const keys = Object.keys(payload);
  if (keys.length === 0) return "-";
  return keys.slice(0, 3).join(", ") + (keys.length > 3 ? "..." : "");
}

/**
 * Create column definitions for the jobs table
 */
export function createJobsTableColumns(): ColumnDef<DeploymentJobListItem>[] {
  return [
    {
      accessorKey: "jobType",
      header: () => <div className="text-left">Job Type</div>,
      cell: ({ row }) => (
        <div className="font-medium">{row.original.jobType}</div>
      ),
    },

    {
      accessorKey: "status",
      header: () => <div className="text-center">Status</div>,
      cell: ({ row }) => (
        <div className="flex justify-center">
          <JobStatusBadge status={row.original.status} />
        </div>
      ),
      enableSorting: false,
    },

    {
      id: "payload",
      header: () => <div className="text-center">Payload</div>,
      cell: ({ row }) => {
        const job = row.original;
        return (
          <div className="flex justify-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-sm text-muted-foreground cursor-help">
                  {formatPayload(job.payload)}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[400px]">
                <pre className="text-xs whitespace-pre-wrap">
                  {JSON.stringify(job.payload, null, 2)}
                </pre>
              </TooltipContent>
            </Tooltip>
          </div>
        );
      },
      enableSorting: false,
    },

    {
      accessorKey: "createdAt",
      header: () => <div className="text-center">Created</div>,
      cell: ({ row }) => (
        <div className="text-center text-sm text-muted-foreground">
          {formatDate(row.original.createdAt)}
        </div>
      ),
      enableSorting: false,
    },

    {
      id: "claimedBy",
      header: () => <div className="text-center">Claimed By</div>,
      cell: ({ row }) => {
        const job = row.original;
        if (!job.claimedBy) {
          return (
            <div className="text-center text-muted-foreground">-</div>
          );
        }
        return (
          <div className="flex justify-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="font-mono text-sm cursor-help">
                  {job.claimedBy.slice(0, 8)}...
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>{job.claimedBy}</p>
                {job.claimedAt && <p>at {formatDate(job.claimedAt)}</p>}
              </TooltipContent>
            </Tooltip>
          </div>
        );
      },
      enableSorting: false,
    },

    {
      accessorKey: "completedAt",
      header: () => <div className="text-center">Completed</div>,
      cell: ({ row }) => (
        <div className="text-center text-sm text-muted-foreground">
          {formatDate(row.original.completedAt)}
        </div>
      ),
      enableSorting: false,
    },

    {
      accessorKey: "errorMessage",
      header: () => <div className="text-left">Error</div>,
      cell: ({ row }) => {
        const job = row.original;
        if (!job.errorMessage) {
          return <span className="text-muted-foreground">-</span>;
        }
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-destructive text-sm truncate max-w-[150px] block cursor-help">
                {job.errorMessage}
              </span>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-[300px]">
              <p className="whitespace-pre-wrap">{job.errorMessage}</p>
            </TooltipContent>
          </Tooltip>
        );
      },
      enableSorting: false,
    },
  ];
}
