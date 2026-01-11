'use server';

import { serverFetch, CACHE_PRESETS } from '@/lib/api/server-fetch';
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

  return serverFetch<BusinessUnitListResponse>(
    `/business-units/?${queryParams}`,
    CACHE_PRESETS.NO_CACHE()
  );
}

/**
 * Creates a new business unit
 */
export async function createBusinessUnit(
  data: BusinessUnitCreate
): Promise<BusinessUnitResponse> {
  return serverFetch<BusinessUnitResponse>(
    '/business-units/',
    { method: 'POST', body: data }
  );
}

/**
 * Fetches a single business unit by ID
 *
 * Cache: NO_CACHE (admin settings, may be edited frequently)
 */
export async function getBusinessUnit(id: number): Promise<BusinessUnitResponse> {
  return serverFetch<BusinessUnitResponse>(
    `/business-units/${id}`,
    CACHE_PRESETS.NO_CACHE()
  );
}

/**
 * Updates an existing business unit
 */
export async function updateBusinessUnit(
  id: number,
  data: BusinessUnitUpdate
): Promise<BusinessUnitResponse> {
  return serverFetch<BusinessUnitResponse>(
    `/business-units/${id}`,
    { method: 'PUT', body: data }
  );
}

/**
 * Toggles business unit status (active/inactive)
 */
export async function toggleBusinessUnitStatus(id: number): Promise<BusinessUnitResponse> {
  return serverFetch<BusinessUnitResponse>(
    `/business-units/${id}/status`,
    { method: 'PUT' }
  );
}

/**
 * Bulk updates business units status
 */
export async function bulkUpdateBusinessUnitsStatus(
  data: BulkBusinessUnitStatusUpdate
): Promise<BusinessUnitResponse[]> {
  return serverFetch<BusinessUnitResponse[]>(
    '/business-units/bulk-status',
    { method: 'POST', body: data }
  );
}

/**
 * Deletes a business unit
 */
export async function deleteBusinessUnit(id: number): Promise<void> {
  await serverFetch('/business-units/' + id, { method: 'DELETE' });
}

/**
 * Fetches business unit counts
 *
 * Cache: SHORT_LIVED (1 minute) - counts for settings page header
 */
export async function getBusinessUnitCounts(): Promise<BusinessUnitCountsResponse> {
  return serverFetch<BusinessUnitCountsResponse>(
    '/business-units/counts',
    CACHE_PRESETS.SHORT_LIVED()
  );
}

/**
 * Fetches active regions for form dropdowns
 *
 * Cache: REFERENCE_DATA (10 minutes) - dropdown options rarely change
 */
export async function getActiveRegionsForForms(): Promise<BusinessUnitRegionResponse[]> {
  const result = await serverFetch<BusinessUnitRegionListResponse>(
    '/business-unit-regions/?is_active=true&limit=100',
    CACHE_PRESETS.REFERENCE_DATA('regions-dropdown')
  );
  return result.regions;
}
