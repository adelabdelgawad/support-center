'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { ViewCounts } from '@/types/requests-list';

/**
 * Dedicated hook for view counts in the sidebar
 * SIMPLIFIED: No SWR - uses simple state with auto-refresh interval
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
  // Simple state for counts
  const [counts, setCounts] = useState<ViewCounts | undefined>(initialCounts);
  const [isLoading, setIsLoading] = useState(!initialCounts);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);

  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    // Skip initial fetch if we have initial data
    if (initialCounts) {
      setIsLoading(false);
    }

    const doFetch = async () => {
      if (!isMountedRef.current) return;

      setIsValidating(true);
      try {
        const data = await fetchViewCounts();
        if (isMountedRef.current) {
          setCounts(data);
          setError(undefined);
        }
      } catch (err) {
        if (isMountedRef.current) {
          setError(err instanceof Error ? err : new Error('Failed to fetch view counts'));
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
          setIsValidating(false);
        }
      }
    };

    // Only fetch on mount if no initial data
    if (!initialCounts) {
      doFetch();
    }

    // Set up interval for auto-refresh
    const intervalId = setInterval(doFetch, 30000);

    return () => {
      clearInterval(intervalId);
    };
  }, [initialCounts]);

  // Explicit flag for whether counts are ready (not undefined)
  const isCountsReady = counts !== undefined;

  /**
   * Optimistically update counts when a ticket changes
   * @param updates - Partial updates to apply to counts
   */
  const updateCountsOptimistically = useCallback(async (updates: Partial<ViewCounts>) => {
    setCounts((currentCounts) => {
      if (!currentCounts) return currentCounts;
      return { ...currentCounts, ...updates };
    });
  }, []);

  /**
   * Decrement a specific view count (e.g., when a ticket moves to another view)
   */
  const decrementCount = useCallback(async (view: keyof ViewCounts, amount: number = 1) => {
    setCounts((currentCounts) => {
      if (!currentCounts) return currentCounts;
      return {
        ...currentCounts,
        [view]: Math.max(0, currentCounts[view] - amount),
      };
    });
  }, []);

  /**
   * Increment a specific view count
   */
  const incrementCount = useCallback(async (view: keyof ViewCounts, amount: number = 1) => {
    setCounts((currentCounts) => {
      if (!currentCounts) return currentCounts;
      return {
        ...currentCounts,
        [view]: currentCounts[view] + amount,
      };
    });
  }, []);

  /**
   * Force refresh counts from server
   */
  const refreshCounts = useCallback(async () => {
    setIsValidating(true);
    try {
      const data = await fetchViewCounts();
      setCounts(data);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch view counts'));
    } finally {
      setIsValidating(false);
    }
  }, []);

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
