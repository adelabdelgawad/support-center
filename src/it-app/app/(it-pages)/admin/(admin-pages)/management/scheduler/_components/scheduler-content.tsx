"use client";

import useSWR from "swr";
import { useMemo, useCallback } from "react";
import { SchedulerTableBody } from "./table/scheduler-table-body";
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
  // SWR for jobs data with automatic revalidation when jobs are running/pending
  const { data: jobsData, mutate: mutateJobs, isLoading, isValidating } = useSWR<JobsListResponse>(
    "/api/scheduler/jobs?page=1&per_page=50",
    fetchJobs,
    {
      fallbackData: initialJobs,
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      // Automatically poll when there are running or pending jobs
      refreshInterval: (data) => {
        if (!data) return 0;
        const hasActiveJobs = data.jobs.some(
          (job) => job.lastStatus === "running" || job.lastStatus === "pending"
        );
        return hasActiveJobs ? 3000 : 0; // Poll every 3 seconds if there are active jobs
      },
    }
  );

  const jobs = jobsData?.jobs ?? [];
  const total = jobsData?.total ?? 0;
  const enabledCount = jobsData?.enabledCount ?? 0;
  const disabledCount = jobsData?.disabledCount ?? 0;
  const runningCount = jobsData?.runningCount ?? 0;

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
      <SchedulerTableBody
        jobs={jobs}
        total={total}
        enabledCount={enabledCount}
        disabledCount={disabledCount}
        runningCount={runningCount}
        isLoading={isLoading}
        isValidating={isValidating}
        refetch={refresh}
        updateJobs={updateJobs}
        addJob={addJob}
        taskFunctions={initialTaskFunctions}
        jobTypes={initialJobTypes}
      />
    </div>
  );
}
