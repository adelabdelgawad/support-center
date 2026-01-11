'use client';

import { useSearchParams } from 'next/navigation';
import { Pagination } from '@/components/data-table';
import { RequestStatusesTableBody } from './request-statuses-table-body';
import type { RequestStatusListResponse, RequestStatusResponse } from '@/types/request-statuses';
import { useCallback, useState, useEffect } from 'react';
import { RequestStatusesActionsProvider } from '../../context/request-statuses-actions-context';
import { MobileRequestStatusesView } from '../mobile';
import { getRequestStatusCounts } from '@/lib/api/request-statuses';

interface RequestStatusesTableProps {
  initialData: RequestStatusListResponse;
}

function RequestStatusesTable({ initialData }: RequestStatusesTableProps) {
  const searchParams = useSearchParams();
  const [data, setData] = useState<RequestStatusListResponse>(initialData);

  const page = Number(searchParams?.get('page') || '1');
  const limit = Number(searchParams?.get('limit') || '10');

  // Sync with initialData when it changes (server-side update)
  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  const statuses = data.statuses;
  const activeCount = data.activeCount;
  const inactiveCount = data.inactiveCount;
  const readonlyCount = data.readonlyCount;
  const totalItems = data.total;

  /**
   * Update request statuses with backend-returned data
   * Uses the returned record from API and fetches fresh counts from backend
   */
  const updateStatusesOptimistic = useCallback(
    async (updatedStatuses: RequestStatusResponse[]) => {
      const updatedMap = new Map(updatedStatuses.map((s) => [s.id, s]));

      // Update only the affected rows with backend-returned data
      const updatedStatusesList = data.statuses.map((status) =>
        updatedMap.has(status.id) ? updatedMap.get(status.id)! : status
      );

      // Fetch fresh counts from backend (no frontend calculation)
      try {
        const counts = await getRequestStatusCounts();
        const newData: RequestStatusListResponse = {
          ...data,
          statuses: updatedStatusesList,
          total: counts.total,
          activeCount: counts.activeCount,
          inactiveCount: counts.inactiveCount,
          readonlyCount: counts.readonlyCount,
        };
        setData(newData);
      } catch {
        // If counts fetch fails, still update the rows but keep existing counts
        const newData: RequestStatusListResponse = {
          ...data,
          statuses: updatedStatusesList,
        };
        setData(newData);
      }
    },
    [data]
  );

  /**
   * Add new request status to cache with backend-returned data
   * Fetches fresh counts from backend
   */
  const addStatusToCache = useCallback(
    async (newStatus: RequestStatusResponse) => {
      // Fetch fresh counts from backend (no frontend calculation)
      try {
        const counts = await getRequestStatusCounts();
        const newData: RequestStatusListResponse = {
          ...data,
          statuses: [newStatus, ...data.statuses],
          total: counts.total,
          activeCount: counts.activeCount,
          inactiveCount: counts.inactiveCount,
          readonlyCount: counts.readonlyCount,
        };
        setData(newData);
      } catch {
        // If counts fetch fails, add the status but keep existing counts
        const newData: RequestStatusListResponse = {
          ...data,
          statuses: [newStatus, ...data.statuses],
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
    <RequestStatusesActionsProvider
      initialData={data}
      onUpdateOptimistic={updateStatusesOptimistic}
      onAddToCache={addStatusToCache}
      onRefetch={handleRefetch}
    >
      <div className="relative h-full bg-muted min-h-0">
        {/* Desktop View (md and up) */}
        <div className="hidden md:flex h-full p-1">
          {/* Main Content */}
          <div className="h-full flex-1 flex flex-col min-h-0 min-w-0 space-y-2">
            {/* Table */}
            <div className="flex-1 min-h-0 flex flex-col">
              <RequestStatusesTableBody
                statuses={statuses}
                page={page}
                limit={limit}
                total={totalItems}
                refetch={handleRefetch}
                updateStatuses={updateStatusesOptimistic}
                activeCount={activeCount}
                inactiveCount={inactiveCount}
                readonlyCount={readonlyCount}
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

        {/* Mobile View (below md) */}
        <div className="md:hidden h-full">
          <MobileRequestStatusesView
            statuses={statuses}
            page={page}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={limit}
            activeCount={activeCount}
            inactiveCount={inactiveCount}
            readonlyCount={readonlyCount}
            refetch={handleRefetch}
            updateStatuses={updateStatusesOptimistic}
            addStatus={addStatusToCache}
          />
        </div>
      </div>
    </RequestStatusesActionsProvider>
  );
}

export default RequestStatusesTable;
