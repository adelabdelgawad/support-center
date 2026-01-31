'use client';

import { useAsyncData } from '@/lib/hooks/use-async-data';
import { useCallback, useMemo } from 'react';
import type { Priority, RequestStatus } from '@/types/metadata';
import type { Technician } from '@/types/metadata';

/**
 * Fetcher for API calls
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
 * Hook to fetch and cache priorities using useAsyncData
 *
 * @param initialData - Initial priorities data from server (for SSR)
 * @returns Priorities data and loading state
 */
export function useGlobalPriorities(initialData?: Priority[]) {
  const fetchPriorities = useCallback(async () => {
    return await fetcher('/api/priorities');
  }, []);

  const { data, error, isLoading, mutate } = useAsyncData<Priority[]>(
    fetchPriorities,
    [],
    initialData
  );

  return {
    priorities: data ?? [],
    isLoading,
    error,
    mutate,
  };
}

/**
 * Hook to fetch and cache request statuses using useAsyncData
 *
 * @param initialData - Initial statuses data from server (for SSR)
 * @returns Statuses data and loading state
 */
export function useGlobalStatuses(initialData?: RequestStatus[]) {
  const fetchStatuses = useCallback(async () => {
    return await fetcher('/api/metadata/statuses');
  }, []);

  const { data, error, isLoading, mutate } = useAsyncData<RequestStatus[]>(
    fetchStatuses,
    [],
    initialData
  );

  return {
    statuses: data ?? [],
    isLoading,
    error,
    mutate,
  };
}

/**
 * Hook to fetch and cache technicians using useAsyncData
 *
 * @param initialData - Initial technicians data from server (for SSR)
 * @returns Technicians data with helper functions
 */
export function useGlobalTechnicians(initialData?: Technician[]) {
  const fetchTechnicians = useCallback(async () => {
    return await fetcher('/api/technicians');
  }, []);

  const { data, error, isLoading, mutate } = useAsyncData<Technician[]>(
    fetchTechnicians,
    [],
    initialData
  );

  const technicians = useMemo(() => data ?? [], [data]);

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
 * Note: Since useAsyncData doesn't have global cache, this is now a no-op
 * Individual hooks manage their own state and can be refreshed via their mutate/refetch
 */
export function useRefreshGlobalMetadata() {
  const refresh = useCallback(async () => {
    // No-op: useAsyncData hooks use initialData from SSR
    // If you need to refresh specific metadata, use the mutate function from each hook
  }, []);

  return { refresh };
}

/**
 * Types for the return values
 */
export type UseGlobalPrioritiesReturn = ReturnType<typeof useGlobalPriorities>;
export type UseGlobalStatusesReturn = ReturnType<typeof useGlobalStatuses>;
export type UseGlobalTechniciansReturn = ReturnType<typeof useGlobalTechnicians>;
