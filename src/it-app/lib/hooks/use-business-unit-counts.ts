'use client';

import useSWR from 'swr';
import { useCallback, useRef } from 'react';
import { cacheKeys } from '@/lib/swr/cache-keys';
import { getBusinessUnitCounts } from '@/lib/api/requests-list';
import type { BusinessUnitCountsResponse } from '@/lib/actions/requests-list-actions';

/**
 * Hook to fetch all available business units using SWR
 * SWR provides:
 * - Automatic caching and deduplication
 * - Background revalidation every 30 seconds
 * - View-based cache keys for proper invalidation
 *
 * This is used to show all business units in the cards, even if they have 0 tickets in the current view
 * Auto-revalidates every 30 seconds to keep counts synchronized with tickets table and sidebar
 *
 * @param view - Current view filter (e.g., 'all_unsolved', 'unassigned') to filter counts
 * @param initialData - Initial data from server (for SSR)
 * @returns Business units data and helpers
 */
export function useAllBusinessUnits(view: string, initialData?: BusinessUnitCountsResponse) {
  // Keep last known good data to prevent flash on cache key change
  const lastDataRef = useRef(initialData);

  const { data, error, isLoading, isValidating, mutate } = useSWR<BusinessUnitCountsResponse>(
    cacheKeys.businessUnitCounts(view),
    () => getBusinessUnitCounts(view),
    {
      fallbackData: initialData,
      revalidateOnMount: !initialData,
      revalidateOnFocus: false,
      refreshInterval: 60000, // 60 seconds (changed from 30s)
      dedupingInterval: 10000, // Deduplicate requests within 10 seconds
      keepPreviousData: true, // Keep previous data while loading
    }
  );

  if (data) lastDataRef.current = data;

  /**
   * Force refresh from server
   */
  const refresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return {
    allBusinessUnits: data?.businessUnits ?? lastDataRef.current?.businessUnits ?? [],
    unassignedCount: data?.unassignedCount ?? lastDataRef.current?.unassignedCount,
    isLoading,
    isValidating,
    error,
    refresh,
  };
}
