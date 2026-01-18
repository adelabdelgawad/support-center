"use client";

import { DataTable, SettingsTableHeader } from "@/components/data-table";
import { useMemo, useState, useCallback } from "react";
import type { ClientVersion } from "@/types/client-versions";
import { createClientVersionsTableColumns } from "./client-versions-table-columns";
import { AddVersionButton } from "../actions/add-version-button";
import { ClientVersionsActions } from "../actions/version-actions-menu";
import { Pagination } from "@/components/data-table/table/pagination";

interface ClientVersionsTableBodyProps {
  versions: ClientVersion[];
  page: number;
  limit: number;
  refetch: () => void;
  updateVersions: (updatedVersions: ClientVersion[]) => Promise<void>;
  addVersion: (newVersion: ClientVersion) => Promise<void>;
  isValidating?: boolean;
  totalCount: number;
}

export default function ClientVersionsTableBody({
  versions,
  page,
  limit,
  refetch,
  updateVersions,
  addVersion,
  isValidating,
  totalCount,
}: ClientVersionsTableBodyProps) {
  const [tableInstance, setTableInstance] = useState<import('@tanstack/react-table').Table<ClientVersion> | null>(null);
  const [selectedVersions, setSelectedVersions] = useState<ClientVersion[]>([]);
  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set());
  const isUpdating = updatingIds.size > 0;

  const selectedIds = selectedVersions
    .map((v) => v.id)
    .filter(Boolean) as number[];

  /**
   * Mark versions as being updated
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
    setSelectedVersions([]);
    // Also reset the table's internal selection state
    tableInstance?.resetRowSelection();
  }, [tableInstance]);

  /**
   * Handle refresh
   */
  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  // Create columns with actions
  const columns = useMemo(
    () =>
      createClientVersionsTableColumns({
        updatingIds,
        updateVersions,
        refetch,
        markUpdating,
        clearUpdating,
      }).map((column) => {
        // Special handling for actions column to include ClientVersionsActions
        if (column.id === "actions") {
          return {
            ...column,
            cell: ({ row }: { row: { original: ClientVersion } }) => {
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
                  <ClientVersionsActions
                    version={row.original}
                    onUpdate={refetch}
                    onVersionUpdated={(updatedVersion) => {
                      // Update the specific version in the table without full refetch
                      updateVersions([updatedVersion]);
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
    [updatingIds, updateVersions, refetch, markUpdating, clearUpdating]
  );

  // Memoize sorted data
  const tableData = useMemo(() => versions, [versions]);

  const totalPages = Math.ceil(totalCount / limit);

  return (
    <div className="h-full flex flex-col min-h-0 space-y-2">
      {/* Controller Bar */}
      <SettingsTableHeader<number>
        statusFilter={{
          activeCount: versions.filter(v => v.isActive).length,
          inactiveCount: versions.filter(v => !v.isActive).length,
          totalCount: totalCount,
        }}
        selection={{
          selectedIds,
          onClearSelection: handleClearSelection,
          itemName: "version",
        }}
        search={{
          placeholder: "Search versions...",
          urlParam: "search",
        }}
        addButton={
          <AddVersionButton onAdd={handleRefresh} addVersion={addVersion} />
        }
        bulkActions={{
          onDisable: async () => {},
          onEnable: async () => {},
          isUpdating: false,
        }}
        onRefresh={handleRefresh}
        tableInstance={tableInstance}
      />

      {/* Table */}
      <div className="flex-1 min-h-0 flex flex-col">
        <DataTable<ClientVersion>
          columns={columns}
          _data={tableData}
          tableInstanceHook={(table) => setTableInstance(table)}
          onRowSelectionChange={setSelectedVersions}
          renderToolbar={() => null}
          enableRowSelection={true}
          enableSorting={true}
        />
      </div>

      {/* Pagination */}
      <div className="shrink-0 bg-card border-t border-border">
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          pageSize={limit}
          totalItems={totalCount}
        />
      </div>
    </div>
  );
}
