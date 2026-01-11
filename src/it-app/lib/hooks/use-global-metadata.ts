'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { apiClient } from '@/lib/fetch/client';
import type { Priority, RequestStatus } from '@/types/metadata';
import type { Technician } from '@/types/metadata';
import {
  getCachedPriorities,
  setCachedPriorities,
  getCachedStatuses,
  setCachedStatuses,
  getCachedTechnicians,
  setCachedTechnicians,
} from '@/lib/cache/metadata-cache';

/**
 * Fetcher function for SWR using apiClient
 */
async function fetcher<T>(url: string): Promise<T> {
  return apiClient.get<T>(url);
}

/**
 * SWR configuration for global metadata
 * Uses longer cache times and disabled revalidation since this data changes infrequently
 *
 * IMPORTANT: revalidateOnMount is enabled to ensure we always have fresh data,
 * but we use localStorage cache for instant rendering during the fetch.
 */
const METADATA_SWR_CONFIG = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  revalidateOnMount: true, // Revalidate to ensure fresh data
  revalidateIfStale: true,
  dedupingInterval: 300000, // 5 minutes - avoid refetching when navigating between tickets
  focusThrottleInterval: 300000, // 5 minutes
};

/**
 * Hook to fetch and cache priorities globally
 * Uses localStorage for instant rendering + SWR for background revalidation
 *
 * HYDRATION SAFETY:
 * - Server and client initial render use initialData or empty array
 * - After hydration, reads from localStorage cache
 * - SWR fetches fresh data in background
 *
 * @param initialData - Initial priorities data from server (for SSR)
 * @returns SWR response with priorities data
 */
export function useGlobalPriorities(initialData?: Priority[]) {
  // Track hydration state
  const [isHydrated, setIsHydrated] = useState(false);
  const [cachedData, setCachedData] = useState<Priority[] | null>(null);

  // After hydration, read from localStorage
  useEffect(() => {
    setIsHydrated(true);
    const cached = getCachedPriorities();
    if (cached) setCachedData(cached);
  }, []);

  // Determine fallback (prefer initialData, then cache, then empty)
  const fallbackData = initialData?.length ? initialData : (isHydrated && cachedData ? cachedData : undefined);

  const { data, error, isLoading, mutate } = useSWR<Priority[]>(
    '/api/priorities',
    fetcher,
    {
      ...METADATA_SWR_CONFIG,
      fallbackData,
      onSuccess: (freshData) => {
        // Update localStorage cache
        if (freshData) {
          setCachedPriorities(freshData);
          setCachedData(freshData);
        }
      },
    }
  );

  return {
    priorities: data ?? cachedData ?? initialData ?? [],
    isLoading: isLoading && !data && !cachedData,
    error,
    mutate,
  };
}

/**
 * Hook to fetch and cache request statuses globally
 * Uses localStorage for instant rendering + SWR for background revalidation
 *
 * @param initialData - Initial statuses data from server (for SSR)
 * @returns SWR response with statuses data
 */
export function useGlobalStatuses(initialData?: RequestStatus[]) {
  // Track hydration state
  const [isHydrated, setIsHydrated] = useState(false);
  const [cachedData, setCachedData] = useState<RequestStatus[] | null>(null);

  // After hydration, read from localStorage
  useEffect(() => {
    setIsHydrated(true);
    const cached = getCachedStatuses();
    if (cached) setCachedData(cached);
  }, []);

  // Determine fallback (prefer initialData, then cache, then empty)
  const fallbackData = initialData?.length ? initialData : (isHydrated && cachedData ? cachedData : undefined);

  const { data, error, isLoading, mutate } = useSWR<RequestStatus[]>(
    '/api/metadata/statuses',
    fetcher,
    {
      ...METADATA_SWR_CONFIG,
      fallbackData,
      onSuccess: (freshData) => {
        // Update localStorage cache
        if (freshData) {
          setCachedStatuses(freshData);
          setCachedData(freshData);
        }
      },
    }
  );

  return {
    statuses: data ?? cachedData ?? initialData ?? [],
    isLoading: isLoading && !data && !cachedData,
    error,
    mutate,
  };
}

