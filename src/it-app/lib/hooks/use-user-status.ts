import { useState, useEffect, useCallback, useRef } from 'react';
import { getUserStatus, type UserSessionStatus } from '@/lib/api/user-status';

/**
 * Hook for fetching user session status with polling
 * Keeps 30-second polling for online status updates
 *
 * @param userId - The user ID to fetch status for
 * @param enabled - Whether to enable the request (default: true)
 * @returns User status data with loading and error states
 */
export function useUserStatus(userId: string | null, enabled: boolean = true) {
  const [data, setData] = useState<UserSessionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // Fetch function
  const fetchStatus = useCallback(async () => {
    if (!enabled || !userId) {
      return;
    }

    try {
      setIsLoading(true);
      const status = await getUserStatus(userId);
      if (isMountedRef.current) {
        setData(status);
        setError(null);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err as Error);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [enabled, userId]);

  // Manual mutate function for compatibility
  const mutate = useCallback(() => {
    return fetchStatus();
  }, [fetchStatus]);

  // Set up polling on mount
  useEffect(() => {
    isMountedRef.current = true;

    // Initial fetch
    fetchStatus();

    // Set up 30-second polling interval
    if (enabled && userId) {
      intervalRef.current = setInterval(() => {
        fetchStatus();
      }, 30000); // 30 seconds
    }

    // Cleanup on unmount
    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, userId, fetchStatus]);

  return {
    status: data?.isOnline ? 'online' : 'offline',
    userStatus: data,
    isLoading,
    error,
    mutate,
  };
}
