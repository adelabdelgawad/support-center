'use server';

import { serverFetch, CACHE_PRESETS } from '@/lib/api/server-fetch';
import type {
  RequestStatusResponse,
  RequestStatusListResponse,
  RequestStatusCreate,
  RequestStatusUpdate,
  BulkRequestStatusUpdate,
  RequestStatusCountsResponse,
} from '@/types/request-statuses';

/**
 * Fetches request statuses with pagination, filtering, and sorting capabilities
 * Used for server-side rendering and initial data loading
 *
 * Cache: NO_CACHE (paginated/filtered list requires fresh data)
 */
export async function getRequestStatuses(params?: {
  limit: number;
  skip: number;
  filterCriteria?: {
    is_active?: string;
    name?: string;
    readonly?: string;
    [key: string]: string | undefined;
  };
}): Promise<RequestStatusListResponse> {
  const queryParams = new URLSearchParams();

  // Backend uses page/per_page, not skip/limit
  const page = params?.skip ? Math.floor(params.skip / params.limit) + 1 : 1;
  queryParams.append('page', page.toString());
  queryParams.append('per_page', params?.limit.toString() ?? '10');

  // Add filter criteria
  if (params?.filterCriteria) {
    Object.entries(params.filterCriteria).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.append(key, String(value));
      }
    });
  }

  return serverFetch<RequestStatusListResponse>(
    `/request-statuses/?${queryParams}`,
    CACHE_PRESETS.NO_CACHE()
  );
}

/**
 * Creates a new request status
 */
export async function createRequestStatus(
  data: RequestStatusCreate
): Promise<RequestStatusResponse> {
  return serverFetch<RequestStatusResponse>(
    '/request-statuses/',
    { method: 'POST', body: data }
  );
}

/**
 * Fetches a single request status by ID
 *
 * Cache: NO_CACHE (admin settings, may be edited frequently)
 */
export async function getRequestStatus(id: string): Promise<RequestStatusResponse> {
  return serverFetch<RequestStatusResponse>(
    `/request-statuses/${id}`,
    CACHE_PRESETS.NO_CACHE()
  );
}

/**
 * Updates an existing request status
 */
export async function updateRequestStatus(
  id: string,
  data: RequestStatusUpdate
): Promise<RequestStatusResponse> {
  return serverFetch<RequestStatusResponse>(
    `/request-statuses/${id}`,
    { method: 'PUT', body: data }
  );
}

/**
 * Toggles request status status (active/inactive)
 */
export async function toggleRequestStatusStatus(id: string): Promise<RequestStatusResponse> {
  return serverFetch<RequestStatusResponse>(
    `/request-statuses/${id}/status`,
    { method: 'PUT' }
  );
}

/**
 * Bulk updates request statuses status
 */
export async function bulkUpdateRequestStatusesStatus(
  data: BulkRequestStatusUpdate
): Promise<RequestStatusResponse[]> {
  return serverFetch<RequestStatusResponse[]>(
    '/request-statuses/bulk-status',
    { method: 'POST', body: data }
  );
}

/**
 * Deletes a request status
 */
export async function deleteRequestStatus(id: string): Promise<void> {
  await serverFetch('/request-statuses/' + id, { method: 'DELETE' });
}

/**
 * Fetches request status counts
 *
 * Cache: SHORT_LIVED (1 minute) - counts for settings page header
 */
export async function getRequestStatusCounts(): Promise<RequestStatusCountsResponse> {
  return serverFetch<RequestStatusCountsResponse>(
    '/request-statuses/counts',
    CACHE_PRESETS.SHORT_LIVED()
  );
}
