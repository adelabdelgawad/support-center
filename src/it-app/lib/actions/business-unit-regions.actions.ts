'use server';

import { serverGet, serverPost, serverPut, serverDelete } from '@/lib/fetch';
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

  return serverGet<BusinessUnitRegionListResponse>(
    `/business-unit-regions?${queryParams}`,
    { revalidate: 0 }
  );
}

/**
 * Creates a new business unit region
 */
export async function createBusinessUnitRegion(
  data: BusinessUnitRegionCreate
): Promise<BusinessUnitRegionResponse> {
  return serverPost<BusinessUnitRegionResponse>(
    '/business-unit-regions',
    data
  );
}

/**
 * Fetches a single business unit region by ID
 *
 * Cache: NO_CACHE (admin settings, may be edited frequently)
 */
export async function getBusinessUnitRegion(id: number): Promise<BusinessUnitRegionResponse> {
  return serverGet<BusinessUnitRegionResponse>(
    `/business-unit-regions/${id}`,
    { revalidate: 0 }
  );
}

/**
 * Updates an existing business unit region
 */
export async function updateBusinessUnitRegion(
  id: number,
  data: BusinessUnitRegionUpdate
): Promise<BusinessUnitRegionResponse> {
  return serverPut<BusinessUnitRegionResponse>(
    `/business-unit-regions/${id}`,
    data
  );
}

/**
 * Toggles business unit region status (active/inactive)
 */
export async function toggleBusinessUnitRegionStatus(
  id: number
): Promise<BusinessUnitRegionResponse> {
  return serverPut<BusinessUnitRegionResponse>(
    `/business-unit-regions/${id}/status`
  );
}

/**
 * Bulk updates business unit regions status
 */
export async function bulkUpdateBusinessUnitRegionsStatus(
  data: BulkBusinessUnitRegionStatusUpdate
): Promise<BusinessUnitRegionResponse[]> {
  return serverPost<BusinessUnitRegionResponse[]>(
    '/business-unit-regions/bulk-status',
    data
  );
}

/**
 * Deletes a business unit region
 */
export async function deleteBusinessUnitRegion(id: number): Promise<void> {
  await serverDelete(`/business-unit-regions/${id}`);
}

/**
 * Fetches business unit region counts
 *
 * Cache: NO_CACHE - counts for settings page header
 */
export async function getBusinessUnitRegionCounts(): Promise<BusinessUnitRegionCountsResponse> {
  return serverGet<BusinessUnitRegionCountsResponse>(
    '/business-unit-regions/counts',
    { revalidate: 0 }
  );
}
