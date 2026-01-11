'use client';

/**
 * Client-side API for request types
 * All calls go through Next.js API routes (/api/setting/request-types/*)
 * which then proxy to the backend. This ensures the backend is only
 * accessible from the server.
 */

import { apiClient, getClientErrorMessage as getErrorMessage } from '../fetch/client';
import type {
  RequestType,
  RequestTypeListResponse,
  RequestTypeCreate,
  RequestTypeUpdate,
  BulkRequestTypeUpdate,
} from '@/types/request-types';

const API_BASE = '/api/setting/request-types';

/**
 * Fetches request types with pagination, filtering, and sorting capabilities
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

    return await apiClient.get<RequestTypeListResponse>(`${API_BASE}?${queryParams}`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Creates a new request type
 */
export async function createRequestType(data: RequestTypeCreate): Promise<RequestType> {
  try {
    return await apiClient.post<RequestType>(API_BASE, data);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Fetches a single request type by ID
 */
export async function getRequestType(id: string): Promise<RequestType> {
  try {
    return await apiClient.get<RequestType>(`${API_BASE}/${id}`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Updates an existing request type
 */
export async function updateRequestType(
  id: string,
  data: RequestTypeUpdate
): Promise<RequestType> {
  try {
    return await apiClient.put<RequestType>(`${API_BASE}/${id}`, data);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Toggles request type status (active/inactive)
 */
export async function toggleRequestTypeStatus(id: string): Promise<RequestType> {
  try {
    return await apiClient.put<RequestType>(`${API_BASE}/${id}/status`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Bulk updates request types status
 */
export async function bulkUpdateRequestTypesStatus(
  data: BulkRequestTypeUpdate
): Promise<RequestType[]> {
  try {
    return await apiClient.post<RequestType[]>(`${API_BASE}/bulk-status`, data);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Deletes a request type
 */
export async function deleteRequestType(id: string): Promise<void> {
  try {
    await apiClient.delete(`${API_BASE}/${id}`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}
