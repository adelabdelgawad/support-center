'use server';

import { serverGet, serverPost, serverPut, serverDelete } from '@/lib/fetch';
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

  return serverGet<RequestStatusListResponse>(
    `/request-statuses?${queryParams}`,
    { revalidate: 0 }
  );
}

/**
 * Creates a new request status
 */
export async function createRequestStatus(
  data: RequestStatusCreate
): Promise<RequestStatusResponse> {
  return serverPost<RequestStatusResponse>(
    '/request-statuses',
    data
  );
}

/**
 * Fetches a single request status by ID
 *
 * Cache: NO_CACHE (admin settings, may be edited frequently)
 */
export async function getRequestStatus(id: string): Promise<RequestStatusResponse> {
  return serverGet<RequestStatusResponse>(
    `/request-statuses/${id}`,
    { revalidate: 0 }
  );
}

/**
 * Updates an existing request status
 */
export async function updateRequestStatus(
  id: string,
  data: RequestStatusUpdate
): Promise<RequestStatusResponse> {
  return serverPut<RequestStatusResponse>(
    `/request-statuses/${id}`,
    data
  );
}

/**
 * Toggles request status status (active/inactive)
 */
export async function toggleRequestStatusStatus(id: string): Promise<RequestStatusResponse> {
  return serverPut<RequestStatusResponse>(
    `/request-statuses/${id}/status`
  );
}

/**
 * Bulk updates request statuses status
 */
export async function bulkUpdateRequestStatusesStatus(
  data: BulkRequestStatusUpdate
): Promise<RequestStatusResponse[]> {
  return serverPost<RequestStatusResponse[]>(
    '/request-statuses/bulk-status',
    data
  );
}

/**
 * Deletes a request status
 */
export async function deleteRequestStatus(id: string): Promise<void> {
  await serverDelete(`/request-statuses/${id}`);
}

/**
 * Fetches request status counts
 *
 * Cache: NO_CACHE - counts for settings page header
 */
export async function getRequestStatusCounts(): Promise<RequestStatusCountsResponse> {
  return serverGet<RequestStatusCountsResponse>(
    '/request-statuses/counts',
    { revalidate: 0 }
  );
}
