'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiClient } from '@/lib/fetch/client';
import type { Priority, RequestStatus } from '@/types/metadata';
import type { Technician } from '@/types/metadata';

/**
 * Hook to fetch and cache priorities globally
 *
 * SIMPLIFIED: No localStorage - uses simple state with backend response
 *
 * @param initialData - Initial priorities data from server (for SSR)
 * @returns Priorities data and loading state
 */
export function useGlobalPriorities(initialData?: Priority[]) {
  const [priorities, setPriorities] = useState<Priority[]>(initialData || []);
  const [isLoading, setIsLoading] = useState(!initialData?.length);
  const [error, setError] = useState<Error | undefined>(undefined);

  // Fetch fresh data on mount (only if no initialData)
  useEffect(() => {
    // Skip fetch if we have fresh SSR data
    if (initialData?.length) {
      return;
    }

    const fetchPriorities = async () => {
      try {
        const data = await apiClient.get<Priority[]>('/api/priorities');
        setPriorities(data);
        setError(undefined);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch priorities'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchPriorities();
  }, [initialData]);

  const mutate = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.get<Priority[]>('/api/priorities');
      setPriorities(data);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch priorities'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    priorities,
    isLoading,
    error,
    mutate,
  };
}

/**
 * Hook to fetch and cache request statuses globally
 *
 * SIMPLIFIED: No localStorage - uses simple state with backend response
 *
 * @param initialData - Initial statuses data from server (for SSR)
 * @returns Statuses data and loading state
 */
export function useGlobalStatuses(initialData?: RequestStatus[]) {
  const [statuses, setStatuses] = useState<RequestStatus[]>(initialData || []);
  const [isLoading, setIsLoading] = useState(!initialData?.length);
  const [error, setError] = useState<Error | undefined>(undefined);

  useEffect(() => {
    if (initialData?.length) {
      return;
    }

    const fetchStatuses = async () => {
      try {
        const data = await apiClient.get<RequestStatus[]>('/api/metadata/statuses');
        setStatuses(data);
        setError(undefined);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch statuses'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchStatuses();
  }, [initialData]);

  const mutate = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.get<RequestStatus[]>('/api/metadata/statuses');
      setStatuses(data);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch statuses'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    statuses,
    isLoading,
    error,
    mutate,
  };
}

/**
 * Hook to fetch and cache technicians globally
 *
 * SIMPLIFIED: No localStorage - uses simple state with backend response
 *
 * @param initialData - Initial technicians data from server (for SSR)
 * @returns Technicians data with helper functions
 */
export function useGlobalTechnicians(initialData?: Technician[]) {
  const [technicians, setTechnicians] = useState<Technician[]>(initialData || []);
  const [isLoading, setIsLoading] = useState(!initialData?.length);
  const [error, setError] = useState<Error | undefined>(undefined);

  useEffect(() => {
    if (initialData?.length) {
      return;
    }

    const fetchTechnicians = async () => {
      try {
        const data = await apiClient.get<Technician[]>('/api/technicians');
        setTechnicians(data);
        setError(undefined);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch technicians'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchTechnicians();
  }, [initialData]);

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
   * Force refresh the technicians data
   */
  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiClient.get<Technician[]>('/api/technicians');
      setTechnicians(data);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch technicians'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const mutate = refresh;

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
