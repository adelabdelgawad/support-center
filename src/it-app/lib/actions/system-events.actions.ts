'use server';

import { serverGet, serverPost, serverPatch, serverDelete } from '@/lib/fetch/server';
import type {
  SystemEventResponse,
  SystemEventListResponse,
  SystemEventCreate,
  SystemEventUpdate,
  SystemEventCountsResponse,
} from '@/types/system-events';

/**
 * Fetches system events with pagination and filtering capabilities
 * Used for server-side rendering and initial data loading
 *
 * Cache: NO_CACHE (paginated/filtered list requires fresh data)
 */
export async function getSystemEvents(params?: {
  limit: number;
  skip: number;
  filterCriteria?: {
    is_active?: string;
    event_name?: string;
    [key: string]: string | undefined;
  };
}): Promise<SystemEventListResponse> {
  const queryParams = new URLSearchParams();

  // Add skip and limit directly (backend uses skip/limit, not page/per_page)
  queryParams.append('skip', params?.skip.toString() ?? '0');
  queryParams.append('limit', params?.limit.toString() ?? '20');

  // Add filter criteria
  if (params?.filterCriteria) {
    Object.entries(params.filterCriteria).forEach(([key, value]) => {
      if (value?.trim()) {
        queryParams.append(key, value);
      }
    });
  }

  return serverGet<SystemEventListResponse>(
    `/system-events?${queryParams}`,
    { revalidate: 0 }
  );
}

/**
 * Creates a new system event
 */
export async function createSystemEvent(
  data: SystemEventCreate
): Promise<SystemEventResponse> {
  return serverPost<SystemEventResponse>(
    '/system-events',
    data
  );
}

/**
 * Fetches a single system event by ID
 *
 * Cache: NO_CACHE (admin settings, may be edited frequently)
 */
export async function getSystemEvent(id: string): Promise<SystemEventResponse> {
  return serverGet<SystemEventResponse>(
    `/system-events/${id}`,
    { revalidate: 0 }
  );
}

/**
 * Updates an existing system event
 */
export async function updateSystemEvent(
  id: string,
  data: SystemEventUpdate
): Promise<SystemEventResponse> {
  return serverPatch<SystemEventResponse>(
    `/system-events/${id}`,
    data
  );
}

/**
 * Toggles system event status (active/inactive)
 */
export async function toggleSystemEventStatus(id: string): Promise<SystemEventResponse> {
  return serverPatch<SystemEventResponse>(
    `/system-events/${id}/toggle`
  );
}

/**
 * Deletes a system event
 */
export async function deleteSystemEvent(id: string): Promise<void> {
  await serverDelete(`/system-events/${id}`);
}

/**
 * Fetches system event counts
 *
 * Cache: SHORT_LIVED (1 minute) - counts for settings page header
 */
export async function getSystemEventCounts(): Promise<SystemEventCountsResponse> {
  return serverGet<SystemEventCountsResponse>(
    '/system-events/counts',
    { revalidate: 0 }
  );
}
