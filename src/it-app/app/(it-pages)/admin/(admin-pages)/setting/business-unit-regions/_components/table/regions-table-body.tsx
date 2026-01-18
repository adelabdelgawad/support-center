"use client";

import { DataTable, SettingsTableHeader } from "@/components/data-table";
import { useMemo, useState, useCallback } from "react";
import type { BusinessUnitRegionResponse } from "@/types/business-unit-regions";
import { createRegionsTableColumns } from "./regions-table-columns";
import { AddRegionButton } from "../actions/add-region-button";
import { useRegionsTableActions } from "./regions-table-actions";
import { InlineActions } from "../actions/inline-actions";
import { useRegionsActions } from "../../context/regions-actions-context";

interface RegionsTableBodyProps {
  regions: BusinessUnitRegionResponse[];
  page: number;
  limit: number;
  total: number;
  isLoading?: boolean;
  refetch: () => void;
  updateRegions: (updatedRegions: BusinessUnitRegionResponse[]) => Promise<void>;
  activeCount: number;
  inactiveCount: number;
}

export function RegionsTableBody({
  regions,
  page,
  limit,
  total,
  isLoading,
  refetch,
  updateRegions,
  activeCount,
  inactiveCount,
}: RegionsTableBodyProps) {
  const [tableInstance, setTableInstance] = useState<import('@tanstack/react-table').Table<BusinessUnitRegionResponse> | null>(null);
  const [selectedRegions, setSelectedRegions] = useState<BusinessUnitRegionResponse[]>([]);
  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set());
  const isUpdating = updatingIds.size > 0;
  const { handleToggleStatus } = useRegionsActions();

  const selectedIds = selectedRegions.map((region) => region.id).filter(Boolean) as number[];

  /**
   * Mark regions as being updated
   */
  const markUpdating = useCallback((ids: number[]) => {
    setUpdatingIds(new Set(ids));
  }, []);

  /**
   * Clear updating state
   */
  const clearUpdating = useCallback((ids?: number[]) => {
    if (ids && ids.length > 0) {
      const newSet = new Set(updatingIds);
      ids.forEach((id) => newSet.delete(id));
      setUpdatingIds(newSet);
    } else {
      setUpdatingIds(new Set());
    }
  }, [updatingIds]);

  /**
   * Handle clear selection after bulk operations
   */
  const handleClearSelection = useCallback(() => {
    setSelectedRegions([]);
    tableInstance?.resetRowSelection();
  }, [tableInstance]);

  /**
   * Handle refresh
   */
  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  /**
   * Handle toggle status with updating state
   */
  const handleToggleWithUpdating = useCallback(async (id: number) => {
    markUpdating([id]);
    try {
      await handleToggleStatus(id);
      // Don't refetch - handleToggleStatus already does optimistic update
    } finally {
      clearUpdating([id]);
    }
  }, [handleToggleStatus, markUpdating, clearUpdating]);

  // Get bulk action handlers
  const { handleDisable, handleEnable } = useRegionsTableActions({
    regions,
    updateRegions,
    refetch,
    markUpdating,
    clearUpdating,
  });

  // Create columns with actions
  const columns = useMemo(
    () =>
      createRegionsTableColumns({
        updatingIds,
        onToggleStatus: handleToggleWithUpdating,
      }).map((column) => {
        // Special handling for actions column to include InlineActions
        if (column.id === "actions") {
          return {
            ...column,
            cell: ({ row }: { row: { original: BusinessUnitRegionResponse } }) => {
              const isRowUpdating = row.original.id ? updatingIds.has(row.original.id) : false;
              return (
                <div
                  className={`flex justify-center ${
                    isRowUpdating ? "opacity-60 pointer-events-none" : ""
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <InlineActions
                    region={row.original}
                    onUpdate={refetch}
                    onRegionUpdated={(updatedRegion) => {
                      updateRegions([updatedRegion]);
                    }}
                    disabled={isRowUpdating}
                  />
                </div>
              );
            },
          };
        }
        return column;
      }),
    [updatingIds, updateRegions, refetch, handleToggleWithUpdating]
  );

  // Memoize sorted data
  const tableData = useMemo(() => regions, [regions]);

  return (
    <div className="h-full flex flex-col min-h-0 space-y-2">
      {/* Controller Bar */}
      <SettingsTableHeader<number>
        statusFilter={{
          activeCount,
          inactiveCount,
          totalCount: total,
        }}
        selection={{
          selectedIds,
          onClearSelection: handleClearSelection,
          itemName: "region",
        }}
        search={{
          placeholder: "Search regions...",
          urlParam: "name",
        }}
        addButton={<AddRegionButton onAdd={handleRefresh} />}
        bulkActions={{
          onDisable: handleDisable,
          onEnable: handleEnable,
          isUpdating,
        }}
        onRefresh={handleRefresh}
        tableInstance={tableInstance}
        isLoading={isLoading}
      />

      {/* Data Table */}
      <div className="flex-1 min-h-0 flex flex-col">
        <DataTable
          _data={tableData}
          columns={columns}
          tableInstanceHook={(table) => setTableInstance(table)}
          onRowSelectionChange={setSelectedRegions}
          renderToolbar={() => null}
          enableRowSelection={true}
          enableSorting={false}
          _isLoading={isLoading}
        />
      </div>
    </div>
  );
}
