"use client";

import React from "react";
import { Table } from "@tanstack/react-table";
import {
  DynamicTableBar,
  SearchInput,
  StatusFilter,
  SelectionDisplay,
  DisableButton,
  EnableButton,
  RefreshButton,
  ColumnToggleButton,
} from "@/components/data-table";

/**
 * Status filter configuration
 */
interface StatusFilterConfig {
  activeCount: number;
  inactiveCount: number;
  totalCount: number;
}

/**
 * Selection state configuration
 */
interface SelectionConfig<TId> {
  selectedIds: TId[];
  onClearSelection: () => void;
  itemName: string;
}

/**
 * Search configuration
 */
interface SearchConfig {
  placeholder: string;
  urlParam: string;
  debounceMs?: number;
}

/**
 * Bulk actions configuration
 */
interface BulkActionsConfig<TId> {
  onDisable: (ids: TId[]) => void | Promise<void>;
  onEnable: (ids: TId[]) => void | Promise<void>;
  isUpdating: boolean;
}

/**
 * Feature flags for optional components
 */
interface FeatureFlags {
  showSearch?: boolean;
  showDisable?: boolean;
  showEnable?: boolean;
  showRefresh?: boolean;
  showColumnToggle?: boolean;
  showStatusFilter?: boolean;
  showSelectionDisplay?: boolean;
}

/**
 * Props for the SettingsTableHeader component
 */
export interface SettingsTableHeaderProps<TId extends string | number = number> {
  /** Status filter counts */
  statusFilter: StatusFilterConfig;

  /** Selection state */
  selection: SelectionConfig<TId>;

  /** Search configuration (optional) */
  search?: SearchConfig;

  /** Add button - page-specific component */
  addButton: React.ReactNode;

  /** Bulk actions configuration */
  bulkActions: BulkActionsConfig<TId>;

  /** Refresh callback */
  onRefresh: () => void;

  /** Table instance for column toggle (pass null to hide) */
  tableInstance: Table<any> | null;

  /** Optional feature flags to show/hide components */
  features?: FeatureFlags;

  /** Optional loading state for refresh button */
  isLoading?: boolean;
}

/**
 * Standardized header control panel for all Settings pages.
 *
 * Ensures consistent button order across all settings tables:
 * Left Panel:  [StatusFilter] [SelectionDisplay]
 * Right Panel: [Search] [Add] [Disable] [Enable] [Refresh] [Columns]
 *
 * @example
 * ```tsx
 * <SettingsTableHeader<number>
 *   statusFilter={{ activeCount, inactiveCount, totalCount }}
 *   selection={{
 *     selectedIds,
 *     onClearSelection: handleClearSelection,
 *     itemName: "region",
 *   }}
 *   search={{ placeholder: "Search regions...", urlParam: "name" }}
 *   addButton={<AddRegionButton onAdd={onRefresh} />}
 *   bulkActions={{
 *     onDisable: handleDisable,
 *     onEnable: handleEnable,
 *     isUpdating,
 *   }}
 *   onRefresh={handleRefresh}
 *   tableInstance={tableInstance}
 * />
 * ```
 */
export function SettingsTableHeader<TId extends string | number = number>({
  statusFilter,
  selection,
  search,
  addButton,
  bulkActions,
  onRefresh,
  tableInstance,
  features = {},
  isLoading = false,
}: SettingsTableHeaderProps<TId>) {
  // Merge feature flags with defaults (all features enabled by default)
  const {
    showSearch = true,
    showDisable = true,
    showEnable = true,
    showRefresh = true,
    showColumnToggle = true,
    showStatusFilter = true,
    showSelectionDisplay = true,
  } = features;

  const hasSelection = selection.selectedIds.length > 0;

  // Type-safe handler wrappers for shared components that expect union types
  const handleDisable = (ids: number[] | string[]) => {
    bulkActions.onDisable(ids as TId[]);
  };

  const handleEnable = (ids: number[] | string[]) => {
    bulkActions.onEnable(ids as TId[]);
  };

  return (
    <div className="shrink-0">
      <DynamicTableBar
        variant="controller"
        hasSelection={hasSelection}
        left={
          <div className="flex items-center gap-4">
            {showStatusFilter && (
              <StatusFilter
                activeCount={statusFilter.activeCount}
                inactiveCount={statusFilter.inactiveCount}
                totalCount={statusFilter.totalCount}
              />
            )}
            {showSelectionDisplay && (
              <SelectionDisplay
                selectedCount={selection.selectedIds.length}
                onClearSelection={selection.onClearSelection}
                itemName={selection.itemName}
              />
            )}
          </div>
        }
        right={
          <div className="flex items-center gap-2">
            {/* Fixed Order: Search -> Add -> Disable -> Enable -> Refresh -> Columns */}
            {showSearch && search && (
              <SearchInput
                placeholder={search.placeholder}
                urlParam={search.urlParam}
                debounceMs={search.debounceMs ?? 500}
              />
            )}
            {addButton}
            {showDisable && (
              <DisableButton
                selectedIds={selection.selectedIds as (number[] | string[])}
                onDisable={handleDisable}
                disabled={bulkActions.isUpdating}
              />
            )}
            {showEnable && (
              <EnableButton
                selectedIds={selection.selectedIds as (number[] | string[])}
                onEnable={handleEnable}
                disabled={bulkActions.isUpdating}
              />
            )}
            {showRefresh && (
              <RefreshButton onRefresh={onRefresh} isLoading={isLoading} />
            )}
            {showColumnToggle && tableInstance && (
              <ColumnToggleButton table={tableInstance} />
            )}
          </div>
        }
      />
    </div>
  );
}
