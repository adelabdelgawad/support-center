'use client';

/**
 * Client-side API for business units
 * All calls go through Next.js API routes (/api/setting/business-units/*)
 * which then proxy to the backend. This ensures the backend is only
 * accessible from the server.
 */

import { apiClient, getClientErrorMessage as getErrorMessage } from '../fetch/client';
import type {
  BusinessUnitResponse,
  BusinessUnitListResponse,
  BusinessUnitCreate,
  BusinessUnitUpdate,
  BulkBusinessUnitStatusUpdate,
  BusinessUnitCountsResponse,
  WorkingHours,
} from '@/types/business-units';

const API_BASE = '/api/setting/business-units';

/**
 * Fetches business units with pagination, filtering, and sorting capabilities
 */
export async function getBusinessUnits(params?: {
  limit: number;
  skip: number;
  filterCriteria?: {
    is_active?: string;
    name?: string;
    region_id?: string;
    [key: string]: string | undefined;
  };
}): Promise<BusinessUnitListResponse> {
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

    return await apiClient.get<BusinessUnitListResponse>(`${API_BASE}?${queryParams}`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Creates a new business unit
 */
export async function createBusinessUnit(data: BusinessUnitCreate): Promise<BusinessUnitResponse> {
  try {
    return await apiClient.post<BusinessUnitResponse>(API_BASE, data);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Fetches a single business unit by ID
 */
export async function getBusinessUnit(id: number): Promise<BusinessUnitResponse> {
  try {
    return await apiClient.get<BusinessUnitResponse>(`${API_BASE}/${id}`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Updates an existing business unit
 */
export async function updateBusinessUnit(
  id: number,
  data: BusinessUnitUpdate
): Promise<BusinessUnitResponse> {
  try {
    return await apiClient.put<BusinessUnitResponse>(`${API_BASE}/${id}`, data);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Toggles business unit status (active/inactive)
 */
export async function toggleBusinessUnitStatus(id: number): Promise<BusinessUnitResponse> {
  try {
    return await apiClient.put<BusinessUnitResponse>(`${API_BASE}/${id}/status`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Bulk updates business units status
 */
export async function bulkUpdateBusinessUnitsStatus(
  data: BulkBusinessUnitStatusUpdate
): Promise<BusinessUnitResponse[]> {
  try {
    return await apiClient.post<BusinessUnitResponse[]>(`${API_BASE}/bulk-status`, data);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Deletes a business unit
 */
export async function deleteBusinessUnit(id: number): Promise<void> {
  try {
    await apiClient.delete(`${API_BASE}/${id}`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Updates working hours for a business unit
 */
export async function updateBusinessUnitWorkingHours(
  id: number,
  workingHours: WorkingHours | null
): Promise<BusinessUnitResponse> {
  try {
    return await apiClient.patch<BusinessUnitResponse>(
      `${API_BASE}/${id}/working-hours`,
      { workingHours }
    );
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Fetches business unit counts
 */
export async function getBusinessUnitCounts(): Promise<BusinessUnitCountsResponse> {
  try {
    return await apiClient.get<BusinessUnitCountsResponse>(`${API_BASE}/counts`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}
