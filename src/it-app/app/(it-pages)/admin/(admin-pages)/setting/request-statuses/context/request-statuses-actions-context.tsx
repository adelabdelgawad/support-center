'use client';

import React, { createContext, useContext, useCallback } from 'react';
import type { RequestStatusResponse, RequestStatusListResponse } from '@/types/request-statuses';
import {
  toggleRequestStatusStatus,
  bulkUpdateRequestStatusesStatus,
  deleteRequestStatus,
} from '@/lib/api/request-statuses';
import { toast } from 'sonner';

interface RequestStatusesActionsContextType {
  updateStatusesOptimistic: (statuses: RequestStatusResponse[]) => Promise<void>;
  addStatusToCache: (status: RequestStatusResponse) => Promise<void>;
  handleToggleStatus: (id: string) => Promise<void>;
  handleBulkUpdate: (ids: string[], isActive: boolean) => Promise<void>;
  handleDelete: (id: string) => Promise<void>;
  refetch: () => Promise<void>;
  counts: { total: number; activeCount: number; inactiveCount: number; readonlyCount: number };
}

const RequestStatusesActionsContext = createContext<RequestStatusesActionsContextType | undefined>(undefined);

export function useRequestStatusesActions() {
  const context = useContext(RequestStatusesActionsContext);
  if (!context) {
    throw new Error('useRequestStatusesActions must be used within RequestStatusesActionsProvider');
  }
  return context;
}

interface RequestStatusesActionsProviderProps {
  children: React.ReactNode;
  initialData: RequestStatusListResponse;
  onUpdateOptimistic: (statuses: RequestStatusResponse[]) => Promise<void>;
  onAddToCache: (status: RequestStatusResponse) => Promise<void>;
  onRefetch: () => Promise<void>;
}

export function RequestStatusesActionsProvider({
  children,
  initialData,
  onUpdateOptimistic,
  onAddToCache,
  onRefetch,
}: RequestStatusesActionsProviderProps) {
  const handleToggleStatus = useCallback(
    async (id: string) => {
      try {
        const updated = await toggleRequestStatusStatus(id);
        await onUpdateOptimistic([updated]);
        toast.success('Status updated');
      } catch (error) {
        toast.error('Failed to update status');
        console.error(error);
      }
    },
    [onUpdateOptimistic]
  );

  const handleBulkUpdate = useCallback(
    async (ids: string[], isActive: boolean) => {
      try {
        const numericIds = ids.map(id => parseInt(id, 10));
        const updated = await bulkUpdateRequestStatusesStatus({
          statusIds: numericIds,
          isActive,
        });
        await onUpdateOptimistic(updated);
        toast.success(`${ids.length} statuses updated`);
      } catch (error) {
        toast.error('Failed to update statuses');
        console.error(error);
      }
    },
    [onUpdateOptimistic]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteRequestStatus(id);
        await onRefetch();
        toast.success('Status deleted');
      } catch (error) {
        toast.error('Failed to delete status');
        console.error(error);
      }
    },
    [onRefetch]
  );

  const value: RequestStatusesActionsContextType = {
    updateStatusesOptimistic: onUpdateOptimistic,
    addStatusToCache: onAddToCache,
    handleToggleStatus,
    handleBulkUpdate,
    handleDelete,
    refetch: onRefetch,
    counts: {
      total: initialData.total,
      activeCount: initialData.activeCount,
      inactiveCount: initialData.inactiveCount,
      readonlyCount: initialData.readonlyCount,
    },
  };

  return (
    <RequestStatusesActionsContext.Provider value={value}>
      {children}
    </RequestStatusesActionsContext.Provider>
  );
}
