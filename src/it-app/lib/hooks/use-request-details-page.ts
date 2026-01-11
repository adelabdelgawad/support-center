'use client';

/**
 * Request Details Page Hook
 *
 * Fetches full request details page data using SWR.
 * Enables instant rendering with loading state + background data fetching.
 */

import useSWR from 'swr';
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

  const { data, error, isLoading, isValidating, mutate } = useSWR<RequestDetailsPageData | null>(
    requestId ? `/api/requests-details/${requestId}/page-data` : null,
    () => fetchRequestDetailsPageData(requestId!, currentUserId, currentUserIsTechnician),
    {
      revalidateOnMount: true,
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      dedupingInterval: 5000,
      errorRetryCount: 2,
    }
  );

  const refresh = async () => {
    await mutate();
  };

  return {
    data: data ?? null,
    isLoading,
    isValidating,
    error,
    refresh,
  };
}
