'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { TicketTypeCounts } from '@/types/requests-list';

/**
 * Hook to fetch global ticket type counts (not filtered by view)
 * SIMPLIFIED: No SWR - uses simple state with auto-refresh interval
 * Auto-refreshes every 10 seconds
 */

const fetchCounts = async (): Promise<TicketTypeCounts> => {
  const response = await fetch('/api/requests/ticket-type-counts', {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch ticket type counts');
  }

  return response.json();
};

export function useTicketTypeCounts() {
  const [counts, setCounts] = useState<TicketTypeCounts | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);

  // Track if component is mounted
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Fetch data on mount and set up auto-refresh
  useEffect(() => {
    const doFetch = async () => {
      if (!isMountedRef.current) return;

      setIsValidating(true);
      try {
        const data = await fetchCounts();
        if (isMountedRef.current) {
          setCounts(data);
          setError(undefined);
        }
      } catch (err) {
        if (isMountedRef.current) {
          setError(err instanceof Error ? err : new Error('Failed to fetch ticket type counts'));
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
          setIsValidating(false);
        }
      }
    };

    doFetch();

    // Auto-refresh every 10 seconds
    const intervalId = setInterval(doFetch, 10000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  const refresh = useCallback(async () => {
    setIsValidating(true);
    try {
      const data = await fetchCounts();
      setCounts(data);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch ticket type counts'));
    } finally {
      setIsValidating(false);
    }
  }, []);

  return {
    counts,
    isLoading,
    isValidating,
    error,
    refresh,
  };
}
