"use client";

import { DataTable, SettingsTableHeader } from "@/components/data-table";
import { useMemo, useState, useCallback } from "react";
import type { RequestType } from "@/types/request-types";
import { createRequestTypesTableColumns } from "./request-types-table-columns";
import { AddTypeButton } from "../actions/add-type-button";
import { useRequestTypesTableActions } from "./request-types-table-actions";
import { useRequestTypesActions } from "../../context/request-types-actions-context";
import { EditRequestTypeSheet } from "../modal";
import { ViewRequestTypeSheet } from "../modal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface RequestTypesTableBodyProps {
  types: RequestType[];
  page: number;
  limit: number;
  total: number;
  isLoading?: boolean;
  refetch: () => void;
  updateTypes: (updatedTypes: RequestType[]) => Promise<void>;
  activeCount: number;
  inactiveCount: number;
}

export function RequestTypesTableBody({
  types,
  page,
  limit,
  total,
  isLoading,
  refetch,
  updateTypes,
  activeCount,
  inactiveCount,
}: RequestTypesTableBodyProps) {
  const [tableInstance, setTableInstance] = useState<import('@tanstack/react-table').Table<RequestType> | null>(null);
  const [selectedTypes, setSelectedTypes] = useState<RequestType[]>([]);
  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set());
  const isUpdating = updatingIds.size > 0;
  const { handleToggleStatus, handleDelete } = useRequestTypesActions();

  // Modal states
  const [editingType, setEditingType] = useState<RequestType | null>(null);
  const [viewingType, setViewingType] = useState<RequestType | null>(null);
  const [deletingType, setDeletingType] = useState<RequestType | null>(null);

  const selectedIds = selectedTypes.map((type) => type.id).filter(Boolean) as number[];

  /**
   * Mark types as being updated
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
    setSelectedTypes([]);
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
      await handleToggleStatus(id.toString());
      // Don't refetch - handleToggleStatus already does optimistic update
    } finally {
      clearUpdating([id]);
    }
  }, [handleToggleStatus, markUpdating, clearUpdating]);

  // Get bulk action handlers
  const { handleDisable, handleEnable } = useRequestTypesTableActions({
    types,
    updateTypes,
    refetch,
    markUpdating,
    clearUpdating,
  });

  // Handle delete confirmation
  const handleDeleteConfirm = useCallback(async () => {
    if (deletingType) {
      await handleDelete(String(deletingType.id));
      setDeletingType(null);
      refetch();
    }
  }, [deletingType, handleDelete, refetch]);

  // Create columns with actions
  const columns = useMemo(
    () =>
      createRequestTypesTableColumns({
        updatingIds,
        onToggleStatus: handleToggleWithUpdating,
        onView: setViewingType,
        onEdit: setEditingType,
        onDelete: setDeletingType,
      }),
    [updatingIds, handleToggleWithUpdating]
  );

  // Memoize sorted data
  const tableData = useMemo(() => types, [types]);

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
          itemName: "type",
        }}
        search={{
          placeholder: "Search types...",
          urlParam: "name",
        }}
        addButton={<AddTypeButton onAdd={handleRefresh} />}
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
          onRowSelectionChange={setSelectedTypes}
          renderToolbar={() => null}
          enableRowSelection={true}
          enableSorting={false}
          _isLoading={isLoading}
        />
      </div>

      {/* Modals */}
      {editingType && (
        <EditRequestTypeSheet
          type={editingType}
          onOpenChange={(open) => {
            if (!open) {
              setEditingType(null);
              refetch();
            }
          }}
        />
      )}

      {viewingType && (
        <ViewRequestTypeSheet
          type={viewingType}
          onOpenChange={(open) => !open && setViewingType(null)}
        />
      )}

      <AlertDialog open={deletingType !== null} onOpenChange={() => setDeletingType(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete Request Type</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete &quot;{deletingType?.nameEn}&quot;? This action cannot be undone.
          </AlertDialogDescription>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-600">
              Delete
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
