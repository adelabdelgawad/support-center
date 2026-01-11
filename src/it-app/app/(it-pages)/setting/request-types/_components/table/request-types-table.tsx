'use client';

import { useSearchParams } from 'next/navigation';
import { Pagination } from '@/components/data-table';
import { RequestTypesTableBody } from './request-types-table-body';
import type { RequestTypeListResponse, RequestType } from '@/types/request-types';
import { useCallback, useState, useEffect } from 'react';
import { RequestTypesActionsProvider } from '../../context/request-types-actions-context';
import { MobileRequestTypesView } from '../mobile';

interface RequestTypesTableProps {
  initialData: RequestTypeListResponse;
}

function RequestTypesTable({ initialData }: RequestTypesTableProps) {
  const searchParams = useSearchParams();
  const [data, setData] = useState<RequestTypeListResponse>(initialData);

  const page = Number(searchParams?.get('page') || '1');
  const limit = Number(searchParams?.get('limit') || '10');

  // Sync with initialData when it changes (server-side update)
  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  const types = data.types;
  const activeCount = data.activeCount;
  const inactiveCount = data.inactiveCount;
  const totalItems = data.total;

  /**
   * Update request types with backend-returned data
   * Uses the returned record from API - no frontend count recalculation
   * Counts will refresh on next navigation (SSR)
   */
  const updateTypesOptimistic = useCallback(
    async (updatedTypes: RequestType[]) => {
      const updatedMap = new Map(updatedTypes.map((t) => [t.id, t]));

      // Update only the affected rows with backend-returned data
      const updatedTypesList = data.types.map((type) =>
        updatedMap.has(type.id) ? updatedMap.get(type.id)! : type
      );

      // Keep existing counts - no frontend calculation
      // Counts will be accurate on next page navigation (SSR)
      const newData: RequestTypeListResponse = {
        ...data,
        types: updatedTypesList,
      };

      setData(newData);
    },
    [data]
  );

  /**
   * Add new request type to cache with backend-returned data
   * No frontend count recalculation - counts refresh on next navigation (SSR)
   */
  const addTypeToCache = useCallback(
    async (newType: RequestType) => {
      // Add the type and increment total, but don't recalculate active/inactive counts
      // Counts will be accurate on next page navigation (SSR)
      const newData: RequestTypeListResponse = {
        ...data,
        types: [newType, ...data.types],
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
    <RequestTypesActionsProvider
      initialData={data}
      onUpdateOptimistic={updateTypesOptimistic}
      onAddToCache={addTypeToCache}
      onRefetch={handleRefetch}
    >
      <div className="relative h-full bg-muted min-h-0">
        {/* Desktop View (md and up) */}
        <div className="hidden md:flex h-full p-1">
          {/* Main Content */}
          <div className="h-full flex-1 flex flex-col min-h-0 min-w-0 space-y-2">
            {/* Table */}
            <div className="flex-1 min-h-0 flex flex-col">
              <RequestTypesTableBody
                types={types}
                page={page}
                limit={limit}
                total={totalItems}
                refetch={handleRefetch}
                updateTypes={updateTypesOptimistic}
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

        {/* Mobile View (below md) */}
        <div className="md:hidden h-full">
          <MobileRequestTypesView
            types={types}
            page={page}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={limit}
            activeCount={activeCount}
            inactiveCount={inactiveCount}
            refetch={handleRefetch}
            updateTypes={updateTypesOptimistic}
            addType={addTypeToCache}
          />
        </div>
      </div>
    </RequestTypesActionsProvider>
  );
}

export default RequestTypesTable;
