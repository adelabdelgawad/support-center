"use client";

import type { BusinessUnitResponse } from "@/types/business-units";
import type { BusinessUnitRegionResponse } from "@/types/business-unit-regions";
import { MobileToolbar } from "./mobile-toolbar";
import { MobileStatusFilter } from "./mobile-status-filter";
import { MobileBusinessUnitsList } from "./mobile-business-units-list";
import { MobilePagination } from "./mobile-pagination";

interface MobileBusinessUnitsViewProps {
  businessUnits: BusinessUnitResponse[];
  regions: BusinessUnitRegionResponse[];
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  activeCount: number;
  inactiveCount: number;
  refetch: () => void;
  updateBusinessUnits: (updatedUnits: BusinessUnitResponse[]) => Promise<void>;
  addBusinessUnit?: (newUnit: BusinessUnitResponse) => Promise<void>;
  isValidating?: boolean;
}

/**
 * Complete mobile view for the Business Units table
 * Includes toolbar, filters, list, and pagination
 * Full feature parity with desktop view
 */
export function MobileBusinessUnitsView({
  businessUnits,
  regions,
  page,
  totalPages,
  totalItems,
  pageSize,
  activeCount,
  inactiveCount,
  refetch,
  updateBusinessUnits,
  addBusinessUnit,
  isValidating = false,
}: MobileBusinessUnitsViewProps) {
  // Calculate total count for status filter
  const totalCount = activeCount + inactiveCount;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Toolbar: Search, Add Business Unit, Refresh */}
      <MobileToolbar
        onRefresh={refetch}
        addBusinessUnit={addBusinessUnit}
        regions={regions}
        isRefreshing={isValidating}
      />

      {/* Status Filter Section */}
      <div className="sticky top-[57px] z-10 bg-background border-b shadow-sm">
        <div className="py-1">
          {/* Status Filter: All / Active / Inactive */}
          <MobileStatusFilter
            activeCount={activeCount}
            inactiveCount={inactiveCount}
            totalCount={totalCount}
          />
        </div>
      </div>

      {/* Business Units List */}
      <div className="flex-1 overflow-hidden">
        <MobileBusinessUnitsList
          businessUnits={businessUnits}
          regions={regions}
          refetch={refetch}
          updateBusinessUnits={updateBusinessUnits}
        />
      </div>

      {/* Pagination */}
      <div className="sticky bottom-0 bg-background border-t shadow-lg">
        <MobilePagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={pageSize}
          isLoading={isValidating}
        />
      </div>
    </div>
  );
}
