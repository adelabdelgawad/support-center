'use client';

import { useState, useCallback } from 'react';
import { apiClient, getClientErrorMessage as getErrorMessage } from '@/lib/fetch/client';
import type { ServiceRequestDetail } from '@/types/ticket-detail';
import type { Priority, RequestStatus } from '@/types/metadata';

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
 * Hook to manage request/ticket status and priority updates
 * SIMPLIFIED: No SWR - uses simple state with backend response
 *
 * Features:
 * - Optimistic updates with automatic rollback on error
 * - Uses server response to update state (no extra fetches)
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

  // Simple state for ticket data
  const [ticket, setTicket] = useState<ServiceRequestDetail | undefined>(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isUpdatingPriority, setIsUpdatingPriority] = useState(false);

  /**
   * Update ticket status with optimistic update
   *
   * @param statusId - New status ID
   * @param resolution - Optional resolution text (required for certain statuses)
   */
  const updateStatus = useCallback(
    async (statusId: number, resolution?: string) => {
      if (!ticket || isUpdatingStatus) return;

      const previousData = ticket;

      // Start loading
      setIsUpdatingStatus(true);

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

      setTicket(optimisticTicket);

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
        const mergedTicket: ServiceRequestDetail = {
          ...ticket,
          ...partialUpdate,
          // Preserve the requester from existing ticket if not in partial response
          requester: partialUpdate.requester ?? ticket.requester,
          // Preserve other nested objects that might be missing from partial response
          status: partialUpdate.status ?? ticket.status,
          priority: partialUpdate.priority ?? ticket.priority,
        };

        setTicket(mergedTicket);

        // Notify callback
        if (onStatusUpdate) {
          onStatusUpdate(mergedTicket);
        }

        return mergedTicket;
      } catch (err) {
        // Rollback on error
        setTicket(previousData);

        const error = err instanceof Error ? err : new Error(getErrorMessage(err));
        setError(error);
        if (onError) {
          onError(error);
        }
        throw error;
      } finally {
        setIsUpdatingStatus(false);
      }
    },
    [ticket, requestId, statuses, isUpdatingStatus, onStatusUpdate, onError]
  );

  /**
   * Update ticket priority with optimistic update
   *
   * @param priorityId - New priority ID
   */
  const updatePriority = useCallback(
    async (priorityId: number) => {
      if (!ticket || isUpdatingPriority) return;

      const previousData = ticket;

      // Start loading
      setIsUpdatingPriority(true);

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

      setTicket(optimisticTicket);

      try {
        // Call API and get partial update response
        const partialUpdate = await apiClient.patch<Partial<ServiceRequestDetail>>(
          `/api/requests-details/${requestId}/priority`,
          { priorityId }
        );

        // Merge partial response with existing full ticket to preserve all fields
        // This prevents losing nested data like 'requester' when API returns only partial data
        const mergedTicket: ServiceRequestDetail = {
          ...ticket,
          ...partialUpdate,
          // Preserve the requester from existing ticket if not in partial response
          requester: partialUpdate.requester ?? ticket.requester,
          // Preserve other nested objects that might be missing from partial response
          status: partialUpdate.status ?? ticket.status,
          priority: partialUpdate.priority ?? ticket.priority,
        };

        setTicket(mergedTicket);

        // Notify callback
        if (onPriorityUpdate) {
          onPriorityUpdate(mergedTicket);
        }

        return mergedTicket;
      } catch (err) {
        // Rollback on error
        setTicket(previousData);

        const error = err instanceof Error ? err : new Error(getErrorMessage(err));
        setError(error);
        if (onError) {
          onError(error);
        }
        throw error;
      } finally {
        setIsUpdatingPriority(false);
      }
    },
    [ticket, requestId, priorities, isUpdatingPriority, onPriorityUpdate, onError]
  );

  /**
   * Force refresh the ticket data from server
   */
  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await apiClient.get<ServiceRequestDetail>(
        `/api/requests-details/${requestId}`
      );
      setTicket(data);
      setError(undefined);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(getErrorMessage(err));
      setError(error);
    } finally {
      setIsLoading(false);
    }
  }, [requestId]);

  /**
   * Update ticket state directly (for WebSocket updates)
   * Accepts a callback function that receives current ticket and returns updated ticket
   */
  const mutate = useCallback(
    async (
      updater?: ServiceRequestDetail | ((prev: ServiceRequestDetail | undefined) => ServiceRequestDetail | undefined),
      _options?: { revalidate?: boolean }
    ) => {
      if (typeof updater === 'function') {
        setTicket((prev) => updater(prev));
      } else if (updater) {
        setTicket(updater);
      }
      return ticket;
    },
    [ticket]
  );

  return {
    // Data
    ticket,
    isLoading,
    error,

    // Mutation states
    isUpdatingStatus,
    isUpdatingPriority,
    isUpdating: isUpdatingStatus || isUpdatingPriority,

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
