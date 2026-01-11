'use client';

/**
 * Client-side API functions for domain user management
 * Calls internal Next.js API routes (not backend directly)
 */

export interface DomainUser {
  id: string;
  username: string;
  email?: string;
  displayName?: string;
  directManagerName?: string;
  phone?: string;
  office?: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DomainUserListResponse {
  items: DomainUser[];
  total: number;
  page: number;
  perPage: number;
}

export interface DomainUserSyncResponse {
  success: boolean;
  message: string;
  syncedCount: number;
  syncTimestamp: string;
}

export interface DomainUserSyncTaskResponse {
  taskId: string;
  status: string;
  message: string;
}

/**
 * Fetch domain users with pagination and search
 */
export async function getDomainUsers(params: {
  search?: string;
  page?: number;
  perPage?: number;
}): Promise<DomainUserListResponse> {
  const queryParams = new URLSearchParams();

  if (params.search) queryParams.append("search", params.search);
  if (params.page) queryParams.append("page", params.page.toString());
  if (params.perPage) queryParams.append("per_page", params.perPage.toString());

  const response = await fetch(`/api/domain-users?${queryParams.toString()}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch domain users");
  }

  return await response.json();
}

/**
 * Get sync task status
 */
export async function getSyncTaskStatus(taskId: string): Promise<DomainUserSyncResponse> {
  const response = await fetch(`/api/domain-users/sync/status/${taskId}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to get sync status");
  }

  return await response.json();
}

/**
 * Trigger manual domain user sync (admin only)
 * Dispatches Celery task and polls for completion
 */
export async function syncDomainUsers(): Promise<DomainUserSyncResponse> {
  // Step 1: Dispatch the sync task
  const dispatchResponse = await fetch("/api/domain-users/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  if (!dispatchResponse.ok) {
    const error = await dispatchResponse.json();
    throw new Error(error.error || "Failed to dispatch sync task");
  }

  const taskResponse: DomainUserSyncTaskResponse = await dispatchResponse.json();
  const { taskId } = taskResponse;

  // Step 2: Poll for task completion
  const maxAttempts = 60; // 60 attempts * 2 seconds = 2 minutes max
  const pollInterval = 2000; // 2 seconds

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    const statusResponse = await getSyncTaskStatus(taskId);

    // Check if task is complete (success or failure)
    if (statusResponse.message !== "Task is pending or does not exist" &&
        statusResponse.message !== "Task is currently running") {
      return statusResponse;
    }
  }

  // Timeout - task is still running
  throw new Error("Sync task timed out. It may still be running in the background.");
}
