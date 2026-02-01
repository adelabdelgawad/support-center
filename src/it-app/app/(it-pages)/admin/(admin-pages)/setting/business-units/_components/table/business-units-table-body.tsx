"use client";

import { DataTable, SettingsTableHeader } from "@/components/data-table";
import { useMemo, useState, useCallback } from "react";
import type { BusinessUnitResponse } from "@/types/business-units";
import type { BusinessUnitRegionResponse } from "@/types/business-unit-regions";
import { createBusinessUnitsTableColumns } from "./business-units-table-columns";
import { AddBusinessUnitButton } from "../actions/add-business-unit-button";
import { useBusinessUnitsTableActions } from "./business-units-table-actions";
import { InlineActions } from "../actions/inline-actions";
import { useBusinessUnitsActions } from "../../context/business-units-actions-context";

interface BusinessUnitsTableBodyProps {
  businessUnits: BusinessUnitResponse[];
  regions: BusinessUnitRegionResponse[];
  page: number;
  limit: number;
  total: number;
  isLoading?: boolean;
  refetch: () => void;
  updateBusinessUnits: (updatedUnits: BusinessUnitResponse[]) => void;
  addBusinessUnit?: (newUnit: BusinessUnitResponse) => void;
  activeCount: number;
  inactiveCount: number;
}

export function BusinessUnitsTableBody({
  businessUnits,
  regions,
  page,
  limit,
  total,
  isLoading,
  refetch,
  updateBusinessUnits,
  addBusinessUnit,
  activeCount,
  inactiveCount,
}: BusinessUnitsTableBodyProps) {
  const [tableInstance, setTableInstance] = useState<import('@tanstack/react-table').Table<BusinessUnitResponse> | null>(null);
  const [selectedUnits, setSelectedUnits] = useState<BusinessUnitResponse[]>([]);
  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set());
  const isUpdating = updatingIds.size > 0;
  const { handleToggleStatus } = useBusinessUnitsActions();

  const selectedIds = selectedUnits.map((unit) => unit.id).filter(Boolean) as number[];

  /**
   * Mark business units as being updated
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
    setSelectedUnits([]);
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
  const { handleDisable, handleEnable } = useBusinessUnitsTableActions({
    businessUnits,
    updateBusinessUnits,
    refetch,
    markUpdating,
    clearUpdating,
  });

  // Create columns with actions
  const columns = useMemo(
    () =>
      createBusinessUnitsTableColumns({
        updatingIds,
        onToggleStatus: handleToggleWithUpdating,
        regions,
      }).map((column) => {
        // Special handling for actions column to include InlineActions
        if (column.id === "actions") {
          return {
            ...column,
            cell: ({ row }: { row: { original: BusinessUnitResponse } }) => {
              const isRowUpdating = Boolean(
                row.original.id && updatingIds.has(row.original.id)
              );
              return (
                <div
                  className={`flex justify-center ${
                    isRowUpdating ? "opacity-60 pointer-events-none" : ""
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <InlineActions
                    businessUnit={row.original}
                    regions={regions}
                    onUpdate={refetch}
                    onBusinessUnitUpdated={(updatedUnit) => {
                      updateBusinessUnits([updatedUnit]);
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
    [updatingIds, updateBusinessUnits, refetch, handleToggleWithUpdating, regions]
  );

  // Memoize sorted data
  const tableData = useMemo(() => businessUnits, [businessUnits]);

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
          itemName: "business unit",
        }}
        search={{
          placeholder: "Search business units...",
          urlParam: "name",
        }}
        addButton={
          <AddBusinessUnitButton
            onAdd={handleRefresh}
            addBusinessUnit={addBusinessUnit}
            regions={regions}
          />
        }
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
          onRowSelectionChange={setSelectedUnits}
          renderToolbar={() => null}
          enableRowSelection={true}
          enableSorting={false}
          _isLoading={isLoading}
        />
      </div>
    </div>
  );
}
