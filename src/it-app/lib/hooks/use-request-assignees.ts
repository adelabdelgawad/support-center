"use client";

import { apiClient, getClientErrorMessage as getErrorMessage } from "@/lib/fetch/client";
import { cacheKeys } from "@/lib/swr/cache-keys";
import { useMemo, useCallback } from "react";
import useSWR from "swr";

/**
 * Assignee information from the backend
 */
export interface Assignee {
  id: number;
  userId: string; // UUID string from backend
  username: string;
  fullName: string | null;
  title: string | null;
  assignTypeId?: number; // Optional - may not be present in combined endpoint
  assignedBy: string | null; // UUID string from backend
  assignedByName: string | null;
  createdAt: string;
}

/**
 * Response from the assignees endpoint
 */
export interface AssigneesResponse {
  requestId: string;
  assignees: Assignee[];
  total: number;
}

/**
 * Response from assign/take endpoints
 */
interface AssignActionResponse {
  success: boolean;
  message: string;
  data?: unknown;
}

/**
 * Technician info from shared cache (optional integration)
 */
export interface TechnicianInfo {
  id: string;  // UUID string from backend
  username: string;
  fullName: string | null;
  title: string | null;
}

/**
 * Fetcher function for SWR
 */
async function fetcher<T>(url: string): Promise<T> {
  return apiClient.get<T>(url);
}

/**
 * Options for useRequestAssignees hook
 */
