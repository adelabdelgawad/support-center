'use client';

import { useSearchParams } from 'next/navigation';
import { Pagination } from '@/components/data-table';
import { EventsPanel } from '../sidebar/events-panel';
import { SystemEventsTableBody } from './system-events-table-body';
import type { SystemEventListResponse, SystemEventResponse } from '@/types/system-events';
import { useCallback, useState, useEffect } from 'react';
import { SystemEventsActionsProvider } from '../../context/system-events-actions-context';
import { getSystemEventCounts } from '@/lib/api/system-events';

interface SystemEventsTableProps {
  initialData: SystemEventListResponse;
}

function SystemEventsTable({ initialData }: SystemEventsTableProps) {
  const searchParams = useSearchParams();
  const [data, setData] = useState<SystemEventListResponse>(initialData);

  const page = Number(searchParams?.get('page') || '1');
  const limit = Number(searchParams?.get('limit') || '10');

  // Sync with initialData when it changes (server-side update)
  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  const events = data.events;
  const activeCount = data.activeCount;
  const inactiveCount = data.inactiveCount;
  const totalItems = data.total;

  /**
   * Update system events with backend-returned data
   * Uses the returned record from API and fetches fresh counts from backend
   */
  const updateEventsOptimistic = useCallback(
    async (updatedEvents: SystemEventResponse[]) => {
      const updatedMap = new Map(updatedEvents.map((e) => [e.id, e]));

      // Update only the affected rows with backend-returned data
      const updatedEventsList = data.events.map((event) =>
        updatedMap.has(event.id) ? updatedMap.get(event.id)! : event
      );

      // Fetch fresh counts from backend (no frontend calculation)
      try {
        const counts = await getSystemEventCounts();
        const newData: SystemEventListResponse = {
          ...data,
          events: updatedEventsList,
          total: counts.total,
          activeCount: counts.activeCount,
          inactiveCount: counts.inactiveCount,
        };
        setData(newData);
      } catch {
        // If counts fetch fails, still update the rows but keep existing counts
        const newData: SystemEventListResponse = {
          ...data,
          events: updatedEventsList,
        };
        setData(newData);
      }
    },
    [data]
  );

  /**
   * Add new system event to cache with backend-returned data
   * Fetches fresh counts from backend
   */
  const addEventToCache = useCallback(
    async (newEvent: SystemEventResponse) => {
      // Fetch fresh counts from backend (no frontend calculation)
      try {
        const counts = await getSystemEventCounts();
        const newData: SystemEventListResponse = {
          ...data,
          events: [newEvent, ...data.events],
          total: counts.total,
          activeCount: counts.activeCount,
          inactiveCount: counts.inactiveCount,
        };
        setData(newData);
      } catch {
        // If counts fetch fails, add the event but keep existing counts
        const newData: SystemEventListResponse = {
          ...data,
          events: [newEvent, ...data.events],
          total: data.total + 1,
        };
        setData(newData);
      }
    },
    [data]
  );

  const handleRefetch = useCallback(async () => {
    // No-op for server-side rendering
  }, []);

  const totalPages = Math.ceil(totalItems / limit);

  return (
    <SystemEventsActionsProvider
      initialData={data}
      onUpdateOptimistic={updateEventsOptimistic}
      onAddToCache={addEventToCache}
      onRefetch={handleRefetch}
    >
      <div className="relative h-full flex bg-muted min-h-0 p-1">
        {/* Events Panel */}
        <EventsPanel
          total={totalItems}
          activeCount={activeCount}
          inactiveCount={inactiveCount}
        />

        {/* Main Content */}
        <div className="h-full flex-1 flex flex-col min-h-0 min-w-0 ml-2 space-y-2">
          {/* Table */}
          <div className="flex-1 min-h-0 flex flex-col">
            <SystemEventsTableBody
              events={events}
              page={page}
              limit={limit}
              total={totalItems}
              refetch={handleRefetch}
              updateEvents={updateEventsOptimistic}
              addEvent={addEventToCache}
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
    </SystemEventsActionsProvider>
  );
}

export default SystemEventsTable;
