'use client';

import React, { createContext, useContext, useCallback } from 'react';
import type { SystemEventResponse, SystemEventListResponse } from '@/types/system-events';
import {
  toggleSystemEventStatus,
  deleteSystemEvent,
} from '@/lib/api/system-events';
import { toast } from 'sonner';

interface SystemEventsActionsContextType {
  updateEventsOptimistic: (events: SystemEventResponse[]) => Promise<void>;
  addEventToCache: (event: SystemEventResponse) => Promise<void>;
  handleToggleStatus: (id: string) => Promise<void>;
  handleDelete: (id: string) => Promise<void>;
  refetch: () => Promise<void>;
  counts: { total: number; activeCount: number; inactiveCount: number };
}

const SystemEventsActionsContext = createContext<SystemEventsActionsContextType | undefined>(undefined);

export function useSystemEventsActions() {
  const context = useContext(SystemEventsActionsContext);
  if (!context) {
    throw new Error('useSystemEventsActions must be used within SystemEventsActionsProvider');
  }
  return context;
}

interface SystemEventsActionsProviderProps {
  children: React.ReactNode;
  initialData: SystemEventListResponse;
  onUpdateOptimistic: (events: SystemEventResponse[]) => Promise<void>;
  onAddToCache: (event: SystemEventResponse) => Promise<void>;
  onRefetch: () => Promise<void>;
}

export function SystemEventsActionsProvider({
  children,
  initialData,
  onUpdateOptimistic,
  onAddToCache,
  onRefetch,
}: SystemEventsActionsProviderProps) {
  const handleToggleStatus = useCallback(
    async (id: string) => {
      try {
        const updated = await toggleSystemEventStatus(id);
        await onUpdateOptimistic([updated]);
        toast.success('Event status updated');
      } catch (error) {
        toast.error('Failed to update event status');
        console.error(error);
      }
    },
    [onUpdateOptimistic]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteSystemEvent(id);
        await onRefetch();
        toast.success('Event deleted');
      } catch (error) {
        toast.error('Failed to delete event');
        console.error(error);
      }
    },
    [onRefetch]
  );

  const value: SystemEventsActionsContextType = {
    updateEventsOptimistic: onUpdateOptimistic,
    addEventToCache: onAddToCache,
    handleToggleStatus,
    handleDelete,
    refetch: onRefetch,
    counts: {
      total: initialData.total,
      activeCount: initialData.activeCount,
      inactiveCount: initialData.inactiveCount,
    },
  };

  return (
    <SystemEventsActionsContext.Provider value={value}>
      {children}
    </SystemEventsActionsContext.Provider>
  );
}
