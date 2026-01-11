'use client';

/**
 * Navigation Hook
 *
 * SWR-based hook for fetching and caching user navigation pages.
 * Provides instant rendering with cached data + background revalidation.
 *
 * Features:
 * - Renders immediately with localStorage cache (after hydration)
 * - Fetches fresh data in background
 * - Updates cache on successful fetch
 * - Handles auth errors gracefully
 *
 * HYDRATION SAFETY:
 * - Server and client initial render use empty/initialPages data
 * - After hydration, reads from localStorage cache
 * - This prevents hydration mismatch errors
 */

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import type { Page } from '@/types/pages';
import { fetchUserPages } from '@/lib/api/navigation';
import {
  getCachedNavigation,
  setCachedNavigation,
} from '@/lib/cache/navigation-cache';
import { cacheKeys } from '@/lib/swr/cache-keys';

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

  // Track hydration state to avoid reading localStorage during SSR
  const [isHydrated, setIsHydrated] = useState(false);
  const [cachedPages, setCachedPages] = useState<Page[]>([]);

  // After hydration, read from localStorage cache
  useEffect(() => {
    setIsHydrated(true);
    if (userId) {
      const cached = getCachedNavigation(userId);
      if (cached && cached.length > 0) {
        setCachedPages(cached);
      }
    }
  }, [userId]);

  // Determine fallback data - only use cache after hydration
  // During SSR and initial hydration, use initialPages or empty
  const fallbackData = isHydrated && cachedPages.length > 0
    ? cachedPages
    : (initialPages?.length ? initialPages : undefined);

  // SWR for background fetching with cache-first strategy
  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR<Page[]>(
    userId ? cacheKeys.userPages(userId) : null,
    () => fetchUserPages(userId!),
    {
      fallbackData,
      revalidateOnMount: true, // Always check for fresh data
      revalidateIfStale: true,
      revalidateOnFocus: false, // Don't refetch on tab focus
      revalidateOnReconnect: true,
      dedupingInterval: 5000, // Dedupe requests within 5 seconds
      errorRetryCount: 2,
      errorRetryInterval: 3000,
      onSuccess: (freshData) => {
        // Update localStorage cache with fresh data
        if (userId && freshData) {
          setCachedNavigation(userId, freshData);
          setCachedPages(freshData);
        }
      },
      onError: (err) => {
        console.warn('[useNavigation] Fetch error:', err);
        // On auth error, don't clear cache - let the app handle redirect
      },
    }
  );

  // Compute final pages (prefer SWR data, then cached with data, then initialPages)
  // Note: must check length because empty array is truthy
  const pages = data
    ?? (cachedPages.length > 0 ? cachedPages : null)
    ?? initialPages
    ?? [];

  // Compute loading state - only true if no data at all
  const loading = isLoading && pages.length === 0;

  // Refresh function
  const refresh = async () => {
    await mutate();
  };

  return {
    pages,
    isLoading: loading,
    isValidating,
    error: error ?? null,
    refresh,
  };
}
