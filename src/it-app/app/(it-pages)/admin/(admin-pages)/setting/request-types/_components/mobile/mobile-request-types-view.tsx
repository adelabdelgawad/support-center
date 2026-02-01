"use client";

import type { RequestType } from "@/types/request-types";
import { MobileToolbar } from "./mobile-toolbar";
import { MobileTypeFilter } from "./mobile-type-filter";
import { MobileTypesList } from "./mobile-types-list";
import { MobilePagination } from "./mobile-pagination";

interface MobileRequestTypesViewProps {
  types: RequestType[];
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  // Type counts (within selected filter)
  activeCount: number;
  inactiveCount: number;
  refetch: () => void;
  updateTypes: (updatedTypes: RequestType[]) => void;
  addType: (newType: RequestType) => void;
  isValidating?: boolean;
}

/**
 * Complete mobile view for the Request Types table
 * Includes toolbar, filters, list, and pagination
 * Full feature parity with desktop view
 */
export function MobileRequestTypesView({
  types,
  page,
  totalPages,
  totalItems,
  pageSize,
  activeCount,
  inactiveCount,
  refetch,
  updateTypes,
  addType,
  isValidating = false,
}: MobileRequestTypesViewProps) {
  // Calculate total for type filter (sum of active + inactive)
  const totalCount = activeCount + inactiveCount;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Toolbar: Search, Add Type, Refresh */}
      <MobileToolbar
        onRefresh={refetch}
        addType={addType}
        isRefreshing={isValidating}
      />

      {/* Filters Section */}
      <div className="sticky top-[57px] z-10 bg-background border-b shadow-sm">
        <div className="space-y-1 py-1">
          {/* Type Filter: All / Active / Inactive */}
          <MobileTypeFilter
            activeCount={activeCount}
            inactiveCount={inactiveCount}
            totalCount={totalCount}
          />
        </div>
      </div>

      {/* Types List */}
      <div className="flex-1 overflow-hidden">
        <MobileTypesList
          types={types}
          refetch={refetch}
          updateTypes={updateTypes}
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
