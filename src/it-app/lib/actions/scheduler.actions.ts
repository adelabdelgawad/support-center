/**
 * Scheduler Server Actions
 *
 * Server-side actions for fetching and managing scheduled jobs.
 * These run on the server and make authenticated requests to the backend API.
 *
 * NOTE: No revalidatePath calls here - client-side SWR handles cache updates
 * with optimistic updates and polling for server-side state changes.
 */

import { serverGet, serverPost, serverPut, serverDelete } from "@/lib/fetch/server";

// Types
export interface TaskFunction {
  id: number;
  name: string;
  displayName: string;
  description: string | null;
  handlerPath: string;
  handlerType: string;
  queue: string | null;
  defaultTimeoutSeconds: number;
  isActive: boolean;
  isSystem: boolean;
  createdAt: string;
}

export interface JobType {
  id: number;
  name: string;
  displayName: string;
  description: string | null;
}

export interface ScheduledJob {
  id: string;
  name: string;
  description: string | null;
  taskFunctionId: number;
  jobTypeId: number;
  scheduleConfig: Record<string, unknown>;
  taskArgs: Record<string, unknown> | null;
  maxInstances: number;
  timeoutSeconds: number;
  retryCount: number;
  retryDelaySeconds: number;
  isEnabled: boolean;
  isPaused: boolean;
  nextRunTime: string | null;
  lastRunTime: string | null;
  lastStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledJobDetail extends ScheduledJob {
  taskFunction: TaskFunction;
  jobType: JobType;
  recentExecutions: JobExecution[];
}

export interface JobExecution {
  id: string;
  jobId: string;
  celeryTaskId: string | null;
  status: string;
  startedAt: string;
  completedAt: string | null;
  durationSeconds: number | null;
  result: Record<string, unknown> | null;
  errorMessage: string | null;
  triggeredBy: string;
  triggeredByUserId: string | null;
}

export interface SchedulerStatus {
  isRunning: boolean;
  leaderInstance: {
    id: string;
    hostname: string;
    pid: number;
    isLeader: boolean;
    leaderSince: string | null;
    lastHeartbeat: string;
    startedAt: string;
    version: string;
  } | null;
  totalJobs: number;
  enabledJobs: number;
  runningJobs: number;
  nextScheduledJob: ScheduledJob | null;
  instances: Array<{
    id: string;
    hostname: string;
    pid: number;
    isLeader: boolean;
    lastHeartbeat: string;
    startedAt: string;
  }>;
}

export interface JobsListResponse {
  jobs: ScheduledJob[];
  total: number;
  enabledCount: number;
  disabledCount: number;
  runningCount: number;
}

export interface ExecutionsListResponse {
  executions: JobExecution[];
  total: number;
}

export interface JobTriggerResponse {
  jobId: string;
  executionId: string;
  celeryTaskId: string | null;
  message: string;
  execution: JobExecution | null;
  job: ScheduledJob | null;
}

/**
 * Fetch scheduler status
 */
export async function getSchedulerStatus(): Promise<SchedulerStatus> {
  try {
    return await serverGet<SchedulerStatus>("/scheduler/status");
  } catch (error) {
    console.error("Failed to fetch scheduler status:", error);
    throw error;
  }
}

/**
 * Fetch task functions
 */
export async function getTaskFunctions(): Promise<TaskFunction[]> {
  try {
    const response = await serverGet<{ taskFunctions: TaskFunction[] }>(
      "/scheduler/task-functions"
    );
    return response.taskFunctions || [];
  } catch (error) {
    console.error("Failed to fetch task functions:", error);
    return [];
  }
}

/**
 * Fetch job types
 */
export async function getJobTypes(): Promise<JobType[]> {
  try {
    return await serverGet<JobType[]>("/scheduler/job-types") || [];
  } catch (error) {
    console.error("Failed to fetch job types:", error);
    return [];
  }
}

/**
 * Fetch scheduled jobs list
 */
export async function getScheduledJobs(params: {
  page?: number;
  perPage?: number;
  name?: string;
  isEnabled?: boolean;
  taskFunctionId?: number;
}): Promise<JobsListResponse> {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set("page", String(params.page));
  if (params.perPage) searchParams.set("per_page", String(params.perPage));
  if (params.name) searchParams.set("name", params.name);
  if (params.isEnabled !== undefined) searchParams.set("is_enabled", String(params.isEnabled));
  if (params.taskFunctionId) searchParams.set("task_function_id", String(params.taskFunctionId));

  try {
    return await serverGet<JobsListResponse>(
      `/scheduler/jobs?${searchParams.toString()}`
    );
  } catch (error) {
    console.error("Failed to fetch scheduled jobs:", error);
    return { jobs: [], total: 0, enabledCount: 0, disabledCount: 0, runningCount: 0 };
  }
}

/**
 * Fetch a single scheduled job by ID
 */
export async function getScheduledJob(jobId: string): Promise<ScheduledJobDetail> {
  try {
    return await serverGet<ScheduledJobDetail>(`/scheduler/jobs/${jobId}`);
  } catch (error) {
    console.error(`Failed to fetch job ${jobId}:`, error);
    throw error;
  }
}

/**
 * Fetch executions for a job
 */
export async function getJobExecutions(params: {
  jobId?: string;
  status?: string;
  page?: number;
  perPage?: number;
}): Promise<ExecutionsListResponse> {
  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set("page", String(params.page));
  if (params.perPage) searchParams.set("per_page", String(params.perPage));
  if (params.status) searchParams.set("status", params.status);

  const endpoint = params.jobId
    ? `/scheduler/jobs/${params.jobId}/executions?${searchParams.toString()}`
    : `/scheduler/executions?${searchParams.toString()}`;

  try {
    return await serverGet<ExecutionsListResponse>(endpoint);
  } catch (error) {
    console.error("Failed to fetch executions:", error);
    return { executions: [], total: 0 };
  }
}

/**
 * Create a new scheduled job
 */
export async function createScheduledJob(data: {
  name: string;
  description?: string;
  taskFunctionId: number;
  jobTypeId: number;
  scheduleConfig: Record<string, unknown>;
  taskArgs?: Record<string, unknown>;
  maxInstances?: number;
  timeoutSeconds?: number;
  retryCount?: number;
  retryDelaySeconds?: number;
  isEnabled?: boolean;
}): Promise<ScheduledJob> {
  try {
    const response = await serverPost<ScheduledJob>("/scheduler/jobs", data);
    return response;
  } catch (error) {
    console.error("Failed to create scheduled job:", error);
    throw error;
  }
}

/**
 * Update a scheduled job
 */
export async function updateScheduledJob(
  jobId: string,
  data: Partial<{
    name: string;
    description: string;
    taskFunctionId: number;
    jobTypeId: number;
    scheduleConfig: Record<string, unknown>;
    taskArgs: Record<string, unknown>;
    maxInstances: number;
    timeoutSeconds: number;
    retryCount: number;
    retryDelaySeconds: number;
    isEnabled: boolean;
  }>
): Promise<ScheduledJob> {
  try {
    const response = await serverPut<ScheduledJob>(`/scheduler/jobs/${jobId}`, data);
    return response;
  } catch (error) {
    console.error(`Failed to update job ${jobId}:`, error);
    throw error;
  }
}

/**
 * Delete a scheduled job
 */
export async function deleteScheduledJob(jobId: string): Promise<void> {
  try {
    await serverDelete(`/scheduler/jobs/${jobId}`);
  } catch (error) {
    console.error(`Failed to delete job ${jobId}:`, error);
    throw error;
  }
}

/**
 * Toggle job enabled status
 */
export async function toggleJobStatus(
  jobId: string,
  isEnabled: boolean
): Promise<ScheduledJob> {
  try {
    const response = await serverPut<ScheduledJob>(
      `/scheduler/jobs/${jobId}/status`,
      { isEnabled }
    );
    return response;
  } catch (error) {
    console.error(`Failed to toggle job ${jobId}:`, error);
    throw error;
  }
}

/**
 * Manually trigger a job
 */
export async function triggerJob(jobId: string): Promise<{
  jobId: string;
  executionId: string;
  celeryTaskId: string | null;
  message: string;
}> {
  try {
    const response = await serverPost<{
      jobId: string;
      executionId: string;
      celeryTaskId: string | null;
      message: string;
    }>(`/scheduler/jobs/${jobId}/trigger`);
    return response;
  } catch (error) {
    console.error(`Failed to trigger job ${jobId}:`, error);
    throw error;
  }
}
