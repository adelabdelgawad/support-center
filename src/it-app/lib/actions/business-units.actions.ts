'use server';

import { internalGet, internalPost, internalPut, internalDelete } from '@/lib/fetch';
import type {
  BusinessUnitResponse,
  BusinessUnitListResponse,
  BusinessUnitCreate,
  BusinessUnitUpdate,
  BulkBusinessUnitStatusUpdate,
  BusinessUnitCountsResponse,
} from '@/types/business-units';
import type { BusinessUnitRegionResponse, BusinessUnitRegionListResponse } from '@/types/business-unit-regions';

/**
 * Fetches business units with pagination, filtering, and sorting capabilities
 *
 * Cache: NO_CACHE (paginated/filtered list requires fresh data)
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
  const queryParams = new URLSearchParams();

  // Backend uses page/per_page, not skip/limit
  const page = params?.skip ? Math.floor(params.skip / params.limit) + 1 : 1;
  queryParams.append('page', page.toString());
  queryParams.append('per_page', params?.limit.toString() ?? '10');

  // Add filter criteria
  if (params?.filterCriteria) {
    Object.entries(params.filterCriteria).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        const stringValue = String(value);
        if (stringValue.trim()) {
          queryParams.append(key, stringValue);
        }
      }
    });
  }

  return internalGet<BusinessUnitListResponse>(
    `/api/business-units?${queryParams}`
  );
}

/**
 * Creates a new business unit
 */
export async function createBusinessUnit(
  data: BusinessUnitCreate
): Promise<BusinessUnitResponse> {
  return internalPost<BusinessUnitResponse>(
    '/api/business-units',
    data
  );
}

/**
 * Fetches a single business unit by ID
 *
 * Cache: NO_CACHE (admin settings, may be edited frequently)
 */
export async function getBusinessUnit(id: number): Promise<BusinessUnitResponse> {
  return internalGet<BusinessUnitResponse>(
    `/api/business-units/${id}`
  );
}

/**
 * Updates an existing business unit
 */
export async function updateBusinessUnit(
  id: number,
  data: BusinessUnitUpdate
): Promise<BusinessUnitResponse> {
  return internalPut<BusinessUnitResponse>(
    `/api/business-units/${id}`,
    data
  );
}

/**
 * Toggles business unit status (active/inactive)
 */
export async function toggleBusinessUnitStatus(id: number): Promise<BusinessUnitResponse> {
  return internalPut<BusinessUnitResponse>(
    `/api/setting/business-units/${id}/status`
  );
}

/**
 * Bulk updates business units status
 */
export async function bulkUpdateBusinessUnitsStatus(
  data: BulkBusinessUnitStatusUpdate
): Promise<BusinessUnitResponse[]> {
  return internalPost<BusinessUnitResponse[]>(
    '/api/setting/business-units/bulk-status',
    data
  );
}

/**
 * Deletes a business unit
 */
export async function deleteBusinessUnit(id: number): Promise<void> {
  await internalDelete(`/api/business-units/${id}`);
}

/**
 * Fetches business unit counts
 *
 * Cache: NO_CACHE - counts for settings page header
 */
export async function getBusinessUnitCounts(): Promise<BusinessUnitCountsResponse> {
  return internalGet<BusinessUnitCountsResponse>(
    '/api/setting/business-units/counts'
  );
}

/**
 * Fetches active regions for form dropdowns
 *
 * Cache: NO_CACHE - dropdown options rarely change
 */
export async function getActiveRegionsForForms(): Promise<BusinessUnitRegionResponse[]> {
  const result = await internalGet<BusinessUnitRegionListResponse>(
    '/api/business-unit-regions?is_active=true&limit=100'
  );
  return result.regions;
}
