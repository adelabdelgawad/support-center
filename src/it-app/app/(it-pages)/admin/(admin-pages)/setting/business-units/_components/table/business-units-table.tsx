'use client';

import { useSearchParams } from 'next/navigation';
import { Pagination } from '@/components/data-table';
import { BusinessUnitsTableBody } from './business-units-table-body';
import type { BusinessUnitListResponse, BusinessUnitResponse } from '@/types/business-units';
import type { BusinessUnitRegionResponse } from '@/types/business-unit-regions';
import { useCallback, useState, useEffect } from 'react';
import { BusinessUnitsActionsProvider } from '../../context/business-units-actions-context';
import { MobileBusinessUnitsView } from '../mobile';
interface BusinessUnitsTableProps {
  initialData: BusinessUnitListResponse;
  regions: BusinessUnitRegionResponse[];
}

function BusinessUnitsTable({ initialData, regions }: BusinessUnitsTableProps) {
  const searchParams = useSearchParams();
  const [data, setData] = useState<BusinessUnitListResponse>(initialData);

  const page = Number(searchParams?.get('page') || '1');
  const limit = Number(searchParams?.get('limit') || '10');

  // Sync with initialData when it changes (server-side update)
  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  const businessUnits = data.businessUnits;
  const activeCount = data.activeCount;
  const inactiveCount = data.inactiveCount;
  const totalItems = data.total;

  /**
   * Update business units with backend-returned data and compute counts locally
   */
  const updateBusinessUnitsOptimistic = useCallback(
    (updatedUnits: BusinessUnitResponse[]) => {
      const updatedMap = new Map(updatedUnits.map((u) => [u.id, u]));

      // Update only the affected rows with backend-returned data
      const updatedUnitsList = data.businessUnits.map((unit) =>
        updatedMap.has(unit.id) ? updatedMap.get(unit.id)! : unit
      );

      // Compute count deltas from changed units
      let activeCountDelta = 0;
      for (const updated of updatedUnits) {
        const original = data.businessUnits.find((u) => u.id === updated.id);
        if (original && original.isActive !== updated.isActive) {
          activeCountDelta += updated.isActive ? 1 : -1;
        }
      }

      setData({
        ...data,
        businessUnits: updatedUnitsList,
        activeCount: data.activeCount + activeCountDelta,
        inactiveCount: data.inactiveCount - activeCountDelta,
      });
    },
    [data]
  );

  /**
   * Add new business unit to cache with backend-returned data
   */
  const addBusinessUnitToCache = useCallback(
    (newUnit: BusinessUnitResponse) => {
      setData({
        ...data,
        businessUnits: [newUnit, ...data.businessUnits],
        total: data.total + 1,
        activeCount: data.activeCount + (newUnit.isActive ? 1 : 0),
        inactiveCount: data.inactiveCount + (newUnit.isActive ? 0 : 1),
      });
    },
    [data]
  );

  const handleRefetch = useCallback(async () => {
    // No-op for server-side rendering
  }, []);

  const totalPages = Math.ceil(totalItems / limit);

  return (
    <BusinessUnitsActionsProvider
      initialData={data}
      onUpdateOptimistic={updateBusinessUnitsOptimistic}
      onAddToCache={addBusinessUnitToCache}
      onRefetch={handleRefetch}
    >
      <div className="relative h-full bg-muted min-h-0">
        {/* Desktop View (md and up) */}
        <div className="hidden md:flex h-full p-1">
          {/* Main Content */}
          <div className="h-full flex-1 flex flex-col min-h-0 min-w-0 space-y-2">
            {/* Table */}
            <div className="flex-1 min-h-0 flex flex-col">
              <BusinessUnitsTableBody
                businessUnits={businessUnits}
                regions={regions}
                page={page}
                limit={limit}
                total={totalItems}
                refetch={handleRefetch}
                updateBusinessUnits={updateBusinessUnitsOptimistic}
                addBusinessUnit={addBusinessUnitToCache}
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
          <MobileBusinessUnitsView
            businessUnits={businessUnits}
            regions={regions}
            page={page}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={limit}
            activeCount={activeCount}
            inactiveCount={inactiveCount}
            refetch={handleRefetch}
            updateBusinessUnits={updateBusinessUnitsOptimistic}
            addBusinessUnit={addBusinessUnitToCache}
          />
        </div>
      </div>
    </BusinessUnitsActionsProvider>
  );
}

export default BusinessUnitsTable;
