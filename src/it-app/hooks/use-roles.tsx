"use client";

import { useAsyncData } from "@/lib/hooks/use-async-data";
import { getRoles } from "@/lib/api/roles";
import type { RoleResponse } from "@/types/roles";
import { useCallback } from "react";

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
 * Hook for fetching roles using useAsyncData
 * Fetches all active roles for use in selectors
 * Only fetches when enabled is true (prevents unnecessary API calls)
 */
export function useRoles(params: UseRolesParams = {}): UseRolesReturn {
  const { enabled = true } = params;

  const fetchRoles = useCallback(async () => {
    const response = await getRoles({
      limit: 1000,
      skip: 0,
      filterCriteria: {
        is_active: "true",
      },
    });
    return response.roles;
  }, []);

  const { data, error, isLoading, mutate } = useAsyncData<RoleResponse[]>(
    fetchRoles,
    [],
    undefined,
    { enabled } // Pass enabled option to useAsyncData
  );

  return {
    roles: data,
    isLoading,
    error,
    mutate,
  };
}
