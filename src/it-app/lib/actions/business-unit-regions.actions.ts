'use server';

import { serverFetch, CACHE_PRESETS } from '@/lib/api/server-fetch';
import type {
  BusinessUnitRegionResponse,
  BusinessUnitRegionListResponse,
  BusinessUnitRegionCreate,
  BusinessUnitRegionUpdate,
  BulkBusinessUnitRegionStatusUpdate,
  BusinessUnitRegionCountsResponse,
} from '@/types/business-unit-regions';

/**
 * Fetches business unit regions with pagination, filtering, and sorting capabilities
 *
 * Cache: NO_CACHE (paginated/filtered list requires fresh data)
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

  return serverFetch<BusinessUnitRegionListResponse>(
    `/business-unit-regions/?${queryParams}`,
    CACHE_PRESETS.NO_CACHE()
  );
}

/**
 * Creates a new business unit region
 */
export async function createBusinessUnitRegion(
  data: BusinessUnitRegionCreate
): Promise<BusinessUnitRegionResponse> {
  return serverFetch<BusinessUnitRegionResponse>(
    '/business-unit-regions/',
    { method: 'POST', body: data }
  );
}

/**
 * Fetches a single business unit region by ID
 *
 * Cache: NO_CACHE (admin settings, may be edited frequently)
 */
export async function getBusinessUnitRegion(id: number): Promise<BusinessUnitRegionResponse> {
  return serverFetch<BusinessUnitRegionResponse>(
    `/business-unit-regions/${id}`,
    CACHE_PRESETS.NO_CACHE()
  );
}

/**
 * Updates an existing business unit region
 */
export async function updateBusinessUnitRegion(
  id: number,
  data: BusinessUnitRegionUpdate
): Promise<BusinessUnitRegionResponse> {
  return serverFetch<BusinessUnitRegionResponse>(
    `/business-unit-regions/${id}`,
    { method: 'PUT', body: data }
  );
}

/**
 * Toggles business unit region status (active/inactive)
 */
export async function toggleBusinessUnitRegionStatus(
  id: number
): Promise<BusinessUnitRegionResponse> {
  return serverFetch<BusinessUnitRegionResponse>(
    `/business-unit-regions/${id}/status`,
    { method: 'PUT' }
  );
}

/**
 * Bulk updates business unit regions status
 */
export async function bulkUpdateBusinessUnitRegionsStatus(
  data: BulkBusinessUnitRegionStatusUpdate
): Promise<BusinessUnitRegionResponse[]> {
  return serverFetch<BusinessUnitRegionResponse[]>(
    '/business-unit-regions/bulk-status',
    { method: 'POST', body: data }
  );
}

/**
 * Deletes a business unit region
 */
export async function deleteBusinessUnitRegion(id: number): Promise<void> {
  await serverFetch('/business-unit-regions/' + id, { method: 'DELETE' });
}

/**
 * Fetches business unit region counts
 *
 * Cache: SHORT_LIVED (1 minute) - counts for settings page header
 */
export async function getBusinessUnitRegionCounts(): Promise<BusinessUnitRegionCountsResponse> {
  return serverFetch<BusinessUnitRegionCountsResponse>(
    '/business-unit-regions/counts',
    CACHE_PRESETS.SHORT_LIVED()
  );
}
