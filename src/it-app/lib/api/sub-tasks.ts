import type { RequestListItem } from '@/types/requests-list';
import type { SubTaskStats } from '@/types/requests-list';

// Sub-tasks are now ServiceRequests with parent_task_id
// Use RequestListItem type instead of SubTask
export type SubTask = RequestListItem;

export interface SubTaskCreate {
  parentTaskId: string;
  title: string;
  description?: string;
  priorityId?: number;
  assignedToSectionId: number; // Required - section must be assigned
  assignedToTechnicianId?: string;
  estimatedHours?: number;
  dueDate?: string;
}

const BASE_URL = '/api/requests';

export async function createSubTask(parentId: string, data: SubTaskCreate): Promise<SubTask> {
  const response = await fetch(`${BASE_URL}/${parentId}/sub-tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to create sub-task');
  }

  return await response.json();
}

export async function getSubTasksByRequest(
  requestId: string,
  skip = 0,
  limit = 20
): Promise<{ items: SubTask[]; total: number }> {
  if (!requestId) {
    return { items: [], total: 0 };
  }

  const response = await fetch(
    `${BASE_URL}/${requestId}/sub-tasks?skip=${skip}&limit=${limit}`,
    {
      credentials: 'include',
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch sub-tasks');
  }

  const items = await response.json();
  const total = items.length; // Backend returns all items, no pagination header yet

  return { items, total };
}

export async function getSubTaskDetail(
  subTaskId: string
): Promise<SubTask> {
  // Sub-tasks are just requests, use regular request endpoint
  const response = await fetch(`${BASE_URL}/${subTaskId}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch sub-task details');
  }

  return await response.json();
}

export async function updateSubTask(
  subTaskId: string,
  data: Partial<SubTaskCreate>
): Promise<SubTask> {
  // Use regular request update endpoint
  const response = await fetch(`${BASE_URL}/${subTaskId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to update sub-task');
  }

  return await response.json();
}

export async function deleteSubTask(subTaskId: string): Promise<void> {
  // Soft delete via regular request endpoint
  const response = await fetch(`${BASE_URL}/${subTaskId}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to delete sub-task');
  }
}

export async function getSubTaskStats(
  requestId: string
): Promise<SubTaskStats> {
  if (!requestId) {
    return {
      total: 0,
      byStatus: {},
      blockedCount: 0,
      overdueCount: 0,
      completedCount: 0,
    };
  }

  const response = await fetch(`${BASE_URL}/${requestId}/sub-tasks/stats`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch sub-task stats');
  }

  return await response.json();
}

export async function getMySubTasks(
  statusFilter?: string,
  skip = 0,
  limit = 20
): Promise<{ items: SubTask[]; total: number }> {
  const params = new URLSearchParams({
    skip: String(skip),
    limit: String(limit),
  });
  if (statusFilter) params.set('status', statusFilter);

  const response = await fetch(`${BASE_URL}/technician/my-tasks?${params}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch my tasks');
  }

  const items = await response.json();
  const total = items.length;

  return { items, total };
}

// Screenshot linking functions
export async function linkScreenshotToSubTask(
  requestId: string,
  screenshotId: number
): Promise<void> {
  const response = await fetch(`${BASE_URL}/${requestId}/screenshots/${screenshotId}/link`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to link screenshot');
  }
}

export async function unlinkScreenshotFromSubTask(
  requestId: string,
  screenshotId: number
): Promise<void> {
  const response = await fetch(`${BASE_URL}/${requestId}/screenshots/${screenshotId}/link`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to unlink screenshot');
  }
}

export async function getAllScreenshotsForRequest(
  requestId: string
): Promise<any[]> {
  const response = await fetch(`${BASE_URL}/${requestId}/screenshots/all`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch screenshots');
  }

  return await response.json();
}
