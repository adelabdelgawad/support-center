'use client';

import React, { createContext, useContext, useCallback } from 'react';
import type { BusinessUnitResponse, BusinessUnitListResponse } from '@/types/business-units';
import {
  toggleBusinessUnitStatus,
  bulkUpdateBusinessUnitsStatus,
  deleteBusinessUnit,
} from '@/lib/api/business-units';
import { toast } from 'sonner';

interface BusinessUnitsActionsContextType {
  updateBusinessUnitsOptimistic: (units: BusinessUnitResponse[]) => Promise<void>;
  addBusinessUnitToCache: (unit: BusinessUnitResponse) => Promise<void>;
  handleToggleStatus: (id: number) => Promise<void>;
  handleBulkUpdate: (ids: number[], isActive: boolean) => Promise<void>;
  handleDelete: (id: number) => Promise<void>;
  refetch: () => Promise<void>;
  counts: { total: number; activeCount: number; inactiveCount: number };
}

const BusinessUnitsActionsContext = createContext<BusinessUnitsActionsContextType | undefined>(undefined);

export function useBusinessUnitsActions() {
  const context = useContext(BusinessUnitsActionsContext);
  if (!context) {
    throw new Error('useBusinessUnitsActions must be used within BusinessUnitsActionsProvider');
  }
  return context;
}

interface BusinessUnitsActionsProviderProps {
  children: React.ReactNode;
  initialData: BusinessUnitListResponse;
  onUpdateOptimistic: (units: BusinessUnitResponse[]) => Promise<void>;
  onAddToCache: (unit: BusinessUnitResponse) => Promise<void>;
  onRefetch: () => Promise<void>;
}

export function BusinessUnitsActionsProvider({
  children,
  initialData,
  onUpdateOptimistic,
  onAddToCache,
  onRefetch,
}: BusinessUnitsActionsProviderProps) {
  const handleToggleStatus = useCallback(
    async (id: number) => {
      try {
        const updated = await toggleBusinessUnitStatus(id);
        await onUpdateOptimistic([updated]);
        toast.success('Business unit status updated');
      } catch (error) {
        toast.error('Failed to update business unit status');
        console.error(error);
      }
    },
    [onUpdateOptimistic]
  );

  const handleBulkUpdate = useCallback(
    async (ids: number[], isActive: boolean) => {
      try {
        const updated = await bulkUpdateBusinessUnitsStatus({
          businessUnitIds: ids,
          isActive,
        });
        await onUpdateOptimistic(updated);
        toast.success(`${ids.length} business units updated`);
      } catch (error) {
        toast.error('Failed to update business units');
        console.error(error);
      }
    },
    [onUpdateOptimistic]
  );

  const handleDelete = useCallback(
    async (id: number) => {
      try {
        await deleteBusinessUnit(id);
        await onRefetch();
        toast.success('Business unit deleted');
      } catch (error) {
        toast.error('Failed to delete business unit');
        console.error(error);
      }
    },
    [onRefetch]
  );

  const value: BusinessUnitsActionsContextType = {
    updateBusinessUnitsOptimistic: onUpdateOptimistic,
    addBusinessUnitToCache: onAddToCache,
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
    <BusinessUnitsActionsContext.Provider value={value}>
      {children}
    </BusinessUnitsActionsContext.Provider>
  );
}
