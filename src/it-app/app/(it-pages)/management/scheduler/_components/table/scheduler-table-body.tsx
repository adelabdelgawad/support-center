"use client";

import { useMemo, useState, useCallback } from "react";
import { DataTable, SettingsTableHeader } from "@/components/data-table";
import { createSchedulerTableColumns } from "./scheduler-table-columns";
import { AddJobButton } from "../actions/add-job-button";
import type { ScheduledJob, TaskFunction, JobType, JobExecution, JobTriggerResponse } from "@/lib/actions/scheduler.actions";
import { JobExecutionsSheet } from "../sheets/job-executions-sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toastSuccess, toastError } from "@/lib/toast";

interface SchedulerTableBodyProps {
  jobs: ScheduledJob[];
  total: number;
  enabledCount: number;
  disabledCount: number;
  runningCount: number;
  isLoading?: boolean;
  isValidating?: boolean;
  refetch: () => void;
  updateJobs: (updatedJobs: ScheduledJob[]) => Promise<void>;
  addJob: (newJob: ScheduledJob) => Promise<void>;
  taskFunctions: TaskFunction[];
  jobTypes: JobType[];
}

export function SchedulerTableBody({
  jobs,
  total,
  enabledCount,
  disabledCount,
  runningCount,
  isLoading,
  isValidating,
  refetch,
  updateJobs,
  addJob,
  taskFunctions,
  jobTypes,
}: SchedulerTableBodyProps) {
  const [tableInstance, setTableInstance] =
    useState<import("@tanstack/react-table").Table<ScheduledJob> | null>(null);
  const [selectedJobs, setSelectedJobs] = useState<ScheduledJob[]>([]);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const isUpdating = updatingIds.size > 0;

  // Modal states
  const [viewingExecutions, setViewingExecutions] = useState<ScheduledJob | null>(null);
  const [executions, setExecutions] = useState<JobExecution[]>([]);
  const [fetchingExecutionsForJobId, setFetchingExecutionsForJobId] = useState<string | null>(null);
  const [deletingJob, setDeletingJob] = useState<ScheduledJob | null>(null);

  const selectedIds = selectedJobs.map((job) => job.id).filter(Boolean) as string[];

  /**
   * Mark jobs as being updated
   */
  const markUpdating = useCallback((ids: string[]) => {
    setUpdatingIds(new Set(ids));
  }, []);

  /**
   * Clear updating state
   */
  const clearUpdating = useCallback((ids?: string[]) => {
    if (ids && ids.length > 0) {
      const newSet = new Set(updatingIds);
      ids.forEach((id) => newSet.delete(id));
      setUpdatingIds(newSet);
    } else {
      setUpdatingIds(new Set());
    }
  }, [updatingIds]);

  /**
   * Handle clear selection after bulk operations
   */
  const handleClearSelection = useCallback(() => {
    setSelectedJobs([]);
    tableInstance?.resetRowSelection();
  }, [tableInstance]);

  /**
   * Handle refresh
   */
  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  /**
   * Handle toggle job status with updating state
   */
  const handleToggleStatus = useCallback(async (id: string, isEnabled: boolean) => {
    markUpdating([id]);
    try {
      const response = await fetch(`/api/scheduler/jobs/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isEnabled }),
      });

      if (!response.ok) throw new Error("Failed to toggle job status");

      // Optimistic update
      const updatedJobs = jobs.map((job) =>
        job.id === id ? { ...job, isEnabled } : job
      );
      await updateJobs(updatedJobs);

      toastSuccess(`Job ${isEnabled ? "Enabled" : "Disabled"}`);
    } catch (error) {
      toastError("Failed to toggle job status.");
      throw error;
    } finally {
      clearUpdating([id]);
    }
  }, [jobs, updateJobs, markUpdating, clearUpdating]);

  /**
   * Handle trigger job manually
   */
  const handleTriggerJob = useCallback(async (id: string) => {
    markUpdating([id]);

    try {
      const response = await fetch(`/api/scheduler/jobs/${id}/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to trigger job");

      const data: JobTriggerResponse = await response.json();

      // Update cache with the pending status immediately
      if (data.job) {
        await updateJobs([data.job]);
      }

      toastSuccess("Job Triggered - Job has been manually triggered.");

      // SWR auto-polling will now pick up status changes every 3 seconds
    } catch (error) {
      toastError("Failed to trigger job.");
      throw error;
    } finally {
      clearUpdating([id]);
    }
  }, [updateJobs, markUpdating, clearUpdating]);

  /**
   * Handle delete job
   */
  const handleDeleteJob = useCallback((job: ScheduledJob) => {
    setDeletingJob(job);
  }, []);

  /**
   * Confirm delete job
   */
  const handleDeleteConfirm = useCallback(async () => {
    if (!deletingJob) return;

    markUpdating([deletingJob.id]);
    try {
      const response = await fetch(`/api/scheduler/jobs/${deletingJob.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) throw new Error("Failed to delete job");

      const updatedJobs = jobs.filter((job) => job.id !== deletingJob.id);
      await updateJobs(updatedJobs);

      toastSuccess("Job Deleted");
      setDeletingJob(null);
    } catch (error) {
      toastError("Failed to delete job.");
      clearUpdating([deletingJob.id]);
    }
  }, [deletingJob, jobs, updateJobs, markUpdating, clearUpdating]);

  /**
   * Handle bulk enable
   */
  const handleBulkEnable = useCallback(async () => {
    if (selectedIds.length === 0) return;

    markUpdating(selectedIds);
    try {
      await Promise.all(
        selectedIds.map((id) =>
          fetch(`/api/scheduler/jobs/${id}/status`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ isEnabled: true }),
          })
        )
      );

      const updatedJobs = jobs.map((job) =>
        selectedIds.includes(job.id) ? { ...job, isEnabled: true } : job
      );
      await updateJobs(updatedJobs);

      toastSuccess(`${selectedIds.length} job(s) enabled`);
      handleClearSelection();
    } catch (error) {
      toastError("Failed to enable jobs.");
      clearUpdating(selectedIds);
    }
  }, [selectedIds, jobs, updateJobs, markUpdating, clearUpdating, handleClearSelection]);

  /**
   * Fetch executions before opening sheet
   * Only opens the sheet after data is fetched
   */
  const handleViewExecutions = useCallback(async (job: ScheduledJob) => {
    setFetchingExecutionsForJobId(job.id);
    setExecutions([]);

    try {
      const response = await fetch(
        `/api/scheduler/jobs/${job.id}/executions?per_page=20`,
        {
          credentials: "include",
        }
      );
      if (response.ok) {
        const data = await response.json();
        setExecutions(data.executions || []);
        // Only open the sheet after successful fetch
        setViewingExecutions(job);
      } else {
        toastError("Failed to load execution history");
      }
    } catch (error) {
      console.error("Failed to fetch executions:", error);
      toastError("Failed to load execution history");
    } finally {
      setFetchingExecutionsForJobId(null);
    }
  }, []);

  /**
   * Handle bulk disable
   */
  const handleBulkDisable = useCallback(async () => {
    if (selectedIds.length === 0) return;

    markUpdating(selectedIds);
    try {
      await Promise.all(
        selectedIds.map((id) =>
          fetch(`/api/scheduler/jobs/${id}/status`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ isEnabled: false }),
          })
        )
      );

      const updatedJobs = jobs.map((job) =>
        selectedIds.includes(job.id) ? { ...job, isEnabled: false } : job
      );
      await updateJobs(updatedJobs);

      toastSuccess(`${selectedIds.length} job(s) disabled`);
      handleClearSelection();
    } catch (error) {
      toastError("Failed to disable jobs.");
      clearUpdating(selectedIds);
    }
  }, [selectedIds, jobs, updateJobs, markUpdating, clearUpdating, handleClearSelection]);

  // Create columns with actions
  const columns = useMemo(
    () =>
      createSchedulerTableColumns({
        updatingIds,
        fetchingExecutionsForJobId,
        onToggleStatus: handleToggleStatus,
        onTriggerJob: handleTriggerJob,
        onViewExecutions: handleViewExecutions,
        onDeleteJob: handleDeleteJob,
      }),
    [updatingIds, fetchingExecutionsForJobId, handleToggleStatus, handleTriggerJob, handleViewExecutions]
  );

  // Memoize sorted data
  const tableData = useMemo(() => jobs, [jobs]);

  return (
    <div className="h-full flex flex-col min-h-0 ml-2 space-y-2">
        {/* Controller Bar */}
        <SettingsTableHeader<string>
          statusFilter={{
            activeCount: enabledCount,
            inactiveCount: disabledCount,
            totalCount: total,
          }}
          selection={{
            selectedIds,
            onClearSelection: handleClearSelection,
            itemName: "job",
          }}
          search={{
            placeholder: "Search jobs...",
            urlParam: "name",
          }}
          addButton={<AddJobButton onAdd={handleRefresh} addJob={addJob} taskFunctions={taskFunctions} jobTypes={jobTypes} />}
          bulkActions={{
            onDisable: handleBulkDisable,
            onEnable: handleBulkEnable,
            isUpdating,
          }}
          onRefresh={handleRefresh}
          tableInstance={tableInstance}
        />

      {/* Data Table */}
      <div className="flex-1 min-h-0 flex flex-col">
        <DataTable
          _data={tableData}
          columns={columns}
          tableInstanceHook={(table) => setTableInstance(table)}
          onRowSelectionChange={setSelectedJobs}
          renderToolbar={() => null}
          enableRowSelection={true}
          enableSorting={false}
          _isLoading={isLoading || isValidating}
        />
      </div>

      {/* Sheets */}
      <JobExecutionsSheet
        job={viewingExecutions}
        executions={executions}
        isLoading={false}
        open={!!viewingExecutions}
        onOpenChange={(open) => {
          if (!open) {
            setViewingExecutions(null);
            setExecutions([]);
          }
        }}
      />

      <AlertDialog open={deletingJob !== null} onOpenChange={() => setDeletingJob(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete Scheduled Job</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete &quot;{deletingJob?.name}&quot;? This action cannot be undone.
          </AlertDialogDescription>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-600">
              Delete
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
