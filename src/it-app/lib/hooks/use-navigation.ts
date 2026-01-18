'use client';

/**
 * Navigation Hook
 * HYDRATION FIX: Adopts network_manager's server-first pattern
 * - Server provides initial data via props
 * - No immediate fetch on mount when server data is available
 * - Clear hydration boundary with isHydrated flag
 *
 * Fetches navigation pages with background revalidation.
 *
 * Features:
 * - Uses server-provided data for instant render
 * - Fetches fresh data from API only when needed
 * - Handles auth errors gracefully
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import type { Page } from '@/types/pages';
import { fetchUserPages } from '@/lib/api/navigation';

interface UseNavigationOptions {
  /**
   * Initial pages from server (for hydration)
   */
  initialPages?: Page[];
  /**
   * Server pathname (for hydration-safe active state)
   */
  serverPathname?: string;
}

interface UseNavigationResult {
  /**
   * Navigation pages (from server or fresh)
   */
  pages: Page[];

  /**
   * True during initial load with no server data
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

  /**
   * Whether the component has hydrated
   */
  isHydrated: boolean;
}

/**
 * Hook to fetch and cache user navigation pages
 *
 * HYDRATION FIX: When server provides initialPages, we use that data
 * immediately and don't fetch on mount. This prevents hydration mismatches.
 *
 * @param userId - User ID to fetch pages for (null to disable)
 * @param options - Optional configuration
 */
export function useNavigation(
  userId: string | null,
  options: UseNavigationOptions = {}
): UseNavigationResult {
  const { initialPages, serverPathname } = options;

  const [pages, setPages] = useState<Page[]>(initialPages ?? []);
  const [isLoading, setIsLoading] = useState(!initialPages?.length);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  // Track if component is mounted and if we've initialized with server data
  const isMountedRef = useRef(true);
  const initializedWithServerDataRef = useRef(!!initialPages?.length);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // HYDRATION FIX: Only fetch if:
  // 1. We have a userId
  // 2. We haven't initialized with server data
  useEffect(() => {
    if (!userId) return;

    // Don't fetch if we already have server data
    if (initializedWithServerDataRef.current) {
      setIsHydrated(true);
      setIsLoading(false);
      return;
    }

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

  // Mark as hydrated after first render
  useEffect(() => {
    if (!isHydrated) {
      setIsHydrated(true);
    }
  }, [isHydrated]);

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
    isHydrated,
  };
}
