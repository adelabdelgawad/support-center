"use client";

import { ColumnDef } from "@tanstack/react-table";
import { StatusSwitch } from "@/components/ui/status-switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, History, Play, Trash2, CheckCircle, XCircle, Clock, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { ScheduledJob } from "@/lib/actions/scheduler.actions";

interface SchedulerTableColumnsProps {
  updatingIds: Set<string>;
  fetchingExecutionsForJobId: string | null;
  onToggleStatus: (id: string, isEnabled: boolean) => Promise<void>;
  onTriggerJob: (id: string) => Promise<void>;
  onViewExecutions: (job: ScheduledJob) => void;
  onDeleteJob: (job: ScheduledJob) => void;
}

/**
 * Create column definitions for the scheduler jobs table
 */
export function createSchedulerTableColumns({
  updatingIds,
  fetchingExecutionsForJobId,
  onToggleStatus,
  onTriggerJob,
  onViewExecutions,
  onDeleteJob,
}: SchedulerTableColumnsProps): ColumnDef<ScheduledJob>[] {
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
        const isRowUpdating = Boolean(row.original.id && updatingIds.has(row.original.id));

        return (
          <div className={`flex justify-center items-center px-2 ${isRowUpdating ? "opacity-60" : ""}`}>
            {isRowUpdating && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
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
        const job = info.row.original;
        const isRowUpdating = Boolean(job.id && updatingIds.has(job.id));

        return (
          <div className={`flex flex-col items-center justify-center ${isRowUpdating ? "opacity-60 pointer-events-none" : ""}`}>
            <span className="font-medium">{job.name}</span>
            {job.description && (
              <span className="text-sm text-muted-foreground">{job.description}</span>
            )}
          </div>
        );
      },
    },

    {
      accessorKey: "taskFunctionId",
      header: () => <div className="text-left">Task</div>,
      cell: (info) => {
        const isRowUpdating = Boolean(
          info.row.original.id && updatingIds.has(info.row.original.id)
        );
        return (
          <div className={isRowUpdating ? "opacity-60 pointer-events-none" : ""}>
            <Badge variant="outline">{info.getValue() as number}</Badge>
          </div>
        );
      },
    },

    {
      accessorKey: "scheduleConfig",
      header: () => <div className="text-left">Schedule</div>,
      cell: (info) => {
        const isRowUpdating = Boolean(
          info.row.original.id && updatingIds.has(info.row.original.id)
        );
        const config = info.getValue() as Record<string, unknown>;

        const formatScheduleConfig = (scheduleConfig: Record<string, unknown>) => {
          if (scheduleConfig.seconds) return `Every ${scheduleConfig.seconds}s`;
          if (scheduleConfig.minutes) return `Every ${scheduleConfig.minutes}m`;
          if (scheduleConfig.hours) return `Every ${scheduleConfig.hours}h`;
          if (scheduleConfig.minute && scheduleConfig.hour) {
            return `At ${scheduleConfig.hour}:${String(scheduleConfig.minute).padStart(2, "0")}`;
          }
          return JSON.stringify(scheduleConfig);
        };

        return (
          <div
            className={`font-mono text-sm ${isRowUpdating ? "opacity-60 pointer-events-none" : ""}`}
          >
            {formatScheduleConfig(config)}
          </div>
        );
      },
    },

    {
      id: "active",
      header: () => <div className="text-center">Active</div>,
      cell: (info) => {
        const job = info.row.original;
        const isRowUpdating = Boolean(job.id && updatingIds.has(job.id));

        return (
          <div
            className={`flex items-center justify-center ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <StatusSwitch
              checked={job.isEnabled}
              onToggle={async () => onToggleStatus(job.id, !job.isEnabled)}
              title={job.isEnabled ? "Disable job" : "Enable job"}
              description={
                job.isEnabled
                  ? `Job "${job.name}" will be disabled and won't run automatically.`
                  : `Job "${job.name}" will be enabled and run automatically.`
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
      id: "runningStatus",
      header: () => <div className="text-center">Execution Status</div>,
      cell: (info) => {
        const job = info.row.original;
        const isRowUpdating = Boolean(job.id && updatingIds.has(job.id));

        // Status icon based on last execution status
        const getStatusIcon = (jobStatus: string | null) => {
          switch (jobStatus) {
            case "success":
              return <CheckCircle className="h-4 w-4 text-green-500" />;
            case "failed":
              return <XCircle className="h-4 w-4 text-red-500" />;
            case "pending":
              return <Clock className="h-4 w-4 text-yellow-500 animate-pulse" />;
            case "running":
              return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
            default:
              return <Clock className="h-4 w-4 text-muted-foreground" />;
          }
        };

        return (
          <div
            className={`flex items-center justify-center ${
              isRowUpdating ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            {getStatusIcon(job.lastStatus)}
          </div>
        );
      },
      enableSorting: false,
      size: 80,
    },

    {
      accessorKey: "lastRunTime",
      header: () => <div className="text-left">Last Run</div>,
      cell: (info) => {
        const isRowUpdating = Boolean(
          info.row.original.id && updatingIds.has(info.row.original.id)
        );
        const value = info.getValue() as string | null;

        return (
          <div className={`text-sm ${isRowUpdating ? "opacity-60 pointer-events-none" : ""}`}>
            {value ? (
              <span suppressHydrationWarning>
                {formatDistanceToNow(new Date(value), { addSuffix: true })}
              </span>
            ) : (
              <span className="text-muted-foreground">Never</span>
            )}
          </div>
        );
      },
    },

    {
      accessorKey: "nextRunTime",
      header: () => <div className="text-left">Next Run</div>,
      cell: (info) => {
        const isRowUpdating = Boolean(
          info.row.original.id && updatingIds.has(info.row.original.id)
        );
        const value = info.getValue() as string | null;

        return (
          <div className={`text-sm ${isRowUpdating ? "opacity-60 pointer-events-none" : ""}`}>
            {value ? (
              <span suppressHydrationWarning>
                {formatDistanceToNow(new Date(value), { addSuffix: true })}
              </span>
            ) : (
              <span className="text-muted-foreground">-</span>
            )}
          </div>
        );
      },
    },

    {
      id: "actions",
      header: () => <div className="text-center">Actions</div>,
      cell: (info) => {
        const job = info.row.original;
        const isRowUpdating = Boolean(job.id && updatingIds.has(job.id));
        const isFetchingExecutions = fetchingExecutionsForJobId === job.id;

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
              onClick={() => onViewExecutions(job)}
              disabled={isRowUpdating || isFetchingExecutions}
              className="h-8 w-8"
              title="View execution history"
            >
              {isFetchingExecutions ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <History className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onTriggerJob(job.id)}
              disabled={
                isRowUpdating ||
                !job.isEnabled ||
                job.lastStatus === "running" ||
                job.lastStatus === "pending"
              }
              className="h-8 w-8"
              title={
                job.lastStatus === "running"
                  ? "Job is currently running"
                  : job.lastStatus === "pending"
                  ? "Job is pending execution"
                  : !job.isEnabled
                  ? "Job is disabled"
                  : "Trigger job manually"
              }
            >
              <Play className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDeleteJob(job)}
              disabled={isRowUpdating}
              className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
              title="Delete job"
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
