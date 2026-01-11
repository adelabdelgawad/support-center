'use client';

import useSWR from 'swr';
import { apiClient } from '@/lib/fetch/client';
import { cacheKeys } from '@/lib/swr/cache-keys';
import type { Technician } from '@/types/metadata';

/**
 * Fetcher function for SWR using apiClient
 */
async function fetcher<T>(url: string): Promise<T> {
  return apiClient.get<T>(url);
}

/**
 * SWR configuration for technicians - shared across the app
 * Uses longer cache time since technicians don't change frequently
 */
const SWR_CONFIG = {
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  dedupingInterval: 60000, // 1 minute deduping
  revalidateIfStale: false,
};

/**
 * Hook to fetch and cache technicians data using SWR
 *
 * This hook provides:
 * - Shared cache across all components using technicians
 * - Helper to get technician by ID from cache
 * - No redundant fetches (SWR deduplication)
 *
 * @param initialData - Initial technicians data from server (for SSR)
 * @param enabled - Whether to fetch data (default: true)
 * @returns SWR response with technicians data and helpers
 */
export function useTechnicians(initialData?: Technician[], enabled: boolean = true) {
  const { data, error, isLoading, mutate } = useSWR<Technician[]>(
    enabled ? cacheKeys.technicians : null,
    fetcher,
    {
      ...SWR_CONFIG,
      fallbackData: initialData,
    }
  );

  const technicians = data ?? initialData ?? [];

  /**
   * Get a technician by their user ID
   * Uses cached data to avoid extra network requests
   *
   * @param userId - The user ID (UUID string) to look up
   * @returns The technician if found, undefined otherwise
   */
  const getTechnicianById = (userId: string): Technician | undefined => {
    return technicians.find((t) => String(t.id) === String(userId));
  };

  /**
   * Get multiple technicians by their IDs
   *
   * @param userIds - Array of user IDs (UUID strings) to look up
   * @returns Array of found technicians
   */
  const getTechniciansByIds = (userIds: string[]): Technician[] => {
    return technicians.filter((t) => userIds.includes(String(t.id)));
  };

  /**
   * Check if a user ID belongs to a technician
   *
   * @param userId - The user ID (UUID string) to check
   * @returns True if the user is a technician
   */
  const isTechnician = (userId: string): boolean => {
    return technicians.some((t) => String(t.id) === String(userId));
  };

  /**
   * Search technicians by name or username
   *
   * @param query - Search query (case-insensitive)
   * @returns Array of matching technicians
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
