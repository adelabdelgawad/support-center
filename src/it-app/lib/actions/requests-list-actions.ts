'use server';

import { redirect } from 'next/navigation';
import { internalGet } from '@/lib/fetch';
import type {
  TechnicianViewsResponse,
  ViewType,
} from '@/types/requests-list';

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
 * Fetch technician views data (Server Action)
 * Used by the requests list page
 *
 * Cache: NO_CACHE (paginated/filtered list requires fresh data)
 */
export async function getTechnicianViewsData(
  view: ViewType = 'unassigned',
  page: number = 1,
  perPage: number = 20,
  businessUnitIds?: number[] | null
): Promise<TechnicianViewsResponse | null> {
  try {
    // Build query params for backend API
    const params = new URLSearchParams({
      view,
      page: page.toString(),
      per_page: perPage.toString(), // Backend uses snake_case
    });

    // Add business unit filters if provided (supports multiple IDs)
    if (businessUnitIds && businessUnitIds.length > 0) {
      businessUnitIds.forEach(id => {
        params.append('business_unit_ids', id.toString());
      });
    }

    const data = await internalGet<TechnicianViewsResponse>(
      `/api/requests/technician-views?${params.toString()}`
    );

    return data;
  } catch (error) {
    console.error('Error fetching technician views:', error);

    // Check if unauthorized (401) - redirect to login
    if (error && typeof error === 'object' && 'status' in error) {
      const statusError = error as { status?: number };
      if (statusError.status === 401) {
        redirect('/login');
      }
    }

    return null;
  }
}

/**
 * Fetch business unit counts (Server Action)
 * Used by the requests list page
 *
 * Cache: NO_CACHE (view-dependent, must be fresh)
 *
 * @param view - Optional view filter (e.g., 'all_unsolved', 'unassigned', 'my_unsolved')
 */
export async function getBusinessUnitCountsData(view?: string): Promise<BusinessUnitCountsResponse | null> {
  try {
    // Build URL with optional view parameter
    const url = view
      ? `/requests/business-unit-counts?view=${encodeURIComponent(view)}`
      : '/requests/business-unit-counts';

    const data = await internalGet<BusinessUnitCountsResponse>(
      '/api' + url
    );

    return data;
  } catch (error) {
    console.error('Error fetching business unit counts:', error);

    // Check if unauthorized (401) - redirect to login
    if (error && typeof error === 'object' && 'status' in error) {
      const statusError = error as { status?: number };
      if (statusError.status === 401) {
        redirect('/login');
      }
    }

    return null;
  }
}
