"use server";

import { serverFetch, CACHE_PRESETS } from "@/lib/api/server-fetch";
import type {
  DeploymentJob,
  DeploymentJobListItem,
  DeploymentJobListResponse,
  DeploymentJobCountResponse,
} from "@/types/deployment-job";

/**
 * Get list of deployment jobs with optional filtering.
 *
 * Cache: SHORT_LIVED (30s) - jobs update frequently during deployments
 */
export async function getDeploymentJobs(options?: {
  status?: string;
  jobType?: string;
  limit?: number;
  offset?: number;
}): Promise<DeploymentJobListResponse> {
  try {
    const params = new URLSearchParams();

    if (options?.status) {
      params.set("status", options.status);
    }
    if (options?.jobType) {
      params.set("job_type", options.jobType);
    }
    params.set("limit", String(options?.limit ?? 50));
    params.set("offset", String(options?.offset ?? 0));

    const response = await serverFetch<DeploymentJobListResponse>(
      `/deployment-jobs?${params.toString()}`,
      CACHE_PRESETS.SHORT_LIVED()
    );

    return response;
  } catch (error: unknown) {
    console.error("Failed to fetch deployment jobs:", error);
    return { jobs: [], total: 0 };
  }
}

/**
 * Get job count with optional filtering.
 */
export async function getDeploymentJobCount(options?: {
  status?: string;
  jobType?: string;
}): Promise<number> {
  try {
    const params = new URLSearchParams();

    if (options?.status) {
      params.set("status", options.status);
    }
    if (options?.jobType) {
      params.set("job_type", options.jobType);
    }

    const response = await serverFetch<DeploymentJobCountResponse>(
      `/deployment-jobs/count?${params.toString()}`,
      CACHE_PRESETS.SHORT_LIVED()
    );

    return response.count;
  } catch (error: unknown) {
    console.error("Failed to fetch job count:", error);
    return 0;
  }
}

/**
 * Get count of queued jobs waiting for workers.
 */
export async function getQueuedJobCount(): Promise<number> {
  try {
    const response = await serverFetch<DeploymentJobCountResponse>(
      `/deployment-jobs/queued-count`,
      CACHE_PRESETS.NO_CACHE()
    );

    return response.count;
  } catch (error: unknown) {
    console.error("Failed to fetch queued job count:", error);
    return 0;
  }
}

/**
 * Get a single deployment job by ID.
 */
export async function getDeploymentJob(jobId: string): Promise<DeploymentJob | null> {
  try {
    const job = await serverFetch<DeploymentJob>(
      `/deployment-jobs/${jobId}`,
      CACHE_PRESETS.SHORT_LIVED()
    );

    return job;
  } catch (error: unknown) {
    console.error(`Failed to fetch job ${jobId}:`, error);
    return null;
  }
}

/**
 * Calculate job status metrics from list.
 * Local function - not exported as server actions must be async.
 */
interface JobMetrics {
  total: number;
  queued: number;
  inProgress: number;
  done: number;
  failed: number;
}

function calculateJobMetrics(jobs: DeploymentJobListItem[]): JobMetrics {
  return {
    total: jobs.length,
    queued: jobs.filter((j) => j.status === "queued").length,
    inProgress: jobs.filter((j) => j.status === "in_progress").length,
    done: jobs.filter((j) => j.status === "done").length,
    failed: jobs.filter((j) => j.status === "failed").length,
  };
}

/**
 * Get deployment jobs page data with filtering and metrics.
 */
export interface DeploymentJobsPageData {
  jobs: DeploymentJobListItem[];
  metrics: JobMetrics;
  total: number;
}

export async function getDeploymentJobsPageData(filters?: {
  status?: string;
  jobType?: string;
  page?: number;
  limit?: number;
}): Promise<DeploymentJobsPageData> {
  const { status, jobType, page = 1, limit = 25 } = filters || {};
  const offset = (page - 1) * limit;

  // Get all jobs for metrics calculation
  const response = await getDeploymentJobs({
    limit: 500,
    offset: 0,
  });

  const allJobs = response.jobs;
  const metrics = calculateJobMetrics(allJobs);

  // Apply status filter for display
  let filteredJobs = allJobs;

  if (status && status !== "all") {
    filteredJobs = filteredJobs.filter((j) => j.status === status);
  }

  if (jobType && jobType !== "all") {
    filteredJobs = filteredJobs.filter((j) => j.jobType === jobType);
  }

  const total = filteredJobs.length;

  // Apply pagination
  const paginatedJobs = filteredJobs.slice(offset, offset + limit);

  return {
    jobs: paginatedJobs,
    metrics,
    total,
  };
}
