"use client";

import {
  DynamicTableBar,
  RefreshButton,
  SearchInput,
  SelectionDisplay,
  DeleteButton,
  UpdateVersionButton,
  ColumnToggleButton,
} from "@/components/data-table";
import type { Table } from "@tanstack/react-table";
import type { ActiveSession } from "@/types/sessions";
import { SessionStatusFilter } from "./session-status-filter";

interface SessionsTableControllerProps {
  selectedIds: string[];
  selectedSessions: ActiveSession[];
  isUpdating: boolean;
  onClearSelection: () => void;
  onDeleteSessions: (ids: string[]) => void;
  onUpdateVersion: (ids: string[]) => void;
  onRefresh: () => void;
  totalCount: number;
  activeCount: number;
  inactiveCount: number;
  isValidating?: boolean;
  tableInstance: Table<ActiveSession> | null;
  latestVersion?: string | null;
}

/**
 * Controller section of the sessions table with bulk actions
 */
export function SessionsTableController({
  selectedIds,
  selectedSessions,
  isUpdating,
  onClearSelection,
  onDeleteSessions,
  onUpdateVersion,
  onRefresh,
  totalCount,
  activeCount,
  inactiveCount,
  isValidating = false,
  tableInstance,
  latestVersion,
}: SessionsTableControllerProps) {
  // Wrapper function to pass string IDs to DeleteButton
  const handleDelete = (ids: number[] | string[]) => {
    const stringIds = ids.map(id => String(id));
    onDeleteSessions(stringIds);
  };

  // Filter to only desktop sessions that can receive updates
  const updatableSessionIds = selectedSessions
    .filter(s => s.sessionType === 'desktop' && s.status === 'active')
    .map(s => s.id) as string[];

  const handleUpdateVersion = () => {
    onUpdateVersion(updatableSessionIds);
  };

  return (
    <div className="shrink-0">
      <DynamicTableBar
        variant="controller"
        hasSelection={selectedIds.length > 0}
        left={
          <div className="flex items-center gap-4">
            <SessionStatusFilter
              totalCount={totalCount}
              activeCount={activeCount}
              inactiveCount={inactiveCount}
            />
            <SelectionDisplay
              selectedCount={selectedIds.length}
              onClearSelection={onClearSelection}
              itemName="session"
            />
          </div>
        }
        right={
          <div className="flex items-center gap-2">
            <SearchInput
              placeholder="Search sessions..."
              debounceMs={500}
            />
            <UpdateVersionButton
              selectedIds={updatableSessionIds}
              onUpdate={handleUpdateVersion}
              disabled={isUpdating}
              itemName="client"
              targetVersion={latestVersion}
            />
            <DeleteButton
              selectedIds={selectedIds}
              onDelete={handleDelete}
              disabled={isUpdating}
              itemName="session"
            />
            <RefreshButton onRefresh={onRefresh} isLoading={isValidating} />
            {tableInstance && <ColumnToggleButton table={tableInstance} />}
          </div>
        }
      />
    </div>
  );
}
