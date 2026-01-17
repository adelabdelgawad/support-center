"use client";

import { DataTable, SettingsTableHeader } from "@/components/data-table";
import { useMemo, useState, useCallback } from "react";
import type { RequestStatusResponse } from "@/types/request-statuses";
import { createRequestStatusesTableColumns } from "./request-statuses-table-columns";
import { AddStatusButton } from "../actions/add-status-button";
import { useRequestStatusesTableActions } from "./request-statuses-table-actions";
import { useRequestStatusesActions } from "../../context/request-statuses-actions-context";
import { EditRequestStatusSheet } from "../modal";
import { ViewRequestStatusSheet } from "../modal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface RequestStatusesTableBodyProps {
  statuses: RequestStatusResponse[];
  page: number;
  limit: number;
  total: number;
  isLoading?: boolean;
  refetch: () => void;
  updateStatuses: (updatedStatuses: RequestStatusResponse[]) => Promise<void>;
  activeCount: number;
  inactiveCount: number;
  readonlyCount: number;
}

export function RequestStatusesTableBody({
  statuses,
  page,
  limit,
  total,
  isLoading,
  refetch,
  updateStatuses,
  activeCount,
  inactiveCount,
  readonlyCount,
}: RequestStatusesTableBodyProps) {
  const [tableInstance, setTableInstance] = useState<import('@tanstack/react-table').Table<RequestStatusResponse> | null>(null);
  const [selectedStatuses, setSelectedStatuses] = useState<RequestStatusResponse[]>([]);
  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set());
  const isUpdating = updatingIds.size > 0;
  const { handleToggleStatus, handleDelete } = useRequestStatusesActions();

  // Modal states
  const [editingStatus, setEditingStatus] = useState<RequestStatusResponse | null>(null);
  const [viewingStatus, setViewingStatus] = useState<RequestStatusResponse | null>(null);
  const [deletingStatus, setDeletingStatus] = useState<RequestStatusResponse | null>(null);

  const selectedIds = selectedStatuses.map((status) => status.id).filter(Boolean) as number[];

  /**
   * Mark statuses as being updated
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
    setSelectedStatuses([]);
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

  /**
   * Handle toggle requester visibility with updating state
   */
  const handleToggleRequesterVisibility = useCallback(async (id: number, currentValue: boolean) => {
    markUpdating([id]);
    try {
      const { updateRequestStatus } = await import('@/lib/api/request-statuses');
      const { toastSuccess, toastError } = await import('@/lib/toast');
      const updated = await updateRequestStatus(String(id), {
        visibleOnRequesterPage: !currentValue,
      });
      await updateStatuses([updated]);
      toastSuccess(`Status ${!currentValue ? 'will be visible' : 'will be hidden'} to requester`);
    } catch (error) {
      const { toastError } = await import('@/lib/toast');
      toastError(error instanceof Error ? error.message : 'Failed to update visibility');
    } finally {
      clearUpdating([id]);
    }
  }, [markUpdating, clearUpdating, updateStatuses]);

  /**
   * Handle toggle count as solved with updating state
   */
  const handleToggleCountAsSolved = useCallback(async (id: number, currentValue: boolean) => {
    markUpdating([id]);
    try {
      const { updateRequestStatus } = await import('@/lib/api/request-statuses');
      const { toastSuccess, toastError } = await import('@/lib/toast');
      const updated = await updateRequestStatus(String(id), {
        countAsSolved: !currentValue,
      });
      await updateStatuses([updated]);
      toastSuccess(`Status ${!currentValue ? 'counts' : 'no longer counts'} as solved`);
    } catch (error) {
      const { toastError } = await import('@/lib/toast');
      toastError(error instanceof Error ? error.message : 'Failed to update status');
    } finally {
      clearUpdating([id]);
    }
  }, [markUpdating, clearUpdating, updateStatuses]);

  // Get bulk action handlers
  const { handleDisable, handleEnable } = useRequestStatusesTableActions({
    statuses,
    updateStatuses,
    refetch,
    markUpdating,
    clearUpdating,
  });

  // Handle delete confirmation
  const handleDeleteConfirm = useCallback(async () => {
    if (deletingStatus) {
      await handleDelete(String(deletingStatus.id));
      setDeletingStatus(null);
      refetch();
    }
  }, [deletingStatus, handleDelete, refetch]);

  // Create columns with actions
  const columns = useMemo(
    () =>
      createRequestStatusesTableColumns({
        updatingIds,
        onToggleRequesterVisibility: handleToggleRequesterVisibility,
        onToggleCountAsSolved: handleToggleCountAsSolved,
        onView: setViewingStatus,
        onEdit: setEditingStatus,
        onDelete: setDeletingStatus,
      }),
    [updatingIds, handleToggleRequesterVisibility, handleToggleCountAsSolved]
  );

  // Memoize sorted data
  const tableData = useMemo(() => statuses, [statuses]);

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
          itemName: "status",
        }}
        search={{
          placeholder: "Search statuses...",
          urlParam: "name",
        }}
        addButton={<AddStatusButton onAdd={handleRefresh} />}
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
          onRowSelectionChange={setSelectedStatuses}
          renderToolbar={() => null}
          enableRowSelection={true}
          enableSorting={false}
          _isLoading={isLoading}
        />
      </div>

      {/* Modals */}
      {editingStatus && (
        <EditRequestStatusSheet
          status={editingStatus}
          onOpenChange={(open) => {
            if (!open) {
              setEditingStatus(null);
              refetch();
            }
          }}
        />
      )}

      {viewingStatus && (
        <ViewRequestStatusSheet
          status={viewingStatus}
          onOpenChange={(open) => !open && setViewingStatus(null)}
        />
      )}

      <AlertDialog open={deletingStatus !== null} onOpenChange={() => setDeletingStatus(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete Request Status</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete &quot;{deletingStatus?.name}&quot;? This action cannot be undone.
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
