'use client';

import useSWR from 'swr';
import { useState, useCallback } from 'react';
import { apiClient, getClientErrorMessage as getErrorMessage } from '@/lib/fetch/client';
import { cacheKeys } from '@/lib/swr/cache-keys';
import type { ServiceRequestDetail } from '@/types/ticket-detail';
import type { Priority, RequestStatus } from '@/types/metadata';

/**
 * Fetcher function for SWR using apiClient
 */
async function fetcher<T>(url: string): Promise<T> {
  return apiClient.get<T>(url);
}

/**
 * Options for the useRequestTicket hook
 */
export interface UseRequestTicketOptions {
  requestId: string;
  initialData?: ServiceRequestDetail;
  priorities?: Priority[];
  statuses?: RequestStatus[];
  onStatusUpdate?: (ticket: ServiceRequestDetail) => void;
  onPriorityUpdate?: (ticket: ServiceRequestDetail) => void;
  onError?: (error: Error) => void;
}

/**
 * Mutation state for tracking loading states
 */
interface MutationState {
  isUpdatingStatus: boolean;
  isUpdatingPriority: boolean;
}

/**
 * Hook to manage request/ticket status and priority updates with SWR
 *
 * Features:
 * - Optimistic updates with automatic rollback on error
 * - Uses server response to update cache (no extra fetches)
 * - Tracks individual loading states for status and priority
 * - Error handling with callbacks
 *
 * @param options - Configuration options
 * @returns Ticket data and mutation functions
 */
