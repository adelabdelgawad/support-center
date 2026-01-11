'use client';

import useSWR from 'swr';
import { getBusinessUnitCounts } from '@/lib/api/requests-list';
import { cacheKeys } from '@/lib/swr/cache-keys';
import type { BusinessUnitCountsResponse } from '@/lib/actions/requests-list-actions';

/**
 * Hook to fetch all available business units using SWR
 * This is used to show all business units in the cards, even if they have 0 tickets in the current view
 * Auto-revalidates every 10 seconds to keep counts synchronized with tickets table and sidebar
 *
 * @param view - Current view filter (e.g., 'all_unsolved', 'unassigned') to filter counts
 * @param initialData - Initial data from server (for SSR)
 * @returns SWR response with all available business units and helpers
 */
export function useAllBusinessUnits(view: string, initialData?: BusinessUnitCountsResponse) {
  // Include view in cache key so counts are cached per view
  const cacheKey = `${cacheKeys.businessUnitCounts}:${view}`;

  // Check if initial data is empty - if so, we need to fetch on mount
  const hasRealInitialData = initialData && initialData.businessUnits.length > 0;

  const { data, error, isLoading, mutate, isValidating } = useSWR(
    cacheKey,
    () => getBusinessUnitCounts(view),
    {
      fallbackData: initialData,
      // Fetch on mount if no real initial data (e.g., came from empty fallback)
      revalidateOnMount: !hasRealInitialData,
      revalidateIfStale: false, // Don't refetch on stale - use refreshInterval instead
      revalidateOnFocus: false, // Don't refetch on focus - prevents initial load spinner
      revalidateOnReconnect: false, // Don't refetch on reconnect - prevents initial load spinner
      refreshInterval: 30000, // Auto-revalidate every 30 seconds (synchronized with tickets and counts)
      dedupingInterval: 2000, // Dedupe requests within 2 seconds
      keepPreviousData: true, // Keep previous data while loading new data
    }
  );

  // Current data - either from SWR data or fallback to initialData
  const businessUnitsData = data ?? initialData;

  /**
   * Enhanced loading state that considers SSR data
   * We have data if EITHER data exists OR initialData was provided
   */
  const hasData = data !== undefined || initialData !== undefined;
  const loading = !hasData && isLoading;

  return {
    allBusinessUnits: businessUnitsData?.businessUnits ?? [],
    // Use undefined to represent "unknown" state - never default to 0
    // This allows UI to distinguish between "loading" and "actually zero"
    unassignedCount: businessUnitsData?.unassignedCount,
    isLoading: loading,
    isValidating,
    error,
    refresh: mutate,
  };
}
