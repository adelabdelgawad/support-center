'use client';

import useSWR, { mutate as globalMutate } from 'swr';
import { useCallback, useMemo } from 'react';
import { cacheKeys } from '@/lib/swr/cache-keys';
import type { Priority, RequestStatus } from '@/types/metadata';
import type { Technician } from '@/types/metadata';

/**
 * SWR fetcher for API calls
 */
const fetcher = async (url: string): Promise<any> => {
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }

  return response.json();
};

/**
 * Hook to fetch and cache priorities globally using SWR
 *
 * SWR provides:
 * - Automatic caching and deduplication
 * - Background revalidation
 * - Optimistic UI updates via mutate()
 *
 * @param initialData - Initial priorities data from server (for SSR)
 * @returns Priorities data and loading state
 */
export function useGlobalPriorities(initialData?: Priority[]) {
  const { data, error, isLoading, mutate } = useSWR<Priority[]>(
    cacheKeys.globalPriorities,
    fetcher,
    {
      fallbackData: initialData,
      revalidateOnMount: !initialData?.length,
      revalidateOnFocus: false,
      dedupingInterval: 60000, // Deduplicate requests within 1 minute
    }
  );

  return {
    priorities: data ?? [],
    isLoading,
    error,
    mutate,
  };
}

/**
 * Hook to fetch and cache request statuses globally using SWR
 *
 * SWR provides:
 * - Automatic caching and deduplication
 * - Background revalidation
 * - Optimistic UI updates via mutate()
 *
 * @param initialData - Initial statuses data from server (for SSR)
 * @returns Statuses data and loading state
 */
export function useGlobalStatuses(initialData?: RequestStatus[]) {
  const { data, error, isLoading, mutate } = useSWR<RequestStatus[]>(
    cacheKeys.globalStatuses,
    fetcher,
    {
      fallbackData: initialData,
      revalidateOnMount: !initialData?.length,
      revalidateOnFocus: false,
      dedupingInterval: 60000, // Deduplicate requests within 1 minute
    }
  );

  return {
    statuses: data ?? [],
    isLoading,
    error,
    mutate,
  };
}

/**
 * Hook to fetch and cache technicians globally using SWR
 *
 * SWR provides:
 * - Automatic caching and deduplication
 * - Background revalidation
 * - Helper functions for technician lookups
 *
 * @param initialData - Initial technicians data from server (for SSR)
 * @returns Technicians data with helper functions
 */
export function useGlobalTechnicians(initialData?: Technician[]) {
  const { data, error, isLoading, mutate } = useSWR<Technician[]>(
    cacheKeys.globalTechnicians,
    fetcher,
    {
      fallbackData: initialData,
      revalidateOnMount: !initialData?.length,
      revalidateOnFocus: false,
      dedupingInterval: 60000, // Deduplicate requests within 1 minute
    }
  );

  const technicians = data ?? [];

  /**
   * Get a technician by their user ID (UUID string)
   */
  const getTechnicianById = useCallback((userId: string): Technician | undefined => {
    return technicians.find((t) => String(t.id) === String(userId));
  }, [technicians]);

  /**
   * Get multiple technicians by their IDs (UUID strings)
   */
  const getTechniciansByIds = useCallback((userIds: string[]): Technician[] => {
    return technicians.filter((t) => userIds.includes(String(t.id)));
  }, [technicians]);

  /**
   * Check if a user ID belongs to a technician (UUID string)
   */
  const isTechnician = useCallback((userId: string): boolean => {
    return technicians.some((t) => String(t.id) === String(userId));
  }, [technicians]);

  /**
   * Search technicians by name or username
   */
  const searchTechnicians = useCallback((query: string): Technician[] => {
    const lowerQuery = query.toLowerCase();
    return technicians.filter(
      (t) =>
        t.username.toLowerCase().includes(lowerQuery) ||
        t.fullName?.toLowerCase().includes(lowerQuery)
    );
  }, [technicians]);

  /**
   * Force refresh the technicians data (alias for mutate)
   */
  const refresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return {
    technicians,
    isLoading,
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
  const refresh = useCallback(async () => {
    // Use SWR's global mutate to refresh all metadata keys at once
    await Promise.all([
      globalMutate(cacheKeys.globalPriorities),
      globalMutate(cacheKeys.globalStatuses),
      globalMutate(cacheKeys.globalTechnicians),
      globalMutate(cacheKeys.globalCategories),
    ]);
  }, []);

  return { refresh };
}

/**
 * Types for the return values
 */
export type UseGlobalPrioritiesReturn = ReturnType<typeof useGlobalPriorities>;
export type UseGlobalStatusesReturn = ReturnType<typeof useGlobalStatuses>;
export type UseGlobalTechniciansReturn = ReturnType<typeof useGlobalTechnicians>;
