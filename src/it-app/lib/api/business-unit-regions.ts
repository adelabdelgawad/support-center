'use client';

/**
 * Client-side API for business unit regions
 * All calls go through Next.js API routes (/api/setting/business-unit-regions/*)
 * which then proxy to the backend. This ensures the backend is only
 * accessible from the server.
 */

import { apiClient, getClientErrorMessage as getErrorMessage } from '../fetch/client';
import type {
  BusinessUnitRegionResponse,
  BusinessUnitRegionListResponse,
  BusinessUnitRegionCreate,
  BusinessUnitRegionUpdate,
  BulkBusinessUnitRegionStatusUpdate,
  BusinessUnitRegionCountsResponse,
} from '@/types/business-unit-regions';

const API_BASE = '/api/setting/business-unit-regions';

/**
 * Fetches business unit regions with pagination, filtering, and sorting capabilities
 */
export async function getBusinessUnitRegions(params?: {
  limit: number;
  skip: number;
  filterCriteria?: {
    is_active?: string;
    name?: string;
    [key: string]: string | undefined;
  };
}): Promise<BusinessUnitRegionListResponse> {
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

    return await apiClient.get<BusinessUnitRegionListResponse>(`${API_BASE}?${queryParams}`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Creates a new business unit region
 */
export async function createBusinessUnitRegion(
  data: BusinessUnitRegionCreate
): Promise<BusinessUnitRegionResponse> {
  try {
    return await apiClient.post<BusinessUnitRegionResponse>(API_BASE, data);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Fetches a single business unit region by ID
 */
export async function getBusinessUnitRegion(id: number): Promise<BusinessUnitRegionResponse> {
  try {
    return await apiClient.get<BusinessUnitRegionResponse>(`${API_BASE}/${id}`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Updates an existing business unit region
 */
export async function updateBusinessUnitRegion(
  id: number,
  data: BusinessUnitRegionUpdate
): Promise<BusinessUnitRegionResponse> {
  try {
    return await apiClient.put<BusinessUnitRegionResponse>(`${API_BASE}/${id}`, data);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Toggles business unit region status (active/inactive)
 */
export async function toggleBusinessUnitRegionStatus(
  id: number
): Promise<BusinessUnitRegionResponse> {
  try {
    return await apiClient.put<BusinessUnitRegionResponse>(`${API_BASE}/${id}/status`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Bulk updates business unit regions status
 */
export async function bulkUpdateBusinessUnitRegionsStatus(
  data: BulkBusinessUnitRegionStatusUpdate
): Promise<BusinessUnitRegionResponse[]> {
  try {
    return await apiClient.post<BusinessUnitRegionResponse[]>(`${API_BASE}/bulk-status`, data);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Deletes a business unit region
 */
export async function deleteBusinessUnitRegion(id: number): Promise<void> {
  try {
    await apiClient.delete(`${API_BASE}/${id}`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Fetches business unit region counts
 */
export async function getBusinessUnitRegionCounts(): Promise<BusinessUnitRegionCountsResponse> {
  try {
    return await apiClient.get<BusinessUnitRegionCountsResponse>(`${API_BASE}/counts`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}
