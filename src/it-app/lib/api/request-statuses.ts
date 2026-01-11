'use client';

/**
 * Client-side API for request statuses
 * All calls go through Next.js API routes (/api/setting/request-statuses/*)
 * which then proxy to the backend. This ensures the backend is only
 * accessible from the server.
 */

import { apiClient, getClientErrorMessage as getErrorMessage } from '../fetch/client';
import type {
  RequestStatusResponse,
  RequestStatusListResponse,
  RequestStatusCreate,
  RequestStatusUpdate,
  BulkRequestStatusUpdate,
  RequestStatusCountsResponse,
} from '@/types/request-statuses';

const API_BASE = '/api/setting/request-statuses';

/**
 * Fetches request statuses with pagination, filtering, and sorting capabilities
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
  try {
    const queryParams = new URLSearchParams();

    // Backend uses page/per_page, not skip/limit
    const page = params?.skip ? Math.floor(params.skip / params.limit) + 1 : 1;
    queryParams.append('page', page.toString());
    queryParams.append('per_page', params?.limit.toString() ?? '10');

    // Add filter criteria
    if (params?.filterCriteria) {
      Object.entries(params.filterCriteria).forEach(([key, value]) => {
        if (value?.trim()) {
          queryParams.append(key, value);
        }
      });
    }

    return await apiClient.get<RequestStatusListResponse>(`${API_BASE}?${queryParams}`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Creates a new request status
 */
export async function createRequestStatus(data: RequestStatusCreate): Promise<RequestStatusResponse> {
  try {
    return await apiClient.post<RequestStatusResponse>(API_BASE, data);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Fetches a single request status by ID
 */
export async function getRequestStatus(id: string): Promise<RequestStatusResponse> {
  try {
    return await apiClient.get<RequestStatusResponse>(`${API_BASE}/${id}`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Updates an existing request status
 */
export async function updateRequestStatus(
  id: string,
  data: RequestStatusUpdate
): Promise<RequestStatusResponse> {
  try {
    return await apiClient.put<RequestStatusResponse>(`${API_BASE}/${id}`, data);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Toggles request status status (active/inactive)
 */
export async function toggleRequestStatusStatus(id: string): Promise<RequestStatusResponse> {
  try {
    return await apiClient.put<RequestStatusResponse>(`${API_BASE}/${id}/status`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Bulk updates request statuses status
 */
export async function bulkUpdateRequestStatusesStatus(
  data: BulkRequestStatusUpdate
): Promise<RequestStatusResponse[]> {
  try {
    return await apiClient.post<RequestStatusResponse[]>(`${API_BASE}/bulk-status`, data);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Deletes a request status
 */
export async function deleteRequestStatus(id: string): Promise<void> {
  try {
    await apiClient.delete(`${API_BASE}/${id}`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Fetches request status counts
 */
export async function getRequestStatusCounts(): Promise<RequestStatusCountsResponse> {
  try {
    return await apiClient.get<RequestStatusCountsResponse>(`${API_BASE}/counts`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}
