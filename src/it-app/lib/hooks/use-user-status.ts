import useSWR from 'swr';
import { getUserStatus } from '@/lib/api/user-status';

/**
 * SWR hook for fetching user session status
 * Provides automatic request deduplication and polling
 *
 * @param userId - The user ID to fetch status for
 * @param enabled - Whether to enable the request (default: true)
 * @returns User status data with loading and error states
 */
export function useUserStatus(userId: string | null, enabled: boolean = true) {
  const { data, error, isLoading, mutate } = useSWR(
    enabled && userId ? ['user-status', userId] : null,
    () => getUserStatus(userId!),
    {
      dedupingInterval: 30000, // Dedupe requests within 30s
      revalidateOnFocus: false, // Don't refetch when window regains focus
      refreshInterval: 30000, // Auto-refresh every 30s
      revalidateOnMount: true, // Fetch on mount
      shouldRetryOnError: false, // Don't retry on error (user might be offline)
    }
  );

  return {
    status: data?.isOnline ? 'online' : 'offline',
    userStatus: data,
    isLoading,
    error,
    mutate,
  };
}
