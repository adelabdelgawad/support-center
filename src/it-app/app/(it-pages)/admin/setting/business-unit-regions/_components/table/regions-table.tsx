'use client';

import { useSearchParams } from 'next/navigation';
import { Pagination } from '@/components/data-table';
import { RegionsTableBody } from './regions-table-body';
import type { BusinessUnitRegionListResponse, BusinessUnitRegionResponse } from '@/types/business-unit-regions';
import { useCallback, useState, useEffect } from 'react';
import { RegionsActionsProvider } from '../../context/regions-actions-context';
import { MobileRegionsView } from '../mobile/mobile-regions-view';

interface BusinessUnitRegionsTableProps {
  initialData: BusinessUnitRegionListResponse;
}

function BusinessUnitRegionsTable({ initialData }: BusinessUnitRegionsTableProps) {
  const searchParams = useSearchParams();
  const [data, setData] = useState<BusinessUnitRegionListResponse>(initialData);

  const page = Number(searchParams?.get('page') || '1');
  const limit = Number(searchParams?.get('limit') || '10');

  // Sync with initialData when it changes (server-side update)
  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  const regions = data.regions;
  const activeCount = data.activeCount;
  const inactiveCount = data.inactiveCount;
  const totalItems = data.total;

  /**
   * Update regions with backend-returned data
   * Computes count changes locally based on status transitions
   */
  const updateRegionsOptimistic = useCallback(
    async (updatedRegions: BusinessUnitRegionResponse[]) => {
      const updatedMap = new Map(updatedRegions.map((r) => [r.id, r]));

      // Calculate count changes based on status transitions
      let activeCountDelta = 0;
      data.regions.forEach((region) => {
        const updated = updatedMap.get(region.id);
        if (updated && region.isActive !== updated.isActive) {
          activeCountDelta += updated.isActive ? 1 : -1;
        }
      });

      // Update only the affected rows with backend-returned data
      const updatedRegionsList = data.regions.map((region) =>
        updatedMap.has(region.id) ? updatedMap.get(region.id)! : region
      );

      const newData: BusinessUnitRegionListResponse = {
        ...data,
        regions: updatedRegionsList,
        activeCount: data.activeCount + activeCountDelta,
        inactiveCount: data.inactiveCount - activeCountDelta,
      };
      setData(newData);
    },
    [data]
  );

  /**
   * Add new region to cache with backend-returned data
   * Computes counts locally based on new region's status
   */
  const addRegionToCache = useCallback(
    async (newRegion: BusinessUnitRegionResponse) => {
      const newData: BusinessUnitRegionListResponse = {
        ...data,
        regions: [newRegion, ...data.regions],
        total: data.total + 1,
        activeCount: newRegion.isActive ? data.activeCount + 1 : data.activeCount,
        inactiveCount: !newRegion.isActive ? data.inactiveCount + 1 : data.inactiveCount,
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
    <RegionsActionsProvider
      initialData={data}
      onUpdateOptimistic={updateRegionsOptimistic}
      onAddToCache={addRegionToCache}
      onRefetch={handleRefetch}
    >
      <div className="relative h-full bg-muted min-h-0">
        {/* Desktop View (md and up) */}
        <div className="hidden md:flex h-full p-1">
          {/* Main Content */}
          <div className="h-full flex-1 flex flex-col min-h-0 min-w-0 space-y-2">
            {/* Table */}
            <div className="flex-1 min-h-0 flex flex-col">
              <RegionsTableBody
                regions={regions}
                page={page}
                limit={limit}
                total={totalItems}
                refetch={handleRefetch}
                updateRegions={updateRegionsOptimistic}
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
          <MobileRegionsView
            regions={regions}
            page={page}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={limit}
            activeCount={activeCount}
            inactiveCount={inactiveCount}
            refetch={handleRefetch}
            updateRegions={updateRegionsOptimistic}
          />
        </div>
      </div>
    </RegionsActionsProvider>
  );
}

export default BusinessUnitRegionsTable;
