'use client';

import React, { createContext, useContext, useCallback } from 'react';
import type { RequestType, RequestTypeListResponse } from '@/types/request-types';
import {
  toggleRequestTypeStatus,
  bulkUpdateRequestTypesStatus,
  deleteRequestType,
} from '@/lib/api/request-types';
import { toast } from 'sonner';

interface RequestTypesActionsContextType {
  updateTypesOptimistic: (types: RequestType[]) => Promise<void>;
  addTypeToCache: (type: RequestType) => Promise<void>;
  handleToggleStatus: (id: string) => Promise<void>;
  handleBulkUpdate: (ids: string[], isActive: boolean) => Promise<void>;
  handleDelete: (id: string) => Promise<void>;
  refetch: () => Promise<void>;
  counts: { total: number; activeCount: number; inactiveCount: number };
}

const RequestTypesActionsContext = createContext<RequestTypesActionsContextType | undefined>(undefined);

export function useRequestTypesActions() {
  const context = useContext(RequestTypesActionsContext);
  if (!context) {
    throw new Error('useRequestTypesActions must be used within RequestTypesActionsProvider');
  }
  return context;
}

interface RequestTypesActionsProviderProps {
  children: React.ReactNode;
  initialData: RequestTypeListResponse;
  onUpdateOptimistic: (types: RequestType[]) => Promise<void>;
  onAddToCache: (type: RequestType) => Promise<void>;
  onRefetch: () => Promise<void>;
}

export function RequestTypesActionsProvider({
  children,
  initialData,
  onUpdateOptimistic,
  onAddToCache,
  onRefetch,
}: RequestTypesActionsProviderProps) {
  const handleToggleStatus = useCallback(
    async (id: string) => {
      try {
        const updated = await toggleRequestTypeStatus(id);
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
        const updated = await bulkUpdateRequestTypesStatus({
          typeIds: numericIds,
          isActive,
        });
        await onUpdateOptimistic(updated);
        toast.success(`${ids.length} types updated`);
      } catch (error) {
        toast.error('Failed to update types');
        console.error(error);
      }
    },
    [onUpdateOptimistic]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteRequestType(id);
        await onRefetch();
        toast.success('Type deleted');
      } catch (error) {
        toast.error('Failed to delete type');
        console.error(error);
      }
    },
    [onRefetch]
  );

  const value: RequestTypesActionsContextType = {
    updateTypesOptimistic: onUpdateOptimistic,
    addTypeToCache: onAddToCache,
    handleToggleStatus,
    handleBulkUpdate,
    handleDelete,
    refetch: onRefetch,
    counts: {
      total: initialData.total,
      activeCount: initialData.activeCount,
      inactiveCount: initialData.inactiveCount,
    },
  };

  return (
    <RequestTypesActionsContext.Provider value={value}>
      {children}
    </RequestTypesActionsContext.Provider>
  );
}
