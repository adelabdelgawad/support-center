'use client';

import useSWR from 'swr';
import { useCallback } from 'react';
import { cacheKeys } from '@/lib/swr/cache-keys';
import type { ViewCounts } from '@/types/requests-list';
import { mutate } from 'swr';

/**
 * Dedicated hook for view counts in the sidebar using SWR
 * SWR provides:
 * - Automatic caching and deduplication
 * - Background revalidation every 30 seconds
 * - Optimistic UI updates via mutate()
 */

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
  const { data, error, isLoading, isValidating, mutate: swrMutate } = useSWR<ViewCounts>(
    cacheKeys.viewCounts,
    fetchViewCounts,
    {
      fallbackData: initialCounts,
      revalidateOnMount: !initialCounts,
      revalidateOnFocus: false,
      refreshInterval: 30000, // 30 seconds
      dedupingInterval: 10000, // Deduplicate requests within 10 seconds
    }
  );

  const counts = data;

  // Explicit flag for whether counts are ready (not undefined)
  const isCountsReady = counts !== undefined;

  /**
   * Optimistically update counts when a ticket changes
   * @param updates - Partial updates to apply to counts
   */
  const updateCountsOptimistically = useCallback(async (updates: Partial<ViewCounts>) => {
    // Use SWR's mutate with optimistic update
    swrMutate((currentCounts) => {
      if (!currentCounts) return currentCounts;
      return { ...currentCounts, ...updates };
    }, false); // false = don't revalidate immediately
  }, [swrMutate]);

  /**
   * Decrement a specific view count (e.g., when a ticket moves to another view)
   */
  const decrementCount = useCallback(async (view: keyof ViewCounts, amount: number = 1) => {
    swrMutate((currentCounts) => {
      if (!currentCounts) return currentCounts;
      return {
        ...currentCounts,
        [view]: Math.max(0, currentCounts[view] - amount),
      };
    }, false);
  }, [swrMutate]);

  /**
   * Increment a specific view count
   */
  const incrementCount = useCallback(async (view: keyof ViewCounts, amount: number = 1) => {
    swrMutate((currentCounts) => {
      if (!currentCounts) return currentCounts;
      return {
        ...currentCounts,
        [view]: currentCounts[view] + amount,
      };
    }, false);
  }, [swrMutate]);

  /**
   * Force refresh counts from server
   */
  const refreshCounts = useCallback(async () => {
    await swrMutate();
  }, [swrMutate]);

  // For compatibility with SWR-like API
  const mutate = refreshCounts;

  return {
    counts,
    isCountsReady,
    isLoading,
    isValidating,
    error,
    mutate,
    updateCountsOptimistically,
    decrementCount,
    incrementCount,
    refreshCounts,
  };
}
