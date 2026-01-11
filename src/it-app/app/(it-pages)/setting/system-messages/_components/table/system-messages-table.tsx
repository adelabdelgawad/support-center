'use client';

import { useSearchParams } from 'next/navigation';
import { Pagination } from '@/components/data-table';
import { SystemMessagesTableBody } from './system-messages-table-body';
import type { SystemMessageListResponse, SystemMessageResponse } from '@/types/system-messages';
import { useCallback, useState, useEffect } from 'react';
import { SystemMessagesActionsProvider } from '../../context/system-messages-actions-context';

interface SystemMessagesTableProps {
  initialData: SystemMessageListResponse;
}

function SystemMessagesTable({ initialData }: SystemMessagesTableProps) {
  const searchParams = useSearchParams();
  const [data, setData] = useState<SystemMessageListResponse>(initialData);

  const page = Number(searchParams?.get('page') || '1');
  const limit = Number(searchParams?.get('limit') || '10');

  // Sync with initialData when it changes (server-side update)
  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  const messages = data.messages;
  const activeCount = data.activeCount;
  const inactiveCount = data.inactiveCount;
  const totalItems = data.total;

  /**
   * Update system messages with backend-returned data
   * Uses the returned record from API - no frontend count recalculation
   * Counts will refresh on next navigation (SSR)
   */
  const updateMessagesOptimistic = useCallback(
    async (updatedMessages: SystemMessageResponse[]) => {
      const updatedMap = new Map(updatedMessages.map((m) => [m.id, m]));

      // Update only the affected rows with backend-returned data
      const updatedMessagesList = data.messages.map((message) =>
        updatedMap.has(message.id) ? updatedMap.get(message.id)! : message
      );

      // Keep existing counts - no frontend calculation
      // Counts will be accurate on next page navigation (SSR)
      const newData: SystemMessageListResponse = {
        ...data,
        messages: updatedMessagesList,
      };

      setData(newData);
    },
    [data]
  );

  /**
   * Add new system message to cache with backend-returned data
   * No frontend count recalculation - counts refresh on next navigation (SSR)
   */
  const addMessageToCache = useCallback(
    async (newMessage: SystemMessageResponse) => {
      // Add the message and increment total, but don't recalculate active/inactive counts
      // Counts will be accurate on next page navigation (SSR)
      const newData: SystemMessageListResponse = {
        ...data,
        messages: [newMessage, ...data.messages],
        total: data.total + 1,
      };

      setData(newData);
    },
    [data]
  );

  const handleRefetch = useCallback(async () => {
    // No-op for server-side rendering
  }, []);

  const totalPages = Math.ceil(totalItems / limit);

  return (
    <SystemMessagesActionsProvider
      initialData={data}
      onUpdateOptimistic={updateMessagesOptimistic}
      onAddToCache={addMessageToCache}
      onRefetch={handleRefetch}
    >
      <div className="relative h-full flex bg-muted min-h-0 p-1">
        {/* Main Content */}
        <div className="h-full flex-1 flex flex-col min-h-0 min-w-0 space-y-2">
          {/* Table */}
          <div className="flex-1 min-h-0 flex flex-col">
            <SystemMessagesTableBody
              messages={messages}
              page={page}
              limit={limit}
              total={totalItems}
              refetch={handleRefetch}
              updateMessages={updateMessagesOptimistic}
              addMessage={addMessageToCache}
              activeCount={activeCount}
              inactiveCount={inactiveCount}
            />
          </div>

          {/* Pagination */}
          <div className="shrink-0 bg-background border-t border-border rounded-md">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              pageSize={limit}
              totalItems={totalItems}
            />
          </div>
        </div>
      </div>
    </SystemMessagesActionsProvider>
  );
}

export default SystemMessagesTable;
