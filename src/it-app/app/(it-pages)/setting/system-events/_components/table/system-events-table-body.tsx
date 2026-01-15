"use client";

import { DataTable, SettingsTableHeader } from "@/components/data-table";
import { useMemo, useState, useCallback } from "react";
import type { SystemEventResponse } from "@/types/system-events";
import { createSystemEventsTableColumns } from "./system-events-table-columns";
import { AddEventButton } from "../actions/add-event-button";
import { toggleSystemEventStatus } from "@/lib/api/system-events";
import { toastSuccess, toastWarning, toastError } from "@/lib/toast";
import { InlineActions } from "../actions/inline-actions";
import { useSystemEventsActions } from "../../context/system-events-actions-context";

interface SystemEventsTableBodyProps {
  events: SystemEventResponse[];
  page: number;
  limit: number;
  total: number;
  isLoading?: boolean;
  refetch: () => void;
  updateEvents: (updatedEvents: SystemEventResponse[]) => Promise<void>;
  addEvent?: (newEvent: SystemEventResponse) => Promise<void>;
  activeCount: number;
  inactiveCount: number;
}

export function SystemEventsTableBody({
  events,
  page,
  limit,
  total,
  isLoading,
  refetch,
  updateEvents,
  addEvent,
  activeCount,
  inactiveCount,
}: SystemEventsTableBodyProps) {
  const [tableInstance, setTableInstance] = useState<import('@tanstack/react-table').Table<SystemEventResponse> | null>(null);
  const [selectedEvents, setSelectedEvents] = useState<SystemEventResponse[]>([]);
  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set());
  const isUpdating = updatingIds.size > 0;
  const { handleToggleStatus } = useSystemEventsActions();

  const selectedIds = selectedEvents.map((event) => event.id).filter(Boolean) as number[];

  /**
   * Mark events as being updated
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
    setSelectedEvents([]);
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
      // Don't refetch - handleToggleStatus already does optimistic update
    } finally {
      clearUpdating([id]);
    }
  }, [handleToggleStatus, markUpdating, clearUpdating]);

  /**
   * Handle bulk disable events
   */
  const handleDisable = useCallback(async (ids: number[]) => {
    if (ids.length === 0) return;

    // Filter to only active events
    const activeEventsToDisable = events.filter(
      (e) => e.id && ids.includes(e.id) && e.isActive
    );

    if (activeEventsToDisable.length === 0) {
      toastWarning("Selected events are already disabled");
      return;
    }

    const eventIdsToDisable = activeEventsToDisable.map((e) => e.id!);
    markUpdating(eventIdsToDisable);

    try {
      const updatedEvents: SystemEventResponse[] = [];
      for (const eventId of eventIdsToDisable) {
        const updated = await toggleSystemEventStatus(String(eventId));
        updatedEvents.push(updated);
      }

      if (updatedEvents.length > 0) {
        await updateEvents(updatedEvents);
      }

      toastSuccess(`Successfully disabled ${updatedEvents.length} event(s)`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toastError(`Failed to disable events: ${errorMessage}`);
    } finally {
      clearUpdating();
    }
  }, [events, markUpdating, updateEvents, clearUpdating]);

  /**
   * Handle bulk enable events
   */
  const handleEnable = useCallback(async (ids: number[]) => {
    if (ids.length === 0) return;

    // Filter to only inactive events
    const inactiveEventsToEnable = events.filter(
      (e) => e.id && ids.includes(e.id) && !e.isActive
    );

    if (inactiveEventsToEnable.length === 0) {
      toastWarning("Selected events are already enabled");
      return;
    }

    const eventIdsToEnable = inactiveEventsToEnable.map((e) => e.id!);
    markUpdating(eventIdsToEnable);

    try {
      const updatedEvents: SystemEventResponse[] = [];
      for (const eventId of eventIdsToEnable) {
        const updated = await toggleSystemEventStatus(String(eventId));
        updatedEvents.push(updated);
      }

      if (updatedEvents.length > 0) {
        await updateEvents(updatedEvents);
      }

      toastSuccess(`Successfully enabled ${updatedEvents.length} event(s)`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toastError(`Failed to enable events: ${errorMessage}`);
    } finally {
      clearUpdating();
    }
  }, [events, markUpdating, updateEvents, clearUpdating]);

  // Create columns with actions
  const columns = useMemo(
    () =>
      createSystemEventsTableColumns({
        updatingIds,
        onToggleStatus: handleToggleWithUpdating,
      }).map((column) => {
        // Special handling for actions column to include InlineActions
        if (column.id === "actions") {
          return {
            ...column,
            cell: ({ row }: { row: { original: SystemEventResponse } }) => {
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
                    event={row.original}
                    onUpdate={refetch}
                    onEventUpdated={(updatedEvent) => {
                      updateEvents([updatedEvent]);
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
    [updatingIds, updateEvents, refetch, handleToggleWithUpdating]
  );

  // Memoize sorted data
  const tableData = useMemo(() => events, [events]);

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
          itemName: "event",
        }}
        search={{
          placeholder: "Search events...",
          urlParam: "event_name",
        }}
        addButton={<AddEventButton onAdd={handleRefresh} addEvent={addEvent} />}
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
          onRowSelectionChange={setSelectedEvents}
          renderToolbar={() => null}
          enableRowSelection={true}
          enableSorting={false}
          _isLoading={isLoading}
        />
      </div>
    </div>
  );
}
