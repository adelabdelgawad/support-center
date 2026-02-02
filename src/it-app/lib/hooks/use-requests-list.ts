'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { getTechnicianViews } from '@/lib/api/requests-list';
import { cacheKeys } from '@/lib/swr/cache-keys';
import type { TechnicianViewsResponse, ViewType } from '@/types/requests-list';

/**
 * Hook to fetch and manage requests list using SWR
 * Auto-revalidates every 30 seconds to keep counts and data fresh
 *
 * @param view - View type (unassigned, all_unsolved, etc.)
 * @param page - Page number (1-indexed)
 * @param perPage - Items per page
 * @param initialData - Initial data from server (for SSR)
 * @param businessUnitIds - Optional business unit IDs to filter by
 * @returns SWR response with requests list data and helpers
 */
export function useRequestsList(
  view: ViewType,
  page: number = 1,
  perPage: number = 20,
  initialData?: TechnicianViewsResponse,
  businessUnitIds?: number[]
) {
  const { data, error, isLoading, mutate, isValidating } = useSWR<TechnicianViewsResponse>(
    cacheKeys.technicianViews(view, page, perPage, businessUnitIds),
    () => getTechnicianViews(view, page, perPage, businessUnitIds),
    {
      fallbackData: initialData,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      refreshInterval: 60000,
      dedupingInterval: 2000,
      keepPreviousData: true,
    }
  );

  // Current data - either from SWR data or fallback to initialData
  const requestsData = data ?? initialData;

  /**
   * Enhanced loading state that considers SSR data
   * SWR's isLoading is true when no data and request is in flight
   * But when fallbackData is provided, isLoading should be false
   * We have data if EITHER data exists OR initialData was provided
   */
  const hasData = data !== undefined || initialData !== undefined;
  const loading = !hasData && isLoading;

  /**
   * Manual refresh function
   * Can be called to force an immediate revalidation
   * Wrapped in useCallback to prevent infinite re-renders
   */
  const refresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return {
    data: requestsData,
    tickets: requestsData?.data ?? [],
    counts: requestsData?.counts,
    // Use undefined to represent "unknown" state - never default to 0
    // This allows UI to distinguish between "loading" and "actually zero"
    filterCounts: requestsData?.filterCounts,
    total: requestsData?.total,
    currentPage: requestsData?.page ?? page,
    perPage: requestsData?.perPage ?? perPage,
    isLoading: loading,
    isValidating, // True when revalidating (background refresh)
    error,
    refresh,
    mutate,
  };
}
