"use client";

import type { BusinessUnitRegionResponse } from "@/types/business-unit-regions";
import { MobileToolbar } from "./mobile-toolbar";
import { MobileStatusFilter } from "./mobile-status-filter";
import { MobileRegionsList } from "./mobile-regions-list";
import { MobilePagination } from "./mobile-pagination";

interface MobileRegionsViewProps {
  regions: BusinessUnitRegionResponse[];
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  activeCount: number;
  inactiveCount: number;
  refetch: () => void;
  updateRegions: (updatedRegions: BusinessUnitRegionResponse[]) => void;
  isValidating?: boolean;
}

/**
 * Complete mobile view for the Business Unit Regions table
 * Includes toolbar, filters, list, and pagination
 * Full feature parity with desktop view
 */
export function MobileRegionsView({
  regions,
  page,
  totalPages,
  totalItems,
  pageSize,
  activeCount,
  inactiveCount,
  refetch,
  updateRegions,
  isValidating = false,
}: MobileRegionsViewProps) {
  // Calculate total count for status filter
  const totalCount = activeCount + inactiveCount;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Toolbar: Search, Add Region, Refresh */}
      <MobileToolbar onRefresh={refetch} isRefreshing={isValidating} />

      {/* Filters Section */}
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

      {/* Regions List */}
      <div className="flex-1 overflow-hidden">
        <MobileRegionsList
          regions={regions}
          refetch={refetch}
          updateRegions={updateRegions}
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
