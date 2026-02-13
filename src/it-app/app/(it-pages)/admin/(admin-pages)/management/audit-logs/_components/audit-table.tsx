"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  DataTable,
  DynamicTableBar,
  SearchInput,
  RefreshButton,
  ColumnToggleButton,
  Pagination,
} from "@/components/data-table";
import type { Table as TanStackTable } from "@tanstack/react-table";
import { getAuditColumns } from "./audit-table-columns";
import { AuditDetailSheet } from "./audit-detail-sheet";
import { AuditFacetedFilter } from "./audit-faceted-filter";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { AuditLog, AuditLogsResponse, AuditFilterOptions } from "@/types/audit";

interface AuditTableProps {
  initialData: AuditLogsResponse;
  filterOptions: AuditFilterOptions;
}

export function AuditTable({ initialData, filterOptions }: AuditTableProps) {
  const searchParams = useSearchParams();
  const [data, setData] = useState<AuditLogsResponse>(initialData);
  const [tableInstance, setTableInstance] = useState<TanStackTable<AuditLog> | null>(null);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const page = Number(searchParams?.get("page") || "1");
  const limit = Number(searchParams?.get("limit") || "20");

  // Sync with initialData when server re-fetches
  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  const handleViewDetail = useCallback((log: AuditLog) => {
    setSelectedLog(log);
    setSheetOpen(true);
  }, []);

  const handleFilterByCorrelation = useCallback(
    (correlationId: string) => {
      const params = new URLSearchParams(searchParams?.toString() || "");
      params.set("search", correlationId);
      params.set("page", "1");
      window.location.search = params.toString();
    },
    [searchParams]
  );

  const handleRefresh = useCallback(() => {
    // Trigger server re-fetch by re-navigating
    window.location.reload();
  }, []);

  // Check if any filters are active
  const hasActiveFilters = !!(
    searchParams?.get("action") ||
    searchParams?.get("resource_type") ||
    searchParams?.get("user_id") ||
    searchParams?.get("search")
  );

  const handleClearFilters = useCallback(() => {
    const params = new URLSearchParams();
    if (searchParams?.get("limit")) {
      params.set("limit", searchParams.get("limit")!);
    }
    window.location.search = params.toString();
  }, [searchParams]);

  // Build faceted filter options
  const actionOptions = useMemo(
    () => filterOptions.actions.map((a) => ({ label: a, value: a })),
    [filterOptions.actions]
  );
  const resourceTypeOptions = useMemo(
    () => filterOptions.resourceTypes.map((r) => ({ label: r, value: r })),
    [filterOptions.resourceTypes]
  );
  const userOptions = useMemo(
    () => filterOptions.users.map((u) => ({ label: u.fullName, value: u.userId })),
    [filterOptions.users]
  );

  const columns = useMemo(
    () => getAuditColumns(handleViewDetail),
    [handleViewDetail]
  );

  const totalPages = Math.ceil(data.pagination.totalCount / limit);

  return (
    <div className="relative h-full bg-muted min-h-0">
      <div className="hidden md:flex h-full p-1">
        <div className="h-full flex-1 flex flex-col min-h-0 min-w-0 space-y-2">
          {/* Controller Bar */}
          <div className="shrink-0">
            <DynamicTableBar
              variant="controller"
              left={
                <div className="flex items-center gap-2">
                  <AuditFacetedFilter
                    title="Action"
                    urlParam="action"
                    options={actionOptions}
                  />
                  <AuditFacetedFilter
                    title="Resource"
                    urlParam="resource_type"
                    options={resourceTypeOptions}
                  />
                  <AuditFacetedFilter
                    title="User"
                    urlParam="user_id"
                    options={userOptions}
                  />
                  {hasActiveFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClearFilters}
                      className="h-7 px-2 text-xs"
                    >
                      <X className="h-3.5 w-3.5 mr-1" />
                      Clear
                    </Button>
                  )}
                </div>
              }
              right={
                <div className="flex items-center gap-2">
                  <SearchInput
                    placeholder="Search audit logs..."
                    urlParam="search"
                    debounceMs={500}
                  />
                  <RefreshButton onRefresh={handleRefresh} />
                  {tableInstance && <ColumnToggleButton table={tableInstance} />}
                </div>
              }
            />
          </div>

          {/* Data Table */}
          <div className="flex-1 min-h-0 flex flex-col">
            <DataTable
              _data={data.data}
              columns={columns}
              tableInstanceHook={(table) => setTableInstance(table)}
              enableRowSelection={false}
              enableSorting={false}
            />
          </div>

          {/* Pagination */}
          <div className="shrink-0 bg-background border-t border-border rounded-md">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              pageSize={limit}
              totalItems={data.pagination.totalCount}
            />
          </div>
        </div>
      </div>

      {/* Detail Sheet */}
      <AuditDetailSheet
        log={selectedLog}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onFilterByCorrelation={handleFilterByCorrelation}
      />
    </div>
  );
}
