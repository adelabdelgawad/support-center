/**
 * Requests List API Client
 *
 * Client-side API wrapper for fetching technician views and business unit counts
 * Calls Next.js API routes (NOT backend directly)
 */

import type { TechnicianViewsResponse, ViewType } from '@/types/requests-list';

interface BusinessUnitCount {
  id: number;
  name: string;
  count: number;
}

export interface BusinessUnitCountsResponse {
  businessUnits: BusinessUnitCount[];
  total: number;
  unassignedCount: number;
}

/**
 * Fetch technician views data
 *
 * @param view - View type to fetch
 * @param page - Page number (1-indexed)
 * @param perPage - Items per page
 * @param businessUnitIds - Optional business unit IDs to filter by
 * @returns Technician views response with data and counts
 */
export async function getTechnicianViews(
  view: ViewType = 'unassigned',
  page: number = 1,
  perPage: number = 20,
  businessUnitIds?: number[]
): Promise<TechnicianViewsResponse> {
  // Build query params
  const params = new URLSearchParams({
    view,
    page: page.toString(),
    perPage: perPage.toString(),
  });

  // Add business unit IDs if provided
  if (businessUnitIds && businessUnitIds.length > 0) {
    businessUnitIds.forEach(id => {
      params.append('business_unit_ids', id.toString());
    });
  }

  // Call Next.js API route (NOT backend directly)
  const response = await fetch(`/api/requests/technician-views?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Include httpOnly cookies
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to fetch technician views' }));
    throw new Error(error.detail || `Failed to fetch technician views: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Fetch business unit counts
 *
 * @param view - Optional view filter (e.g., 'all_unsolved', 'unassigned', 'my_unsolved')
 * @returns Business unit counts response with counts per unit and unassigned count
 */
export async function getBusinessUnitCounts(view?: string): Promise<BusinessUnitCountsResponse> {
  // Build URL with optional view parameter
  const url = view
    ? `/api/requests/business-unit-counts?view=${encodeURIComponent(view)}`
    : '/api/requests/business-unit-counts';

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Include httpOnly cookies
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to fetch business unit counts' }));
    throw new Error(error.detail || `Failed to fetch business unit counts: ${response.statusText}`);
  }

  return await response.json();
}
