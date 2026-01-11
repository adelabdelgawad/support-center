'use client';

import useSWR from 'swr';
import { cacheKeys } from '@/lib/swr/cache-keys';
import type { ViewCounts } from '@/types/requests-list';

/**
 * Dedicated hook for view counts in the sidebar
 * Uses a separate cache key to ensure counts are always fresh
 * and can be updated optimistically when actions occur
 */

interface ViewCountsResponse {
  counts: ViewCounts;
}

async function fetchViewCounts(): Promise<ViewCounts> {
  // Fetch counts using the default view (unassigned) - counts are the same for all views
  const response = await fetch('/api/requests/technician-views?view=unassigned&page=1&perPage=1', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch view counts');
  }

  const data = await response.json();
  return data.counts;
}

export function useViewCounts(initialCounts?: ViewCounts) {
  // Check if initial counts are empty (all zeros) - if so, we need to fetch on mount
  const hasRealInitialData = initialCounts && Object.values(initialCounts).some(count => count > 0);

  const { data, error, isLoading, isValidating, mutate } = useSWR<ViewCounts>(
    cacheKeys.viewCounts,
    fetchViewCounts,
    {
      fallbackData: initialCounts,
      // Fetch on mount if no real initial data (e.g., came from empty fallback)
      revalidateOnMount: !hasRealInitialData,
      revalidateIfStale: false, // Don't refetch on stale - use refreshInterval instead
      revalidateOnFocus: false, // Don't refetch on focus - prevents initial load spinner
      revalidateOnReconnect: false, // Don't refetch on reconnect - prevents initial load spinner
      refreshInterval: 30000, // Auto-revalidate every 30 seconds
      dedupingInterval: 2000, // Dedupe requests within 2 seconds
      keepPreviousData: true,
    }
  );

  // HYDRATION SAFETY: Always prefer initialCounts on first render to match SSR
  // Use data if available (from SWR cache), otherwise fallback to initialCounts
  // This ensures server and client render the same values on hydration
  const counts = data ?? initialCounts;

  /**
   * Enhanced loading state that considers SSR data
   * We have data if EITHER data exists OR initialCounts was provided
   */
  const hasData = data !== undefined || initialCounts !== undefined;
  const loading = !hasData && isLoading;

  // Explicit flag for whether counts are ready (not undefined)
  const isCountsReady = counts !== undefined;

  /**
   * Optimistically update counts when a ticket changes
   * @param updates - Partial updates to apply to counts
   */
  const updateCountsOptimistically = async (updates: Partial<ViewCounts>) => {
    await mutate(
      (currentCounts) => {
        if (!currentCounts) return currentCounts;
        return { ...currentCounts, ...updates };
      },
      { revalidate: false }
    );
  };

  /**
   * Decrement a specific view count (e.g., when a ticket moves to another view)
   */
  const decrementCount = async (view: keyof ViewCounts, amount: number = 1) => {
    await mutate(
      (currentCounts) => {
        if (!currentCounts) return currentCounts;
        return {
          ...currentCounts,
          [view]: Math.max(0, currentCounts[view] - amount),
        };
      },
      { revalidate: false }
    );
  };

  /**
   * Increment a specific view count
   */
  const incrementCount = async (view: keyof ViewCounts, amount: number = 1) => {
    await mutate(
      (currentCounts) => {
        if (!currentCounts) return currentCounts;
        return {
          ...currentCounts,
          [view]: currentCounts[view] + amount,
        };
      },
      { revalidate: false }
    );
  };

  /**
   * Force refresh counts from server
   */
  const refreshCounts = async () => {
    await mutate();
  };

  return {
    counts,
    isCountsReady,
    isLoading: loading,
    isValidating,
    error,
    mutate,
    updateCountsOptimistically,
    decrementCount,
    incrementCount,
    refreshCounts,
  };
}
