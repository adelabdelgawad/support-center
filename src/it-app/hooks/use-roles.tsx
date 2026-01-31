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
    [enabled],
    undefined
  );

  return {
    roles: enabled ? data : undefined,
    isLoading,
    error,
    mutate,
  };
}
