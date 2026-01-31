"use client";

import useSWR from "swr";
import { useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { SchedulerTableBody } from "./table/scheduler-table-body";
import { Pagination } from "@/components/data-table";
import type {
  ScheduledJob,
  JobsListResponse,
  TaskFunction,
  JobType,
} from "@/lib/actions/scheduler.actions";

interface SchedulerContentProps {
  initialJobs: JobsListResponse;
  initialTaskFunctions: TaskFunction[];
  initialJobTypes: JobType[];
}

/**
 * Fetcher function for SWR - jobs
 */
const fetchJobs = async (url: string): Promise<JobsListResponse> => {
  const response = await fetch(url, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to fetch scheduler jobs");
  }
  return response.json();
};

/**
 * Compare function to minimize re-renders by only updating changed jobs
 * - Checks if jobs array changed (length or individual job properties)
 * - Only triggers re-render if actual data changed
 */
const compareJobsData = (
  prevData: JobsListResponse | undefined,
  newData: JobsListResponse | undefined
): boolean => {
  // Always update if transitioning from undefined to data
  if (!prevData && newData) return false;
  if (prevData && !newData) return false;
  if (!prevData || !newData) return true;

  // Quick count checks - if counts changed, data changed
  if (
    prevData.total !== newData.total ||
    prevData.enabledCount !== newData.enabledCount ||
    prevData.disabledCount !== newData.disabledCount ||
    prevData.runningCount !== newData.runningCount
  ) {
    return false; // Data changed
  }

  // Check if jobs array length changed
  if (prevData.jobs.length !== newData.jobs.length) {
    return false; // Data changed
  }

  // Deep compare each job - only update if at least one job changed
  const prevJobsMap = new Map(prevData.jobs.map((j) => [j.id, j]));
  for (const newJob of newData.jobs) {
    const prevJob = prevJobsMap.get(newJob.id);
    if (!prevJob) return false; // New job added

    // Check key properties that change during execution
    if (
      prevJob.isEnabled !== newJob.isEnabled ||
      prevJob.lastStatus !== newJob.lastStatus ||
      prevJob.nextRunTime !== newJob.nextRunTime ||
      prevJob.lastRunTime !== newJob.lastRunTime ||
      prevJob.updatedAt !== newJob.updatedAt
    ) {
      return false; // At least one job changed
    }
  }

  // No meaningful changes detected - skip re-render
  return true;
};

/**
 * SWR JUSTIFICATION:
 * - Reason: Jobs updated by background scheduler processes
 * - Trigger: Manual refresh + reconnection detection
 * - The scheduler runs jobs independently of user actions, so we need
 *   to detect when jobs complete or status changes via reconnection
 */
export function SchedulerContent({
  initialJobs,
  initialTaskFunctions,
  initialJobTypes,
}: SchedulerContentProps) {
  const searchParams = useSearchParams();
  const page = Number(searchParams?.get('page') || '1');
  const limit = Number(searchParams?.get('limit') || '10');

  // SWR for jobs data with automatic revalidation when jobs are running/pending
  const { data: jobsData, mutate: mutateJobs, isLoading } = useSWR<JobsListResponse>(
    `/api/scheduler/jobs?page=${page}&per_page=${limit}`,
    fetchJobs,
    {
      fallbackData: initialJobs,
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      // Use compare function to only re-render when data actually changed
      compare: compareJobsData,
      // Automatically poll when there are running or pending jobs
      refreshInterval: (data) => {
        if (!data) return 60000; // Default: 60 seconds
        const hasActiveJobs = data.jobs.some(
          (job) => job.lastStatus === "running" || job.lastStatus === "pending"
        );
        return hasActiveJobs ? 10000 : 60000; // Poll every 10s if active, 60s otherwise
      },
    }
  );

  const jobs = jobsData?.jobs ?? [];
  const total = jobsData?.total ?? 0;
  const enabledCount = jobsData?.enabledCount ?? 0;
  const disabledCount = jobsData?.disabledCount ?? 0;
  const runningCount = jobsData?.runningCount ?? 0;
  const totalPages = Math.ceil(total / limit);

  /**
   * Updates SWR cache with backend response data (NOT optimistic)
   * - Takes the actual server response from PUT/POST
   * - Replaces matching jobs in cache with server data
   * - Recalculates counts from the updated list
   */
  const updateJobs = useCallback(async (serverResponse: ScheduledJob[]) => {
    const currentData = jobsData;
    if (!currentData) return;

    // Map server response by ID for quick lookup
    const responseMap = new Map(serverResponse.map((job) => [job.id, job]));

    // Replace jobs with server response (NOT merge - use server data directly)
    const updatedList = currentData.jobs.map((job) =>
      responseMap.has(job.id) ? responseMap.get(job.id)! : job
    );

    // Recalculate counts from updated list
    const newEnabledCount = updatedList.filter((j) => j.isEnabled).length;
    const newDisabledCount = updatedList.filter((j) => !j.isEnabled).length;
    const newRunningCount = updatedList.filter((j) => j.lastStatus === "running").length;

    // Update cache with server data
    await mutateJobs(
      {
        ...currentData,
        jobs: updatedList,
        enabledCount: newEnabledCount,
        disabledCount: newDisabledCount,
        runningCount: newRunningCount,
      },
      { revalidate: false }
    );
  }, [jobsData, mutateJobs]);

  /**
   * Add new job to SWR cache
   * - Takes the new job from POST response
   * - Adds it to the beginning of the jobs list
   * - Recalculates counts
   */
  const addJob = useCallback(async (newJob: ScheduledJob) => {
    const currentData = jobsData;
    if (!currentData) return;

    // Add new job to the beginning of the list
    const updatedList = [newJob, ...currentData.jobs];

    // Recalculate counts from updated list
    const newEnabledCount = updatedList.filter((j) => j.isEnabled).length;
    const newDisabledCount = updatedList.filter((j) => !j.isEnabled).length;
    const newRunningCount = updatedList.filter((j) => j.lastStatus === "running").length;

    // Update cache with new data (no revalidation needed)
    await mutateJobs(
      {
        ...currentData,
        jobs: updatedList,
        total: currentData.total + 1,
        enabledCount: newEnabledCount,
        disabledCount: newDisabledCount,
        runningCount: newRunningCount,
      },
      { revalidate: false }
    );
  }, [jobsData, mutateJobs]);

  /**
   * Refresh jobs data
   */
  const refresh = useCallback(async () => {
    await mutateJobs();
  }, [mutateJobs]);

  return (
    <div className="relative h-full bg-muted min-h-0 p-1">
      {/* Main Content */}
      <div className="h-full flex flex-col min-h-0 min-w-0 ml-2 space-y-2">
        {/* Table */}
        <div className="flex-1 min-h-0 flex flex-col">
          <SchedulerTableBody
            jobs={jobs}
            total={total}
            enabledCount={enabledCount}
            disabledCount={disabledCount}
            runningCount={runningCount}
            isLoading={isLoading}
            refetch={refresh}
            updateJobs={updateJobs}
            addJob={addJob}
            taskFunctions={initialTaskFunctions}
            jobTypes={initialJobTypes}
          />
        </div>

        {/* Pagination */}
        <div className="shrink-0 bg-background border-t border-border rounded-md">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            pageSize={limit}
            totalItems={total}
          />
        </div>
      </div>
    </div>
  );
}
