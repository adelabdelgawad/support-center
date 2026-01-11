'use server';

import { serverFetch, CACHE_PRESETS } from '@/lib/api/server-fetch';
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

  return serverFetch<SystemEventListResponse>(
    `/system-events?${queryParams}`,
    CACHE_PRESETS.NO_CACHE()
  );
}

/**
 * Creates a new system event
 */
export async function createSystemEvent(
  data: SystemEventCreate
): Promise<SystemEventResponse> {
  return serverFetch<SystemEventResponse>(
    '/system-events',
    { method: 'POST', body: data }
  );
}

/**
 * Fetches a single system event by ID
 *
 * Cache: NO_CACHE (admin settings, may be edited frequently)
 */
export async function getSystemEvent(id: string): Promise<SystemEventResponse> {
  return serverFetch<SystemEventResponse>(
    `/system-events/${id}`,
    CACHE_PRESETS.NO_CACHE()
  );
}

/**
 * Updates an existing system event
 */
export async function updateSystemEvent(
  id: string,
  data: SystemEventUpdate
): Promise<SystemEventResponse> {
  return serverFetch<SystemEventResponse>(
    `/system-events/${id}`,
    { method: 'PATCH', body: data }
  );
}

/**
 * Toggles system event status (active/inactive)
 */
export async function toggleSystemEventStatus(id: string): Promise<SystemEventResponse> {
  return serverFetch<SystemEventResponse>(
    `/system-events/${id}/toggle`,
    { method: 'PATCH' }
  );
}

/**
 * Deletes a system event
 */
export async function deleteSystemEvent(id: string): Promise<void> {
  await serverFetch('/system-events/' + id, { method: 'DELETE' });
}

/**
 * Fetches system event counts
 *
 * Cache: SHORT_LIVED (1 minute) - counts for settings page header
 */
export async function getSystemEventCounts(): Promise<SystemEventCountsResponse> {
  return serverFetch<SystemEventCountsResponse>(
    '/system-events/counts',
    CACHE_PRESETS.SHORT_LIVED()
  );
}
