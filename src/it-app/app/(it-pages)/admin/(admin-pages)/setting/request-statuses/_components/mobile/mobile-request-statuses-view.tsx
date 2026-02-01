"use client";

import type { RequestStatusResponse } from "@/types/request-statuses";
import { MobileToolbar } from "./mobile-toolbar";
import { MobileStatusFilter } from "./mobile-status-filter";
import { MobileStatusesList } from "./mobile-statuses-list";
import { MobilePagination } from "./mobile-pagination";

interface MobileRequestStatusesViewProps {
  statuses: RequestStatusResponse[];
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  // Status counts (within selected filter)
  activeCount: number;
  inactiveCount: number;
  readonlyCount: number;
  refetch: () => void;
  updateStatuses: (updatedStatuses: RequestStatusResponse[]) => void;
  addStatus: (newStatus: RequestStatusResponse) => void;
  isValidating?: boolean;
}

/**
 * Complete mobile view for the Request Statuses table
 * Includes toolbar, filters, list, and pagination
 * Full feature parity with desktop view
 */
export function MobileRequestStatusesView({
  statuses,
  page,
  totalPages,
  totalItems,
  pageSize,
  activeCount,
  inactiveCount,
  readonlyCount,
  refetch,
  updateStatuses,
  addStatus,
  isValidating = false,
}: MobileRequestStatusesViewProps) {
  // Calculate total for status filter (sum of active + inactive)
  const totalCount = activeCount + inactiveCount;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Toolbar: Search, Add Status, Refresh */}
      <MobileToolbar
        onRefresh={refetch}
        addStatus={addStatus}
        isRefreshing={isValidating}
      />

      {/* Filters Section */}
      <div className="sticky top-[57px] z-10 bg-background border-b shadow-sm">
        <div className="space-y-1 py-1">
          {/* Status Filter: All / Active / Inactive */}
          <MobileStatusFilter
            activeCount={activeCount}
            inactiveCount={inactiveCount}
            totalCount={totalCount}
          />
        </div>
      </div>

      {/* Statuses List */}
      <div className="flex-1 overflow-hidden">
        <MobileStatusesList
          statuses={statuses}
          refetch={refetch}
          updateStatuses={updateStatuses}
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
