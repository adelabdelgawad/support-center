'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { apiClient } from '@/lib/fetch/client';
import type { Technician } from '@/types/metadata';

/**
 * Hook to fetch and cache technicians data
 * SIMPLIFIED: No SWR - uses simple state with initial data support
 *
 * This hook provides:
 * - Shared cache across all components using technicians
 * - Helper to get technician by ID from cache
 * - No redundant fetches (deduplication via initialData)
 *
 * @param initialData - Initial technicians data from server (for SSR)
 * @param enabled - Whether to fetch data (default: true)
 * @returns Technicians data and helpers
 */
export function useTechnicians(initialData?: Technician[], enabled: boolean = true) {
  const [technicians, setTechnicians] = useState<Technician[]>(initialData ?? []);
  const [isLoading, setIsLoading] = useState(!initialData && enabled);
  const [error, setError] = useState<Error | undefined>(undefined);

  // Track if we've fetched already
  const hasFetchedRef = useRef(!!initialData);

  // Fetch only if enabled and no initial data
  useEffect(() => {
    if (!enabled || hasFetchedRef.current) return;

    const doFetch = async () => {
      setIsLoading(true);
      try {
        const data = await apiClient.get<Technician[]>('/api/technicians');
        setTechnicians(data);
        setError(undefined);
        hasFetchedRef.current = true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch technicians'));
      } finally {
        setIsLoading(false);
      }
    };

    doFetch();
  }, [enabled]);

  /**
   * Get a technician by their user ID
   * Uses cached data to avoid extra network requests
   *
   * @param userId - The user ID (UUID string) to look up
   * @returns The technician if found, undefined otherwise
   */
  const getTechnicianById = useCallback((userId: string): Technician | undefined => {
    return technicians.find((t) => String(t.id) === String(userId));
  }, [technicians]);

  /**
   * Get multiple technicians by their IDs
   *
   * @param userIds - Array of user IDs (UUID strings) to look up
   * @returns Array of found technicians
   */
  const getTechniciansByIds = useCallback((userIds: string[]): Technician[] => {
    return technicians.filter((t) => userIds.includes(String(t.id)));
  }, [technicians]);

  /**
   * Check if a user ID belongs to a technician
   *
   * @param userId - The user ID (UUID string) to check
   * @returns True if the user is a technician
   */
  const isTechnician = useCallback((userId: string): boolean => {
    return technicians.some((t) => String(t.id) === String(userId));
  }, [technicians]);

  /**
   * Search technicians by name or username
   *
   * @param query - Search query (case-insensitive)
   * @returns Array of matching technicians
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
   * Force refresh the technicians cache
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

  // For compatibility with SWR-like API
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
 * Type for the return value of useTechnicians hook
 */
export type UseTechniciansReturn = ReturnType<typeof useTechnicians>;
