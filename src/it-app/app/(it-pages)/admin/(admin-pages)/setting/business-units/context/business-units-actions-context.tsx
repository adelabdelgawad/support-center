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
  updateBusinessUnitsOptimistic: (units: BusinessUnitResponse[]) => void;
  addBusinessUnitToCache: (unit: BusinessUnitResponse) => void;
  handleToggleStatus: (id: number) => void;
  handleBulkUpdate: (ids: number[], isActive: boolean) => void;
  handleDelete: (id: number) => void;
  refetch: () => void;
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
  onUpdateOptimistic: (units: BusinessUnitResponse[]) => void;
  onAddToCache: (unit: BusinessUnitResponse) => void;
  onRefetch: () => void;
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
        onUpdateOptimistic([updated]);
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
        onUpdateOptimistic(updated);
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
