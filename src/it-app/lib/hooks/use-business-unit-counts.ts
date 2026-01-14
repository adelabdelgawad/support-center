'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { getBusinessUnitCounts } from '@/lib/api/requests-list';
import type { BusinessUnitCountsResponse } from '@/lib/actions/requests-list-actions';

/**
 * Hook to fetch all available business units
 * SIMPLIFIED: No SWR - uses simple state with auto-refresh interval
 *
 * This is used to show all business units in the cards, even if they have 0 tickets in the current view
 * Auto-revalidates every 30 seconds to keep counts synchronized with tickets table and sidebar
 *
 * @param view - Current view filter (e.g., 'all_unsolved', 'unassigned') to filter counts
 * @param initialData - Initial data from server (for SSR)
 * @returns Business units data and helpers
 */
export function useAllBusinessUnits(view: string, initialData?: BusinessUnitCountsResponse) {
  // Simple state for business units
  const [data, setData] = useState<BusinessUnitCountsResponse | undefined>(initialData);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);

  // Track current view to detect changes
  const currentViewRef = useRef(view);

  // Track if component is mounted
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Fetch data when view changes or on mount
  useEffect(() => {
    const doFetch = async () => {
      if (!isMountedRef.current) return;

      // Show loading only if this is a view change
      if (currentViewRef.current !== view) {
        currentViewRef.current = view;
        setIsValidating(true);
      }

      try {
        const result = await getBusinessUnitCounts(view);
        if (isMountedRef.current) {
          setData(result);
          setError(undefined);
        }
      } catch (err) {
        if (isMountedRef.current) {
          setError(err instanceof Error ? err : new Error('Failed to fetch business unit counts'));
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
          setIsValidating(false);
        }
      }
    };

    // Only fetch on mount if no initial data OR if view changed
    if (!initialData || currentViewRef.current !== view) {
      doFetch();
    }

    // Set up interval for auto-refresh
    const intervalId = setInterval(doFetch, 30000);

    return () => {
      clearInterval(intervalId);
    };
  }, [view, initialData]);

  /**
   * Force refresh from server
   */
  const refresh = useCallback(async () => {
    setIsValidating(true);
    try {
      const result = await getBusinessUnitCounts(view);
      setData(result);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch business unit counts'));
    } finally {
      setIsValidating(false);
    }
  }, [view]);

  return {
    allBusinessUnits: data?.businessUnits ?? [],
    // Use undefined to represent "unknown" state - never default to 0
    // This allows UI to distinguish between "loading" and "actually zero"
    unassignedCount: data?.unassignedCount,
    isLoading,
    isValidating,
    error,
    refresh,
  };
}
