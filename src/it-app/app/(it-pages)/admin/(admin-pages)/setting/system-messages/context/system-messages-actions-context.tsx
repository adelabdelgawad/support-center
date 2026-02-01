'use client';

import React, { createContext, useContext, useCallback } from 'react';
import type { SystemMessageResponse, SystemMessageListResponse } from '@/types/system-messages';
import {
  toggleSystemMessageStatus,
  deleteSystemMessage,
} from '@/lib/api/system-messages';
import { toast } from 'sonner';

interface SystemMessagesActionsContextType {
  updateMessagesOptimistic: (messages: SystemMessageResponse[]) => void;
  addMessageToCache: (message: SystemMessageResponse) => void;
  handleToggleStatus: (id: string) => void;
  handleDelete: (id: string) => void;
  refetch: () => void;
  counts: { total: number; activeCount: number; inactiveCount: number };
}

const SystemMessagesActionsContext = createContext<SystemMessagesActionsContextType | undefined>(undefined);

export function useSystemMessagesActions() {
  const context = useContext(SystemMessagesActionsContext);
  if (!context) {
    throw new Error('useSystemMessagesActions must be used within SystemMessagesActionsProvider');
  }
  return context;
}

interface SystemMessagesActionsProviderProps {
  children: React.ReactNode;
  initialData: SystemMessageListResponse;
  onUpdateOptimistic: (messages: SystemMessageResponse[]) => void;
  onAddToCache: (message: SystemMessageResponse) => void;
  onRefetch: () => void;
}

export function SystemMessagesActionsProvider({
  children,
  initialData,
  onUpdateOptimistic,
  onAddToCache,
  onRefetch,
}: SystemMessagesActionsProviderProps) {
  const handleToggleStatus = useCallback(
    async (id: string) => {
      try {
        const updated = await toggleSystemMessageStatus(id);
        await onUpdateOptimistic([updated]);
        toast.success('Message status updated');
      } catch (error) {
        toast.error('Failed to update message status');
        console.error(error);
      }
    },
    [onUpdateOptimistic]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await deleteSystemMessage(id);
        await onRefetch();
        toast.success('Message deleted');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to delete message';
        toast.error(errorMessage);
        console.error(error);
        throw error; // Re-throw to allow component to handle
      }
    },
    [onRefetch]
  );

  const value: SystemMessagesActionsContextType = {
    updateMessagesOptimistic: onUpdateOptimistic,
    addMessageToCache: onAddToCache,
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
    <SystemMessagesActionsContext.Provider value={value}>
      {children}
    </SystemMessagesActionsContext.Provider>
  );
}
