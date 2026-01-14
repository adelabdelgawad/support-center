'use client';

/**
 * Custom View Hook
 * SIMPLIFIED: No localStorage caching - uses simple state with backend response
 *
 * Fetches user's custom view settings.
 *
 * Strategy:
 * - On mount: use default settings
 * - Background: fetch fresh data from API
 * - On success: update state
 */

import { useEffect, useState, useCallback } from 'react';
import { fetchCustomView } from '@/lib/api/custom-views';
import type { UserCustomView, AvailableTabId } from '@/types/custom-views';
import type { ViewType } from '@/types/requests-list';

// Default view settings (used until data is fetched)
const DEFAULT_VIEW_SETTINGS = {
  visibleTabs: ['all', 'assigned', 'unassigned', 'overdue'] as ViewType[],
  defaultTab: 'all' as ViewType,
};

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
  const [data, setData] = useState<UserCustomView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);

  // Fetch fresh data on mount
  useEffect(() => {
    const doFetch = async () => {
      setIsValidating(true);
      try {
        const result = await fetchCustomView();
        setData(result);
        setError(undefined);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch custom view'));
      } finally {
        setIsLoading(false);
        setIsValidating(false);
      }
    };

    doFetch();
  }, []);

  const refresh = useCallback(async () => {
    setIsValidating(true);
    try {
      const result = await fetchCustomView();
      setData(result);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch custom view'));
    } finally {
      setIsValidating(false);
    }
  }, []);

  // Derive values from data or defaults
  const visibleTabs = (data?.visibleTabs as ViewType[]) ?? DEFAULT_VIEW_SETTINGS.visibleTabs;
  const defaultTab = (data?.defaultTab as ViewType) ?? DEFAULT_VIEW_SETTINGS.defaultTab;

  return {
    visibleTabs,
    defaultTab,
    isLoading: isLoading && !data,
    isValidating,
    error,
    refresh,
  };
}