export function useRequestTicket(options: UseRequestTicketOptions) {
  const {
    requestId,
    initialData,
    priorities = [],
    statuses = [],
    onStatusUpdate,
    onPriorityUpdate,
    onError,
  } = options;

  const [mutationState, setMutationState] = useState<MutationState>({
    isUpdatingStatus: false,
    isUpdatingPriority: false,
  });

  // Check if initial data is empty - if so, we need to fetch on mount
  const hasRealInitialData = initialData && initialData.id !== undefined;

  const { data, error, isLoading, mutate } = useSWR<ServiceRequestDetail>(
    requestId ? cacheKeys.requestDetails(requestId) : null,
    fetcher,
    {
      fallbackData: initialData,
      // Fetch on mount if no real initial data (e.g., came from empty fallback)
      revalidateOnMount: !hasRealInitialData,
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    }
  );

  const ticket = data ?? initialData;

  /**
   * Update ticket status with optimistic update
   *
   * @param statusId - New status ID
   * @param resolution - Optional resolution text (required for certain statuses)
   */
  const updateStatus = useCallback(
    async (statusId: number, resolution?: string) => {
      if (!ticket || mutationState.isUpdatingStatus) return;

      const previousData = ticket;

      // Start loading
      setMutationState((prev) => ({ ...prev, isUpdatingStatus: true }));

      // Optimistic update - use statuses array if available to get full status object
      const newStatus = statuses.find((s) => s.id === statusId);
      const optimisticTicket: ServiceRequestDetail = {
        ...ticket,
        statusId,
        ...(newStatus && {
          status: {
            id: newStatus.id,
            name: newStatus.name,
            nameEn: newStatus.nameEn,
            nameAr: newStatus.nameAr,
            color: newStatus.color,
            countAsSolved: newStatus.countAsSolved,
          },
        }),
      };

      await mutate(optimisticTicket, { revalidate: false });

      try {
        // Call API and get updated ticket
        const payload: { statusId: number; resolution?: string } = { statusId };
        if (resolution) {
          payload.resolution = resolution;
        }

        // Call API and get partial update response
        const partialUpdate = await apiClient.patch<Partial<ServiceRequestDetail>>(
          `/api/requests-details/${requestId}/status`,
          payload
        );

        // Merge partial response with existing full ticket to preserve all fields
        // This prevents losing nested data like 'requester' when API returns only partial data
        const updatedTicket = await mutate(prevTicket => {
          if (!prevTicket) return prevTicket;
          
          // Merge the partial update with the existing ticket
          const mergedTicket: ServiceRequestDetail = {
            ...prevTicket,
            ...partialUpdate,
            // Preserve the requester from existing ticket if not in partial response
            requester: partialUpdate.requester ?? prevTicket.requester,
            // Preserve other nested objects that might be missing from partial response
            status: partialUpdate.status ?? prevTicket.status,
            priority: partialUpdate.priority ?? prevTicket.priority,
          };

          return mergedTicket;
        }, { revalidate: false });

        // Notify callback
        if (onStatusUpdate && updatedTicket) {
          onStatusUpdate(updatedTicket);
        }

        return updatedTicket;
      } catch (err) {
        // Rollback on error
        await mutate(previousData, { revalidate: false });

        const error = err instanceof Error ? err : new Error(getErrorMessage(err));
        if (onError) {
          onError(error);
        }
        throw error;
      } finally {
        setMutationState((prev) => ({ ...prev, isUpdatingStatus: false }));
      }
    },
    [ticket, requestId, statuses, mutate, mutationState.isUpdatingStatus, onStatusUpdate, onError]
  );

  /**
   * Update ticket priority with optimistic update
   *
   * @param priorityId - New priority ID
   */
  const updatePriority = useCallback(
    async (priorityId: number) => {
      if (!ticket || mutationState.isUpdatingPriority) return;

      const previousData = ticket;

      // Start loading
      setMutationState((prev) => ({ ...prev, isUpdatingPriority: true }));

      // Optimistic update - use priorities array if available to get full priority object
      const newPriority = priorities.find((p) => p.id === priorityId);
      const optimisticTicket: ServiceRequestDetail = {
        ...ticket,
        priorityId,
        ...(newPriority && {
          priority: {
            id: newPriority.id,
            name: newPriority.name,
            responseTimeMinutes: newPriority.responseTimeMinutes,
            resolutionTimeHours: newPriority.resolutionTimeHours,
          },
        }),
      };

      await mutate(optimisticTicket, { revalidate: false });

      try {
        // Call API and get partial update response
        const partialUpdate = await apiClient.patch<Partial<ServiceRequestDetail>>(
          `/api/requests-details/${requestId}/priority`,
          { priorityId }
        );

        // Merge partial response with existing full ticket to preserve all fields
        // This prevents losing nested data like 'requester' when API returns only partial data
        const updatedTicket = await mutate(prevTicket => {
          if (!prevTicket) return prevTicket;
          
          // Merge the partial update with the existing ticket
          const mergedTicket: ServiceRequestDetail = {
            ...prevTicket,
            ...partialUpdate,
            // Preserve the requester from existing ticket if not in partial response
            requester: partialUpdate.requester ?? prevTicket.requester,
            // Preserve other nested objects that might be missing from partial response
            status: partialUpdate.status ?? prevTicket.status,
            priority: partialUpdate.priority ?? prevTicket.priority,
          };

          return mergedTicket;
        }, { revalidate: false });

        // Notify callback
        if (onPriorityUpdate && updatedTicket) {
          onPriorityUpdate(updatedTicket);
        }

        return updatedTicket;
      } catch (err) {
        // Rollback on error
        await mutate(previousData, { revalidate: false });

        const error = err instanceof Error ? err : new Error(getErrorMessage(err));
        if (onError) {
          onError(error);
        }
        throw error;
      } finally {
        setMutationState((prev) => ({ ...prev, isUpdatingPriority: false }));
      }
    },
    [ticket, requestId, priorities, mutate, mutationState.isUpdatingPriority, onPriorityUpdate, onError]
  );

  /**
   * Force refresh the ticket data from server
   */
  const refresh = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return {
    // Data
    ticket,
    isLoading,
    error,

    // Mutation states
    isUpdatingStatus: mutationState.isUpdatingStatus,
    isUpdatingPriority: mutationState.isUpdatingPriority,
    isUpdating: mutationState.isUpdatingStatus || mutationState.isUpdatingPriority,

    // Actions
    updateStatus,
    updatePriority,
    refresh,
    mutate,
  };
}

/**
 * Type for the return value of useRequestTicket hook
 */
export type UseRequestTicketReturn = ReturnType<typeof useRequestTicket>;
