'use client';

import { useSearchParams } from 'next/navigation';
import { Pagination } from '@/components/data-table';
import { RequestStatusesTableBody } from './request-statuses-table-body';
import type { RequestStatusListResponse, RequestStatusResponse } from '@/types/request-statuses';
import { useCallback, useState, useEffect } from 'react';
import { RequestStatusesActionsProvider } from '../../context/request-statuses-actions-context';
import { MobileRequestStatusesView } from '../mobile';

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
   * Computes count changes locally based on status transitions
   */
  const updateStatusesOptimistic = useCallback(
    async (updatedStatuses: RequestStatusResponse[]) => {
      const updatedMap = new Map(updatedStatuses.map((s) => [s.id, s]));

      // Calculate count changes based on status transitions
      let activeCountDelta = 0;
      data.statuses.forEach((status) => {
        const updated = updatedMap.get(status.id);
        if (updated && status.isActive !== updated.isActive) {
          activeCountDelta += updated.isActive ? 1 : -1;
        }
      });

      // Update only the affected rows with backend-returned data
      const updatedStatusesList = data.statuses.map((status) =>
        updatedMap.has(status.id) ? updatedMap.get(status.id)! : status
      );

      const newData: RequestStatusListResponse = {
        ...data,
        statuses: updatedStatusesList,
        activeCount: data.activeCount + activeCountDelta,
        inactiveCount: data.inactiveCount - activeCountDelta,
      };
      setData(newData);
    },
    [data]
  );

  /**
   * Add new request status to cache with backend-returned data
   * Computes counts locally based on new status's state
   */
  const addStatusToCache = useCallback(
    async (newStatus: RequestStatusResponse) => {
      const newData: RequestStatusListResponse = {
        ...data,
        statuses: [newStatus, ...data.statuses],
        total: data.total + 1,
        activeCount: newStatus.isActive ? data.activeCount + 1 : data.activeCount,
        inactiveCount: !newStatus.isActive ? data.inactiveCount + 1 : data.inactiveCount,
        readonlyCount: newStatus.readonly ? data.readonlyCount + 1 : data.readonlyCount,
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
