"use client";

import { DataTable, SettingsTableHeader } from "@/components/data-table";
import { useMemo, useState, useCallback } from "react";
import type { SystemMessageResponse } from "@/types/system-messages";
import { createSystemMessagesTableColumns } from "./system-messages-table-columns";
import { AddMessageButton } from "../actions/add-message-button";
import { useSystemMessagesActions } from "../../context/system-messages-actions-context";
import { EditSystemMessageSheet } from "../modal";
import { ViewSystemMessageSheet } from "../modal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { bulkUpdateSystemMessageStatus } from "@/lib/api/system-messages";
import { toast } from "sonner";

interface SystemMessagesTableBodyProps {
  messages: SystemMessageResponse[];
  page: number;
  limit: number;
  total: number;
  isLoading?: boolean;
  refetch: () => void;
  updateMessages: (updatedMessages: SystemMessageResponse[]) => Promise<void>;
  addMessage?: (newMessage: SystemMessageResponse) => Promise<void>;
  activeCount: number;
  inactiveCount: number;
}

export function SystemMessagesTableBody({
  messages,
  page,
  limit,
  total,
  isLoading,
  refetch,
  updateMessages,
  addMessage,
  activeCount,
  inactiveCount,
}: SystemMessagesTableBodyProps) {
  const [tableInstance, setTableInstance] = useState<import('@tanstack/react-table').Table<SystemMessageResponse> | null>(null);
  const [selectedMessages, setSelectedMessages] = useState<SystemMessageResponse[]>([]);
  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set());
  const [editingMessage, setEditingMessage] = useState<SystemMessageResponse | null>(null);
  const [viewingMessage, setViewingMessage] = useState<SystemMessageResponse | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const isUpdating = updatingIds.size > 0;
  const { handleToggleStatus, handleDelete } = useSystemMessagesActions();

  const selectedIds = selectedMessages.map((message) => message.id).filter(Boolean) as number[];

  /**
   * Mark messages as being updated
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
    setSelectedMessages([]);
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
      await handleToggleStatus(String(id));
      refetch();
    } finally {
      clearUpdating([id]);
    }
  }, [handleToggleStatus, markUpdating, clearUpdating, refetch]);

  /**
   * Handle view message
   */
  const handleViewMessage = useCallback((message: SystemMessageResponse) => {
    setViewingMessage(message);
  }, []);

  /**
   * Handle edit message
   */
  const handleEditMessage = useCallback((message: SystemMessageResponse) => {
    setEditingMessage(message);
  }, []);

  /**
   * Handle delete confirmation
   */
  const handleDeleteClick = useCallback((messageId: number) => {
    setDeletingId(messageId);
  }, []);

  /**
   * Handle delete confirm action
   */
  const handleDeleteConfirm = useCallback(async () => {
    if (deletingId !== null) {
      try {
        await handleDelete(String(deletingId));
        setDeletingId(null);
        refetch();
      } catch (error) {
        // Error already handled in context, just close dialog
        setDeletingId(null);
      }
    }
  }, [deletingId, handleDelete, refetch]);

  /**
   * Handle bulk enable messages
   */
  const handleEnableMessages = useCallback(async (ids: number[]) => {
    if (ids.length === 0) return;

    markUpdating(ids);
    try {
      const updatedMessages = await bulkUpdateSystemMessageStatus(ids, true);
      await updateMessages(updatedMessages);
      toast.success(`${ids.length} message(s) enabled successfully`);
      handleClearSelection();
    } catch (error) {
      toast.error('Failed to enable messages');
      console.error(error);
    } finally {
      clearUpdating(ids);
    }
  }, [markUpdating, clearUpdating, updateMessages, handleClearSelection]);

  /**
   * Handle bulk disable messages
   */
  const handleDisableMessages = useCallback(async (ids: number[]) => {
    if (ids.length === 0) return;

    markUpdating(ids);
    try {
      const updatedMessages = await bulkUpdateSystemMessageStatus(ids, false);
      await updateMessages(updatedMessages);
      toast.success(`${ids.length} message(s) disabled successfully`);
      handleClearSelection();
    } catch (error) {
      toast.error('Failed to disable messages');
      console.error(error);
    } finally {
      clearUpdating(ids);
    }
  }, [markUpdating, clearUpdating, updateMessages, handleClearSelection]);

  // Create columns with actions
  const columns = useMemo(
    () =>
      createSystemMessagesTableColumns({
        updatingIds,
        onView: handleViewMessage,
        onEdit: handleEditMessage,
        onDelete: handleDeleteClick,
      }),
    [updatingIds, handleViewMessage, handleEditMessage, handleDeleteClick]
  );

  // Memoize sorted data
  const tableData = useMemo(() => messages, [messages]);

  return (
    <>
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
            itemName: "message",
          }}
          search={{
            placeholder: "Search messages...",
            urlParam: "title",
          }}
          addButton={<AddMessageButton onAdd={() => {}} addMessage={addMessage} />}
          bulkActions={{
            onDisable: handleDisableMessages,
            onEnable: handleEnableMessages,
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
            onRowSelectionChange={setSelectedMessages}
            renderToolbar={() => null}
            enableRowSelection={true}
            enableSorting={false}
            _isLoading={isLoading}
          />
        </div>
      </div>

      {/* Modals */}
      {editingMessage && (
        <EditSystemMessageSheet
          message={editingMessage}
          onOpenChange={(open) => {
            if (!open) {
              setEditingMessage(null);
              refetch();
            }
          }}
        />
      )}

      {viewingMessage && (
        <ViewSystemMessageSheet
          message={viewingMessage}
          onOpenChange={(open) => !open && setViewingMessage(null)}
        />
      )}

      <AlertDialog open={deletingId !== null} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete System Message</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this message template? This action cannot be undone.
            {deletingId && (
              <>
                <br />
                <br />
                <strong className="text-destructive">Warning:</strong> If this message is linked to any system events,
                the deletion will fail. Please remove all event associations first.
              </>
            )}
          </AlertDialogDescription>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-600">
              Delete
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
