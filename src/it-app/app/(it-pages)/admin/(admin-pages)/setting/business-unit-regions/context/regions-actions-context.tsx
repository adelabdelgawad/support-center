'use client';

import React, { createContext, useContext, useCallback } from 'react';
import type { BusinessUnitRegionResponse, BusinessUnitRegionListResponse } from '@/types/business-unit-regions';
import {
  toggleBusinessUnitRegionStatus,
  bulkUpdateBusinessUnitRegionsStatus,
  deleteBusinessUnitRegion,
} from '@/lib/api/business-unit-regions';
import { toast } from 'sonner';

interface RegionsActionsContextType {
  updateRegionsOptimistic: (regions: BusinessUnitRegionResponse[]) => Promise<void>;
  addRegionToCache: (region: BusinessUnitRegionResponse) => Promise<void>;
  handleToggleStatus: (id: number) => Promise<void>;
  handleBulkUpdate: (ids: number[], isActive: boolean) => Promise<void>;
  handleDelete: (id: number) => Promise<void>;
  refetch: () => Promise<void>;
  counts: { total: number; activeCount: number; inactiveCount: number };
}

const RegionsActionsContext = createContext<RegionsActionsContextType | undefined>(undefined);

export function useRegionsActions() {
  const context = useContext(RegionsActionsContext);
  if (!context) {
    throw new Error('useRegionsActions must be used within RegionsActionsProvider');
  }
  return context;
}

interface RegionsActionsProviderProps {
  children: React.ReactNode;
  initialData: BusinessUnitRegionListResponse;
  onUpdateOptimistic: (regions: BusinessUnitRegionResponse[]) => Promise<void>;
  onAddToCache: (region: BusinessUnitRegionResponse) => Promise<void>;
  onRefetch: () => Promise<void>;
}

export function RegionsActionsProvider({
  children,
  initialData,
  onUpdateOptimistic,
  onAddToCache,
  onRefetch,
}: RegionsActionsProviderProps) {
  const handleToggleStatus = useCallback(
    async (id: number) => {
      try {
        const updated = await toggleBusinessUnitRegionStatus(id);
        await onUpdateOptimistic([updated]);
        toast.success('Region status updated');
      } catch (error) {
        toast.error('Failed to update region status');
        console.error(error);
      }
    },
    [onUpdateOptimistic]
  );

  const handleBulkUpdate = useCallback(
    async (ids: number[], isActive: boolean) => {
      try {
        const updated = await bulkUpdateBusinessUnitRegionsStatus({
          regionIds: ids,
          isActive,
        });
        await onUpdateOptimistic(updated);
        toast.success(`${ids.length} regions updated`);
      } catch (error) {
        toast.error('Failed to update regions');
        console.error(error);
      }
    },
    [onUpdateOptimistic]
  );

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        await deleteBusinessUnitRegion(id);
        await onRefetch();
        toast.success('Region deleted');
      } catch (error) {
        toast.error('Failed to delete region');
        console.error(error);
      }
    },
    [onRefetch]
  );

  const value: RegionsActionsContextType = {
    updateRegionsOptimistic: onUpdateOptimistic,
    addRegionToCache: onAddToCache,
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
    <RegionsActionsContext.Provider value={value}>
      {children}
    </RegionsActionsContext.Provider>
  );
}
