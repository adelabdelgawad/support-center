"use client";

import { DataTable } from "@/components/data-table";
import { useMemo, useState, useCallback } from "react";
import type { ActiveSession } from "@/types/sessions";
import { SessionsTableController } from "./sessions-table-controller";
import { createActiveSessionsTableColumns } from "./active-sessions-table-columns";
import { toastSuccess, toastError } from "@/lib/toast";

interface SessionsTableBodyProps {
  sessions: ActiveSession[];
  totalCount: number;
  activeCount: number;
  inactiveCount: number;
  onRefresh: () => void;
  isValidating?: boolean;
  latestVersion?: string | null;
}

export function SessionsTableBody({
  sessions,
  totalCount,
  activeCount,
  inactiveCount,
  onRefresh,
  isValidating = false,
  latestVersion,
}: SessionsTableBodyProps) {
  const [tableInstance, setTableInstance] = useState<import('@tanstack/react-table').Table<ActiveSession> | null>(null);
  const [selectedSessions, setSelectedSessions] = useState<ActiveSession[]>([]);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const isUpdating = updatingIds.size > 0;

  const selectedIds = selectedSessions.map((session) => session.id).filter(Boolean) as string[];

  /**
   * Mark sessions as being updated
   */
  const markUpdating = useCallback((ids: string[]) => {
    setUpdatingIds(new Set(ids));
  }, []);

  /**
   * Clear updating state
   */
  const clearUpdating = useCallback((ids?: string[]) => {
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
    setSelectedSessions([]);
    // Also reset the table's internal selection state
    tableInstance?.resetRowSelection();
  }, [tableInstance]);

  /**
   * Delete a single session
   */
  const handleDeleteSession = useCallback(async (sessionId: string) => {
    try {
      markUpdating([sessionId]);

      const response = await fetch(`/api/sessions/${sessionId}/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ force: true }), // Force disconnect the desktop user
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to delete session');
      }

      toastSuccess('Session deleted successfully');
      onRefresh();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete session';
      toastError(errorMessage);
    } finally {
      clearUpdating([sessionId]);
    }
  }, [markUpdating, clearUpdating, onRefresh]);

  /**
   * Delete multiple sessions
   */
  const handleDeleteSessions = useCallback(async (ids: string[]) => {
    try {
      markUpdating(ids);

      // Delete sessions in parallel
      const results = await Promise.allSettled(
        ids.map(id =>
          fetch(`/api/sessions/${id}/disconnect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ force: true }), // Force disconnect the desktop users
          })
        )
      );

      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failedCount = ids.length - successCount;

      if (successCount > 0) {
        toastSuccess(`Successfully deleted ${successCount} session(s)`);
      }
      if (failedCount > 0) {
        toastError(`Failed to delete ${failedCount} session(s)`);
      }

      handleClearSelection();
      onRefresh();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete sessions';
      toastError(errorMessage);
    } finally {
      clearUpdating(ids);
    }
  }, [markUpdating, clearUpdating, handleClearSelection, onRefresh]);

  /**
   * Handle remote access for a session
   * Opens new tab immediately - session creation happens in the new tab
   */
  const handleRemoteAccess = useCallback((session: ActiveSession) => {
    console.log("[RemoteAccess] Opening remote access for user:", session.userId);

    // Open remote session connect page immediately in new tab
    // Session creation happens inside the new tab
    const remoteSessionUrl = `/remote-session/connect/${session.userId}`;
    window.open(remoteSessionUrl, "_blank", "noopener,noreferrer");
  }, []);

  /**
   * Push update notification to a single session
   */
  const handleUpdateClient = useCallback(async (session: ActiveSession) => {
    try {
      markUpdating([session.id]);

      const response = await fetch(`/api/sessions/${session.id}/push-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to push update');
      }

      const result = await response.json();
      toastSuccess(`Update notification sent to ${session.user.username} (v${result.targetVersion})`);
      onRefresh();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to push update';
      toastError(errorMessage);
    } finally {
      clearUpdating([session.id]);
    }
  }, [markUpdating, clearUpdating, onRefresh]);

  /**
   * Push update notification to multiple sessions (bulk action)
   */
  const handleUpdateVersionBulk = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;

    try {
      markUpdating(ids);

      // Push updates in parallel
      const results = await Promise.allSettled(
        ids.map(id =>
          fetch(`/api/sessions/${id}/push-update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
          })
        )
      );

      const successCount = results.filter(r => r.status === 'fulfilled' && (r.value as Response).ok).length;
      const failedCount = ids.length - successCount;

      if (successCount > 0) {
        toastSuccess(`Update notification sent to ${successCount} client(s)`);
      }
      if (failedCount > 0) {
        toastError(`Failed to notify ${failedCount} client(s)`);
      }

      handleClearSelection();
      onRefresh();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to push updates';
      toastError(errorMessage);
    } finally {
      clearUpdating(ids);
    }
  }, [markUpdating, clearUpdating, handleClearSelection, onRefresh]);

  // Column definitions with action handlers
  const columns = useMemo(
    () =>
      createActiveSessionsTableColumns({
        onRemoteAccess: handleRemoteAccess,
        onUpdateClient: handleUpdateClient,
        onDeleteSession: handleDeleteSession,
        updatingIds,
      }),
    [handleRemoteAccess, handleUpdateClient, handleDeleteSession, updatingIds]
  );

  // Memoize table data
  const tableData = useMemo(() => sessions, [sessions]);

  return (
    <div className="h-full flex flex-col min-h-0 space-y-2">
      {/* Controller Bar */}
      <SessionsTableController
        selectedIds={selectedIds}
        selectedSessions={selectedSessions}
        isUpdating={isUpdating}
        onClearSelection={handleClearSelection}
        onDeleteSessions={handleDeleteSessions}
        onUpdateVersion={handleUpdateVersionBulk}
        onRefresh={onRefresh}
        totalCount={totalCount}
        activeCount={activeCount}
        inactiveCount={inactiveCount}
        isValidating={isValidating}
        tableInstance={tableInstance}
        latestVersion={latestVersion}
      />

      {/* Table */}
      <div className="flex-1 min-h-0 flex flex-col">
        <DataTable<ActiveSession>
          columns={columns}
          _data={tableData}
          renderToolbar={() => null}
          enableRowSelection={true}
          enableSorting={true}
          _isLoading={isValidating}
          tableInstanceHook={setTableInstance}
          onRowSelectionChange={setSelectedSessions}
        />
      </div>
    </div>
  );
}
