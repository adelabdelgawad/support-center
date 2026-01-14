"use client";

import { apiClient, getClientErrorMessage as getErrorMessage } from "@/lib/fetch/client";
import { useMemo, useCallback, useState } from "react";

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
 * Technician info from shared cache (optional integration)
 */
export interface TechnicianInfo {
  id: string;  // UUID string from backend
  username: string;
  fullName: string | null;
  title: string | null;
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
 * Hook to fetch and manage request assignees
 * SIMPLIFIED: No SWR - uses simple state with backend response updates
 *
 * Features:
 * - Uses backend response to update state (no extra network requests)
 * - Proper error handling with callbacks
 *
 * @param requestId - The request/ticket ID (for backward compatibility)
 * @param initialData - Initial assignees data from server (for SSR)
 * @param options - Additional options for enhanced functionality
 * @returns Assignees data and helpers
 */
export function useRequestAssignees(
  requestId: string,
  initialData?: Assignee[],
  options?: Partial<
    Omit<UseRequestAssigneesOptions, "requestId" | "initialData">
  >
) {
  const { onAssigneeAdded, onAssigneeRemoved, onError } = options || {};

  // Simple state for assignees
  const [assignees, setAssignees] = useState<Assignee[]>(initialData ?? []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);

  /**
   * Add an assignee - simple direct approach
   * Calls API and updates state with returned full assignees list
   */
  const addAssignee = useCallback(async (
    technicianId: string,
    _technicianName: string,
    _technicianTitle?: string
  ): Promise<void> => {
    try {
      setIsLoading(true);
      // Send request to server - returns full updated assignees list
      const response = await apiClient.post<{
        success: boolean;
        message: string;
        requestId: string;
        assignees: Assignee[];
        total: number;
      }>(`/api/requests-details/${requestId}/assignees`, { technicianId });

      if (response.success) {
        // Update state with server data directly
        setAssignees(response.assignees);

        // Find the added assignee for callback
        const addedAssignee = response.assignees.find(
          (a) => a.userId === technicianId
        );
        if (addedAssignee && onAssigneeAdded) {
          onAssigneeAdded(addedAssignee);
        }
      } else {
        const error = new Error(response.message || "Failed to add assignee");
        setError(error);
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

      setError(error);
      if (onError) {
        onError(error);
      }
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [requestId, onAssigneeAdded, onError]);

  /**
   * Remove an assignee - simple direct approach
   * Calls API and updates state with returned full assignees list
   */
  const removeAssignee = useCallback(async (technicianId: string): Promise<void> => {
    try {
      setIsLoading(true);
      // Send request to server - returns full updated assignees list
      const response = await apiClient.delete<{
        success: boolean;
        message: string;
        requestId: string;
        assignees: Assignee[];
        total: number;
      }>(`/api/requests-details/${requestId}/assignees`, { technicianId });

      if (response.success) {
        // Update state with server data directly
        setAssignees(response.assignees);

        // Notify callback
        if (onAssigneeRemoved) {
          onAssigneeRemoved(technicianId);
        }
      } else {
        const error = new Error(response.message || "Failed to remove assignee");
        setError(error);
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

      setError(error);
      if (onError) {
        onError(error);
      }
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [requestId, onAssigneeRemoved, onError]);

  /**
   * Take (self-assign) the request - updates state directly with optimistic update
   */
  const takeRequest = useCallback(async (currentUser: {
    id: string;
    username: string;
    fullName?: string | null;
    title?: string | null;
  }): Promise<void> => {
    // Check if already assigned (compare as strings since IDs can be UUID or number)
    if (assignees.some((a) => String(a.userId) === String(currentUser.id))) {
      throw new Error("You are already assigned to this request");
    }

    // Store previous data for rollback
    const previousAssignees = [...assignees];

    // Create assignee for current user (optimistic)
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
    setAssignees([...assignees, newAssignee]);

    try {
      // Send request to server
      await apiClient.post(`/api/requests-details/${requestId}/take`);

      // Notify callback
      if (onAssigneeAdded) {
        onAssigneeAdded(newAssignee);
      }
    } catch (err) {
      // Rollback on error
      setAssignees(previousAssignees);

      const error =
        err instanceof Error ? err : new Error(getErrorMessage(err));
      setError(error);
      if (onError) {
        onError(error);
      }
      throw error;
    }
  }, [assignees, requestId, onAssigneeAdded, onError]);

  /**
   * Check if a user is already assigned to this request
   */
  const isUserAssigned = useCallback((userId: string): boolean => {
    return assignees.some((a) => a.userId === userId);
  }, [assignees]);

  /**
   * Get assignee by user ID
   */
  const getAssigneeByUserId = useCallback((userId: string): Assignee | undefined => {
    return assignees.find((a) => a.userId === userId);
  }, [assignees]);

  /**
   * Force refresh the assignees from server
   */
  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await apiClient.get<AssigneesResponse>(
        `/api/requests-details/${requestId}/assignees`
      );
      setAssignees(response.assignees);
      setError(undefined);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(getErrorMessage(err));
      setError(error);
    } finally {
      setIsLoading(false);
    }
  }, [requestId]);

  // For compatibility with SWR-like API
  const mutate = refresh;

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
    const assigneeCount = assignees.length;

    // If request is solved, no modifications allowed
    if (countAsSolved) return false;

    // If no assignees, removal is not applicable
    if (assigneeCount === 0) return false;

    // Any technician can remove assignees from non-solved requests
    // Note: Cannot remove last assignee - enforced by backend
    return isTechnician;
  }, [assignees.length, options?.isTechnician, options?.countAsSolved]);

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
    const assigneeCount = assignees.length;
    const alreadyAssigned = currentUserId
      ? isUserAssigned(currentUserId)
      : false;

    // Cannot take a solved request
    if (countAsSolved) return false;

    return assigneeCount === 0 && isTechnician && !alreadyAssigned;
  }, [
    assignees.length,
    options?.currentUserId,
    options?.isTechnician,
    options?.countAsSolved,
    isUserAssigned,
  ]);

  return {
    assignees,
    total: assignees.length,
    isLoading,
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