export interface UseRequestAssigneesOptions {
  requestId: string;
  initialData?: Assignee[];
  /** Optional: Provide technicians from shared cache for better optimistic updates */
  technicians?: TechnicianInfo[];
  /** Optional: Function to get technician by ID from shared cache */
  getTechnicianById?: (userId: string) => TechnicianInfo | undefined;
  /** Current user ID for permission checking (UUID string) */
  currentUserId?: string;
  /** Current user roles for supervisor check (kept for backward compatibility, not used in new permission model) */
  currentUserRoles?: any[];
  /** Whether current user is a technician */
  isTechnician?: boolean;
  /** Whether the request status has countAsSolved=true (blocks all modifications) */
  countAsSolved?: boolean;
  onAssigneeAdded?: (assignee: Assignee) => void;
  onAssigneeRemoved?: (technicianId: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Hook to fetch and manage request assignees using SWR
 * Updates cache directly from action responses (no extra network requests)
 *
 * Features:
 * - Optimistic updates with rollback on error
 * - Integration with shared technicians cache
 * - Proper error handling with callbacks
 *
 * @param requestId - The request/ticket ID (for backward compatibility)
 * @param initialData - Initial assignees data from server (for SSR)
 * @param options - Additional options for enhanced functionality
 * @returns SWR response with assignees data and helpers
 */
export function useRequestAssignees(
  requestId: string,
  initialData?: Assignee[],
  options?: Partial<
    Omit<UseRequestAssigneesOptions, "requestId" | "initialData">
  >
) {
  const { onAssigneeAdded, onAssigneeRemoved, onError } = options || {};

  // Check if initial data is empty - if so, we need to fetch on mount
  const hasRealInitialData = initialData && initialData.length > 0;

  const { data, error, isLoading, mutate } = useSWR<AssigneesResponse>(
    requestId ? cacheKeys.requestAssignees(requestId) : null,
    fetcher,
    {
      fallbackData: initialData
        ? {
            requestId,
            assignees: initialData,
            total: initialData.length,
          }
        : undefined,
      // Fetch on mount if no real initial data (e.g., came from empty fallback)
      revalidateOnMount: !hasRealInitialData,
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    }
  );

  /**
   * Add an assignee - simple direct approach
   * Calls API and replaces cache with returned full assignees list
   */
  const addAssignee = async (
    technicianId: string,
    _technicianName: string,
    _technicianTitle?: string
  ): Promise<void> => {
    try {
      // Send request to server - returns full updated assignees list
      const response = await apiClient.post<{
        success: boolean;
        message: string;
        requestId: string;
        assignees: Assignee[];
        total: number;
      }>(`/api/requests-details/${requestId}/assignees`, { technicianId });

      if (response.success) {
        const newCacheData = {
          requestId: response.requestId,
          assignees: response.assignees,
          total: response.total,
        };

        // Replace cache with server data directly
        await mutate(newCacheData, { revalidate: false });

        // Find the added assignee for callback
        const addedAssignee = response.assignees.find(
          (a) => a.userId === technicianId
        );
        if (addedAssignee && onAssigneeAdded) {
          onAssigneeAdded(addedAssignee);
        }
      } else {
        const error = new Error(response.message || "Failed to add assignee");
        if (onError) {
          onError(error);
        }
        throw error;
      }
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error(getErrorMessage(err));

      // Check if it's a 403 Forbidden error
      if ((err as any)?.response?.status === 403) {
        error.message =
          "Only supervisors can assign technicians to this request";
      }

      if (onError) {
        onError(error);
      }
      throw error;
    }
  };

  /**
   * Remove an assignee - simple direct approach
   * Calls API and replaces cache with returned full assignees list
   */
  const removeAssignee = async (technicianId: string): Promise<void> => {
    try {
      // Send request to server - returns full updated assignees list
      const response = await apiClient.delete<{
        success: boolean;
        message: string;
        requestId: string;
        assignees: Assignee[];
        total: number;
      }>(`/api/requests-details/${requestId}/assignees`, { technicianId });

      if (response.success) {
        const newCacheData = {
          requestId: response.requestId,
          assignees: response.assignees,
          total: response.total,
        };

        // Replace cache with server data directly
        await mutate(newCacheData, { revalidate: false });

        // Notify callback
        if (onAssigneeRemoved) {
          onAssigneeRemoved(technicianId);
        }
      } else {
        const error = new Error(response.message || "Failed to remove assignee");
        if (onError) {
          onError(error);
        }
        throw error;
      }
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error(getErrorMessage(err));

      // Check for specific error types
      const status = (err as any)?.response?.status;
      const detail = (err as any)?.response?.data?.detail || "";

      if (status === 400) {
        // Check if it's a "solved request" error
        if (detail.includes("solved request")) {
          error.message = "Cannot modify assignees on a solved request";
        }
        // Check if it's the "must_have_assignee" error
        else if (detail.includes("last assignee") || detail.includes("must_have_assignee")) {
          error.message =
            "Cannot remove the last assignee. Requests must have at least one assigned technician.";
        }
      }

      if (onError) {
        onError(error);
      }
      throw error;
    }
  };

  /**
   * Take (self-assign) the request - updates cache directly with rollback on error
   */
  const takeRequest = async (currentUser: {
    id: string;
    username: string;
    fullName?: string | null;
    title?: string | null;
  }): Promise<void> => {
    // Check if already assigned (compare as strings since IDs can be UUID or number)
    if (data?.assignees.some((a) => String(a.userId) === String(currentUser.id))) {
      throw new Error("You are already assigned to this request");
    }

    // Store previous data for rollback
    const previousData = data;

    // Create assignee for current user
    const newAssignee: Assignee = {
      id: Date.now(),
      userId: currentUser.id,
      username: currentUser.username,
      fullName: currentUser.fullName || currentUser.username,
      title: currentUser.title || null,
      assignTypeId: 1,
      assignedBy: currentUser.id,
      assignedByName: currentUser.fullName || currentUser.username,
      createdAt: new Date().toISOString(),
    };

    // Optimistic update
    await mutate(
      (currentData) => {
        // Handle missing or malformed data
        if (!currentData || !Array.isArray(currentData.assignees)) {
          return {
            requestId,
            assignees: [newAssignee],
            total: 1,
          };
        }
        if (currentData.assignees.some((a) => a.userId === currentUser.id)) {
          return currentData;
        }
        return {
          ...currentData,
          assignees: [...currentData.assignees, newAssignee],
          total: currentData.total + 1,
        };
      },
      { revalidate: false }
    );

    try {
      // Send request to server
      await apiClient.post(`/api/requests-details/${requestId}/take`);

      // Notify callback
      if (onAssigneeAdded) {
        onAssigneeAdded(newAssignee);
      }
    } catch (err) {
      // Rollback on error
      await mutate(previousData, { revalidate: false });

      const error =
        err instanceof Error ? err : new Error(getErrorMessage(err));
      if (onError) {
        onError(error);
      }
      throw error;
    }
  };

  /**
   * Check if a user is already assigned to this request
   */
  const isUserAssigned = useCallback((userId: string): boolean => {
    return data?.assignees.some((a) => a.userId === userId) ?? false;
  }, [data?.assignees]);

  /**
   * Get assignee by user ID
   */
  const getAssigneeByUserId = (userId: string): Assignee | undefined => {
    return data?.assignees.find((a) => a.userId === userId);
  };

  /**
   * Force refresh the assignees from server
   */
  const refresh = async () => {
    await mutate();
  };

  /**
   * Enhanced loading state that considers SSR data
   * SWR's isLoading is true when no data and request is in flight
   * But when fallbackData is provided, isLoading should be false
   */
  const assigneesLoading =
    data === undefined &&
    (initialData === undefined || initialData.length === 0)
      ? isLoading
      : false;

  /**
   * Check if user can add assignees
   *
   * PERMISSION MODEL:
   * - Any technician can modify any request that is NOT solved (countAsSolved=false)
   * - Solved requests → Cannot add
   * - Assignee list is enabled even when no assignees exist
   */
  const canAddAssignees = useMemo(() => {
    const isTechnician = options?.isTechnician || false;
    const countAsSolved = options?.countAsSolved || false;

    // If request is solved, no modifications allowed
    if (countAsSolved) return false;

    // Any technician can add assignees to non-solved requests
    return isTechnician;
  }, [options?.isTechnician, options?.countAsSolved]);

  /**
   * Check if user can remove assignees
   *
   * NEW PERMISSION MODEL (NF-3):
   * - Any technician can modify any request that is NOT solved (countAsSolved=false)
   * - Solved requests → Cannot remove
   * - Note: Backend still enforces "cannot remove last assignee" rule
   */
  const canRemoveAssignees = useMemo(() => {
    const isTechnician = options?.isTechnician || false;
    const countAsSolved = options?.countAsSolved || false;
    const assigneeCount = data?.total || 0;

    // If request is solved, no modifications allowed
    if (countAsSolved) return false;

    // If no assignees, removal is not applicable
    if (assigneeCount === 0) return false;

    // Any technician can remove assignees from non-solved requests
    // Note: Cannot remove last assignee - enforced by backend
    return isTechnician;
  }, [data?.total, options?.isTechnician, options?.countAsSolved]);

  /**
   * Backward compatibility: canEditAssignees now means canAddAssignees
   * @deprecated Use canAddAssignees and canRemoveAssignees instead
   */
  const canEditAssignees = canAddAssignees;

  /**
   * Check if current user can take the request (self-assign)
   * Only when 0 assignees, user is technician, and request is not solved
   */
  const canTakeRequest = useMemo(() => {
    const currentUserId = options?.currentUserId;
    const isTechnician = options?.isTechnician || false;
    const countAsSolved = options?.countAsSolved || false;
    const assigneeCount = data?.total || 0;
    const alreadyAssigned = currentUserId
      ? isUserAssigned(currentUserId)
      : false;

    // Cannot take a solved request
    if (countAsSolved) return false;

    return assigneeCount === 0 && isTechnician && !alreadyAssigned;
  }, [
    data?.total,
    options?.currentUserId,
    options?.isTechnician,
    options?.countAsSolved,
    isUserAssigned,
  ]);

  return {
    assignees: data?.assignees || [],
    total: data?.total || 0,
    isLoading: assigneesLoading,
    error,
    addAssignee,
    removeAssignee,
    takeRequest,
    isUserAssigned,
    getAssigneeByUserId,
    refresh,
    mutate,
    canEditAssignees, // @deprecated - use canAddAssignees
    canAddAssignees,
    canRemoveAssignees,
    canTakeRequest,
  };
}

/**
 * Type for the return value of useRequestAssignees hook
 */
export type UseRequestAssigneesReturn = ReturnType<typeof useRequestAssignees>;
