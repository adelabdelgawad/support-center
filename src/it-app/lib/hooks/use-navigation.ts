'use client';

/**
 * Navigation Hook
 * SIMPLIFIED: No localStorage caching - uses simple state with backend response
 *
 * Fetches navigation pages with background revalidation.
 *
 * Features:
 * - Fetches fresh data from API
 * - Handles auth errors gracefully
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import type { Page } from '@/types/pages';
import { fetchUserPages } from '@/lib/api/navigation';

interface UseNavigationOptions {
  /**
   * Initial pages from server (if available)
   */
  initialPages?: Page[];
}

interface UseNavigationResult {
  /**
   * Navigation pages (cached or fresh)
   */
  pages: Page[];

  /**
   * True during initial load with no cache
   */
  isLoading: boolean;

  /**
   * True during background revalidation
   */
  isValidating: boolean;

  /**
   * Error from fetch (null if none)
   */
  error: Error | null;

  /**
   * Force refresh navigation
   */
  refresh: () => Promise<void>;
}

/**
 * Hook to fetch and cache user navigation pages
 *
 * @param userId - User ID to fetch pages for (null to disable)
 * @param options - Optional configuration
 */
export function useNavigation(
  userId: string | null,
  options: UseNavigationOptions = {}
): UseNavigationResult {
  const { initialPages } = options;

  const [pages, setPages] = useState<Page[]>(initialPages ?? []);
  const [isLoading, setIsLoading] = useState(!initialPages?.length);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track if component is mounted
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Fetch fresh data
  useEffect(() => {
    if (!userId) return;

    const doFetch = async () => {
      if (!isMountedRef.current) return;

      setIsValidating(true);
      try {
        const freshData = await fetchUserPages(userId);
        if (isMountedRef.current) {
          setPages(freshData);
          setError(null);
        }
      } catch (err) {
        if (isMountedRef.current) {
          console.warn('[useNavigation] Fetch error:', err);
          setError(err instanceof Error ? err : new Error('Failed to fetch navigation'));
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
          setIsValidating(false);
        }
      }
    };

    doFetch();
  }, [userId]);

  // Refresh function
  const refresh = useCallback(async () => {
    if (!userId) return;

    setIsValidating(true);
    try {
      const freshData = await fetchUserPages(userId);
      setPages(freshData);
      setError(null);
    } catch (err) {
      console.warn('[useNavigation] Refresh error:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch navigation'));
    } finally {
      setIsValidating(false);
    }
  }, [userId]);

  return {
    pages,
    isLoading,
    isValidating,
    error,
    refresh,
  };
}
