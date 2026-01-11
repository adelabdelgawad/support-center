"use client";

import useSWR from "swr";
import { getRoles } from "@/lib/api/roles";
import type { RoleResponse } from "@/types/roles";

interface UseRolesParams {
  enabled?: boolean;
}

interface UseRolesReturn {
  roles: RoleResponse[] | undefined;
  isLoading: boolean;
  error: Error | undefined;
  mutate: () => void;
}

/**
 * Hook for fetching roles with caching
 * Fetches all active roles for use in selectors
 */
export function useRoles(params: UseRolesParams = {}): UseRolesReturn {
  const { enabled = true } = params;

  const { data, error, isLoading, mutate } = useSWR(
    enabled ? "roles-all-active" : null,
    async () => {
      const response = await getRoles({
        limit: 1000,
        skip: 0,
        filterCriteria: {
          is_active: "true",
        },
      });
      return response.roles;
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60000, // Cache for 1 minute
    }
  );

  return {
    roles: data,
    isLoading,
    error,
    mutate,
  };
}
