'use client';

/**
 * Custom View Hook
 *
 * Fetches user's custom view settings using SWR with localStorage caching.
 * Enables instant rendering with cached data while revalidating in background.
 *
 * Strategy:
 * - On mount: use default data (hydration safe)
 * - After hydration: read from localStorage cache
 * - Background: fetch fresh data from API
 * - On success: update localStorage cache
 *
 * HYDRATION SAFETY:
 * - Server and client initial render use DEFAULT_VIEW_SETTINGS
 * - After hydration, reads from localStorage cache
 * - This prevents hydration mismatch errors
 */

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { fetchCustomView } from '@/lib/api/custom-views';
import { cacheKeys } from '@/lib/swr/cache-keys';
import {
  getCachedCustomView,
  setCachedCustomView,
  DEFAULT_VIEW_SETTINGS,
} from '@/lib/cache/custom-views-cache';
import type { UserCustomView, AvailableTabId } from '@/types/custom-views';
import type { ViewType } from '@/types/requests-list';

interface UseCustomViewResult {
  visibleTabs: ViewType[];
  defaultTab: ViewType;
  isLoading: boolean;
  isValidating: boolean;
  error: Error | undefined;
  refresh: () => Promise<void>;
}

/**
 * Hook to fetch and manage custom view settings
 *
 * @returns Custom view data and helpers
 */
export function useCustomView(): UseCustomViewResult {
  // Track hydration state to avoid reading localStorage during SSR
  const [isHydrated, setIsHydrated] = useState(false);
  const [cachedData, setCachedData] = useState(DEFAULT_VIEW_SETTINGS);

  // After hydration, read from localStorage cache
  useEffect(() => {
    setIsHydrated(true);
    const cached = getCachedCustomView();
    setCachedData(cached);
  }, []);

  // Build fallback data - use cache after hydration, default during SSR
  const fallbackViewData = isHydrated ? cachedData : DEFAULT_VIEW_SETTINGS;

  const { data, error, isLoading, isValidating, mutate } = useSWR<UserCustomView>(
    cacheKeys.customView,
    fetchCustomView,
    {
      // Use hydration-safe fallback data
      // Note: Static timestamp to avoid hydration mismatch
      fallbackData: {
        id: 0,
        userId: '',
        visibleTabs: fallbackViewData.visibleTabs as AvailableTabId[],
        defaultTab: fallbackViewData.defaultTab as AvailableTabId,
        isActive: true,
        createdAt: '1970-01-01T00:00:00.000Z',
        updatedAt: '1970-01-01T00:00:00.000Z',
      },
      revalidateOnMount: true, // Always fetch fresh data on mount
      revalidateOnFocus: false, // Don't refetch on focus
      revalidateOnReconnect: true, // Refetch on reconnect
      dedupingInterval: 5000, // Dedupe requests within 5 seconds
    }
  );

  // Update localStorage cache when data changes
  useEffect(() => {
    if (data && data.visibleTabs && data.defaultTab) {
      setCachedCustomView(data.visibleTabs as ViewType[], data.defaultTab as ViewType);
      setCachedData({
        visibleTabs: data.visibleTabs as ViewType[],
        defaultTab: data.defaultTab as ViewType,
      });
    }
  }, [data]);

  // Derive values from data or cache
  const visibleTabs = (data?.visibleTabs as ViewType[]) ?? cachedData.visibleTabs;
  const defaultTab = (data?.defaultTab as ViewType) ?? cachedData.defaultTab;

  const refresh = async () => {
    await mutate();
  };

  return {
    visibleTabs,
    defaultTab,
    isLoading: isLoading && !data,
    isValidating,
    error,
    refresh,
  };
}
