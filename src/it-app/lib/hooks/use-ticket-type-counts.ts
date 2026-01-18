'use client';

import useSWR from 'swr';
import { useCallback } from 'react';
import { cacheKeys } from '@/lib/swr/cache-keys';
import type { TicketTypeCounts } from '@/types/requests-list';

/**
 * Hook to fetch global ticket type counts (not filtered by view) using SWR
 * SWR provides:
 * - Automatic caching and deduplication
 * - Background revalidation every 10 seconds
 * - Optimistic UI updates via mutate()
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
  const { data, error, isLoading, isValidating, mutate } = useSWR<TicketTypeCounts>(
    cacheKeys.ticketTypeCounts,
    fetchCounts,
    {
      revalidateOnFocus: false,
      refreshInterval: 10000, // 10 seconds
      dedupingInterval: 5000, // Deduplicate requests within 5 seconds
    }
  );

  const counts = data;

  const refresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return {
    counts,
    isLoading,
    isValidating,
    error,
    refresh,
  };
}
