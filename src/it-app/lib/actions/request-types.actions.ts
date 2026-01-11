'use server';

import { serverFetch, CACHE_PRESETS } from '@/lib/api/server-fetch';
import type {
  RequestType,
  RequestTypeCreate,
  RequestTypeUpdate,
  RequestTypeListResponse,
  BulkRequestTypeUpdate,
} from '@/types/request-types';

/**
 * Fetches request types with pagination, filtering, and sorting capabilities
 * Used for server-side rendering and initial data loading
 *
 * Cache: NO_CACHE (paginated/filtered list requires fresh data)
 */
export async function getRequestTypes(params?: {
  limit: number;
  skip: number;
  filterCriteria?: {
    is_active?: string;
    name?: string;
    [key: string]: string | undefined;
  };
}): Promise<RequestTypeListResponse> {
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

  return serverFetch<RequestTypeListResponse>(
    `/request-types/?${queryParams}`,
    CACHE_PRESETS.NO_CACHE()
  );
}

/**
 * Fetches a single request type by ID
 *
 * Cache: NO_CACHE (admin settings, may be edited frequently)
 */
export async function getRequestType(id: string): Promise<RequestType> {
  return serverFetch<RequestType>(
    `/request-types/${id}`,
    CACHE_PRESETS.NO_CACHE()
  );
}

/**
 * Creates a new request type
 */
export async function createRequestType(
  data: RequestTypeCreate
): Promise<RequestType> {
  return serverFetch<RequestType>(
    '/request-types/',
    { method: 'POST', body: data }
  );
}

/**
 * Updates an existing request type
 */
export async function updateRequestType(
  id: string,
  data: RequestTypeUpdate
): Promise<RequestType> {
  return serverFetch<RequestType>(
    `/request-types/${id}`,
    { method: 'PUT', body: data }
  );
}

/**
 * Toggles request type status (active/inactive)
 */
export async function toggleRequestTypeStatus(id: string): Promise<RequestType> {
  return serverFetch<RequestType>(
    `/request-types/${id}/status`,
    { method: 'PUT' }
  );
}

/**
 * Bulk updates request types status
 */
export async function bulkUpdateRequestTypesStatus(
  data: BulkRequestTypeUpdate
): Promise<RequestType[]> {
  return serverFetch<RequestType[]>(
    '/request-types/bulk-status',
    { method: 'POST', body: data }
  );
}

/**
 * Deletes a request type
 */
export async function deleteRequestType(id: string): Promise<void> {
  await serverFetch('/request-types/' + id, { method: 'DELETE' });
}
