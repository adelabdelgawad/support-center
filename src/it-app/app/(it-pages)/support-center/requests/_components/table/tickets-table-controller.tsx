"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DynamicTableBar,
  SearchInput,
  ColumnToggleButton,
  SelectionDisplay,
} from "@/components/data-table";
import { ViewFilter } from "../filters/view-filter";
import { RequestScopeFilter } from "../filters/request-scope-filter";
import { BusinessUnitFilter } from "../filters/business-unit-filter";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowUpDown } from "lucide-react";
import { api } from "@/lib/fetch/client";
import { toastSuccess, toastError } from "@/lib/toast";
import type { Table } from "@tanstack/react-table";
import type { TicketListItem, StatusInfo, BusinessUnitCount } from "@/lib/types/api/requests";

interface TicketsTableControllerProps {
  // View filter state
  viewItems: Array<{ key: string; name: string; count: number }>;
  activeViewKey: string;

  // Scope filter counts
  allCount: number;
  myCount: number;

  // Business unit data (counts filtered by current view)
  businessUnits: BusinessUnitCount[];

  // Selection state
  selectedIds: number[];
  onClearSelection: () => void;

  // Refresh handler
  onRefresh: () => void;
  isValidating?: boolean;

  // Table instance for column toggle and selection management
  tableInstance: Table<TicketListItem> | null;
}

/**
 * Controller toolbar for the tickets table
 *
 * Layout:
 * Left:  [ViewFilter] [RequestScopeFilter] [SelectionDisplay]
 * Right: [BusinessUnitFilter] [Search] [ChangeStatus] [Columns]
 */
export function TicketsTableController({
  viewItems,
  activeViewKey,
  allCount,
  myCount,
  businessUnits,
  selectedIds,
  onClearSelection,
  onRefresh,
  isValidating = false,
  tableInstance,
}: TicketsTableControllerProps) {
  const [statuses, setStatuses] = useState<StatusInfo[]>([]);
  const [isChangingStatus, setIsChangingStatus] = useState(false);

  // Fetch available statuses on mount
  useEffect(() => {
    async function fetchStatuses() {
      try {
        const response = await api.get<{
          statuses: StatusInfo[];
          total: number;
          activeCount: number;
          inactiveCount: number;
          readonlyCount: number;
        }>("/api/request-statuses?is_active=true");
        setStatuses(response.statuses || []);
      } catch {
        // Silently fail - button will just not show statuses
      }
    }
    fetchStatuses();
  }, []);

  const handleChangeStatus = useCallback(
    async (statusId: number) => {
      if (selectedIds.length === 0) return;

      setIsChangingStatus(true);
      try {
        // Update each selected ticket's status
        const promises = selectedIds.map((ticketId) =>
          api.patch(`/api/requests-details/${ticketId}/status`, { statusId })
        );
        await Promise.all(promises);

        toastSuccess(`Status updated for ${selectedIds.length} ticket(s)`);
        onClearSelection();
        // Refresh to get updated data with correct TicketListItem shape
        onRefresh();
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to update status";
        toastError(message);
      } finally {
        setIsChangingStatus(false);
      }
    },
    [selectedIds, onClearSelection, onRefresh]
  );

  const hasSelection = selectedIds.length > 0;

  return (
    <div className="shrink-0">
      <DynamicTableBar
        variant="controller"
        hasSelection={hasSelection}
        left={
          <div className="flex items-center gap-2">
            <ViewFilter viewItems={viewItems} activeViewKey={activeViewKey} />
            <BusinessUnitFilter businessUnits={businessUnits} />
            <RequestScopeFilter allCount={allCount} myCount={myCount} />
            <SelectionDisplay
              selectedCount={selectedIds.length}
              onClearSelection={onClearSelection}
              itemName="ticket"
            />
          </div>
        }
        right={
          <div className="flex items-center gap-2">
            <SearchInput
              placeholder="Search tickets..."
              urlParam="search"
              debounceMs={500}
            />

            {/* Change Status - dropdown, active only on multi-selection */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!hasSelection || isChangingStatus}
                  className="gap-2 h-9"
                >
                  <ArrowUpDown className="h-4 w-4" />
                  Change Status
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[200px]">
                {statuses.map((status) => (
                  <DropdownMenuItem
                    key={status.id}
                    onClick={() => handleChangeStatus(status.id)}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    {status.color && (
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: status.color }}
                      />
                    )}
                    <span>{status.name}</span>
                  </DropdownMenuItem>
                ))}
                {statuses.length === 0 && (
                  <DropdownMenuItem disabled>
                    No statuses available
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {tableInstance && <ColumnToggleButton table={tableInstance} />}
          </div>
        }
      />
    </div>
  );
}
