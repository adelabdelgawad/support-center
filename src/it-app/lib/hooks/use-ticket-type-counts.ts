import useSWR from 'swr';
import type { TicketTypeCounts } from '@/types/requests-list';

const fetcher = async (url: string): Promise<TicketTypeCounts> => {
  const response = await fetch(url, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch ticket type counts');
  }

  return response.json();
};

/**
 * Hook to fetch global ticket type counts (not filtered by view)
 * Auto-refreshes every 10 seconds
 */
export function useTicketTypeCounts() {
  const { data, error, isLoading, isValidating, mutate } = useSWR<TicketTypeCounts>(
    '/api/requests/ticket-type-counts',
    fetcher,
    {
      refreshInterval: 10000, // Auto-refresh every 10 seconds
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
    }
  );

  return {
    counts: data,
    isLoading,
    isValidating,
    error,
    refresh: mutate,
  };
}
