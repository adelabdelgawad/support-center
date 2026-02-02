'use client';

/**
 * Request Details Page Hook
 * SIMPLIFIED: No SWR - uses simple state
 *
 * Fetches full request details page data.
 * Enables instant rendering with loading state + background data fetching.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchRequestDetailsPageData,
  type RequestDetailsPageData,
} from '@/lib/api/request-details-page';

interface UseRequestDetailsPageOptions {
  currentUserId?: string;
  currentUserIsTechnician?: boolean;
}

interface UseRequestDetailsPageResult {
  data: RequestDetailsPageData | null;
  isLoading: boolean;
  isValidating: boolean;
  hasFetched: boolean;
  error: Error | undefined;
  refresh: () => Promise<void>;
}

/**
 * Hook to fetch request details page data
 */
export function useRequestDetailsPage(
  requestId: string | null,
  options: UseRequestDetailsPageOptions = {}
): UseRequestDetailsPageResult {
  const { currentUserId, currentUserIsTechnician = false } = options;

  const [data, setData] = useState<RequestDetailsPageData | null>(null);
  const [isLoading, setIsLoading] = useState(!!requestId);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [hasFetched, setHasFetched] = useState(false);

  // Track if component is mounted
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Fetch data when requestId changes
  useEffect(() => {
    if (!requestId) {
      setData(null);
      setIsLoading(false);
      return;
    }

    const doFetch = async () => {
      if (!isMountedRef.current) return;

      setIsLoading(true);
      setIsValidating(true);
      try {
        const result = await fetchRequestDetailsPageData(requestId, currentUserId, currentUserIsTechnician);
        if (isMountedRef.current) {
          setData(result);
          setError(undefined);
        }
      } catch (err) {
        if (isMountedRef.current) {
          setError(err instanceof Error ? err : new Error('Failed to fetch request details'));
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
          setIsValidating(false);
          setHasFetched(true);
        }
      }
    };

    doFetch();
  }, [requestId, currentUserId, currentUserIsTechnician]);

  const refresh = useCallback(async () => {
    if (!requestId) return;

    setIsValidating(true);
    try {
      const result = await fetchRequestDetailsPageData(requestId, currentUserId, currentUserIsTechnician);
      setData(result);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch request details'));
    } finally {
      setIsValidating(false);
    }
  }, [requestId, currentUserId, currentUserIsTechnician]);

  return {
    data,
    isLoading,
    isValidating,
    hasFetched,
    error,
    refresh,
  };
}