/**
 * Hook to fetch and cache technicians globally
 * Uses localStorage for instant rendering + SWR for background revalidation
 *
 * @param initialData - Initial technicians data from server (for SSR)
 * @returns SWR response with technicians data and helper functions
 */
export function useGlobalTechnicians(initialData?: Technician[]) {
  // Track hydration state
  const [isHydrated, setIsHydrated] = useState(false);
  const [cachedData, setCachedData] = useState<Technician[] | null>(null);

  // After hydration, read from localStorage
  useEffect(() => {
    setIsHydrated(true);
    const cached = getCachedTechnicians();
    if (cached) setCachedData(cached);
  }, []);

  // Determine fallback (prefer initialData, then cache, then empty)
  const fallbackData = initialData?.length ? initialData : (isHydrated && cachedData ? cachedData : undefined);

  const { data, error, isLoading, mutate } = useSWR<Technician[]>(
    '/api/technicians',
    fetcher,
    {
      ...METADATA_SWR_CONFIG,
      fallbackData,
      onSuccess: (freshData) => {
        // Update localStorage cache
        if (freshData) {
          setCachedTechnicians(freshData);
          setCachedData(freshData);
        }
      },
    }
  );

  const technicians = data ?? cachedData ?? initialData ?? [];

  /**
   * Get a technician by their user ID (UUID string)
   */
  const getTechnicianById = (userId: string): Technician | undefined => {
    return technicians.find((t) => String(t.id) === String(userId));
  };

  /**
   * Get multiple technicians by their IDs (UUID strings)
   */
  const getTechniciansByIds = (userIds: string[]): Technician[] => {
    return technicians.filter((t) => userIds.includes(String(t.id)));
  };

  /**
   * Check if a user ID belongs to a technician (UUID string)
   */
  const isTechnician = (userId: string): boolean => {
    return technicians.some((t) => String(t.id) === String(userId));
  };

  /**
   * Search technicians by name or username
   */
  const searchTechnicians = (query: string): Technician[] => {
    const lowerQuery = query.toLowerCase();
    return technicians.filter(
      (t) =>
        t.username.toLowerCase().includes(lowerQuery) ||
        t.fullName?.toLowerCase().includes(lowerQuery)
    );
  };

  /**
   * Force refresh the technicians cache
   */
  const refresh = async () => {
    await mutate();
  };

  return {
    technicians,
    isLoading: isLoading && !data && !cachedData,
    error,
    getTechnicianById,
    getTechniciansByIds,
    isTechnician,
    searchTechnicians,
    refresh,
    mutate,
  };
}

/**
 * Hook to refresh all global metadata at once
 * Useful for admin panels or when metadata is updated
 */
export function useRefreshGlobalMetadata() {
  // These would be mutable refs from the hooks above
  const refresh = async (mutateCallbacks?: {
    priorities?: () => Promise<any>;
    statuses?: () => Promise<any>;
    technicians?: () => Promise<any>;
  }) => {
    const promises = [];

    if (mutateCallbacks?.priorities) {
      promises.push(mutateCallbacks.priorities());
    }
    if (mutateCallbacks?.statuses) {
      promises.push(mutateCallbacks.statuses());
    }
    if (mutateCallbacks?.technicians) {
      promises.push(mutateCallbacks.technicians());
    }

    await Promise.all(promises);
  };

  return { refresh };
}

/**
 * Types for the return values
 */
export type UseGlobalPrioritiesReturn = ReturnType<typeof useGlobalPriorities>;
export type UseGlobalStatusesReturn = ReturnType<typeof useGlobalStatuses>;
export type UseGlobalTechniciansReturn = ReturnType<typeof useGlobalTechnicians>;
