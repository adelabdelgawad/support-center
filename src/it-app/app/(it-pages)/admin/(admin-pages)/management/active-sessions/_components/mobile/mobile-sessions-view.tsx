"use client";

import type { ActiveSession } from "@/types/sessions";
import { MobileToolbar } from "./mobile-toolbar";
import { MobileStatusFilter } from "./mobile-status-filter";
import { MobileVersionFilter } from "./mobile-version-filter";
import { MobileSessionsList } from "./mobile-sessions-list";
import { MobilePagination } from "./mobile-pagination";

interface MobileSessionsViewProps {
  sessions: ActiveSession[];
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  sessionCounts: {
    total: number;
    active: number;
    inactive: number;
  };
  versionMetrics: {
    total: number;
    ok: number;
    outdated: number;
    outdatedEnforced: number;
    unknown: number;
  };
  refetch: () => void;
  isValidating?: boolean;
}

/**
 * Complete mobile view for the Active Sessions table
 * Includes toolbar, filters, list, and pagination
 * Full feature parity with desktop view
 */
export function MobileSessionsView({
  sessions,
  page,
  totalPages,
  totalItems,
  pageSize,
  sessionCounts,
  versionMetrics,
  refetch,
  isValidating = false,
}: MobileSessionsViewProps) {
  return (
    <div className="flex flex-col h-full bg-background">
      {/* Toolbar: Search, Refresh */}
      <MobileToolbar onRefresh={refetch} isRefreshing={isValidating} />

      {/* Filters Section */}
      <div className="sticky top-[57px] z-10 bg-background border-b shadow-sm">
        <div className="space-y-1 py-1">
          {/* Status Filter: All / Active / Inactive */}
          <div className="border-b border-border/50 pb-1">
            <MobileStatusFilter
              activeCount={sessionCounts.active}
              inactiveCount={sessionCounts.inactive}
              totalCount={sessionCounts.total}
            />
          </div>

          {/* Version Status Filter */}
          <MobileVersionFilter versionMetrics={versionMetrics} />
        </div>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-hidden">
        <MobileSessionsList sessions={sessions} />
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
