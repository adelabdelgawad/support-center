"use client";

import { useState, useCallback, useMemo } from "react";
import type { RequestStatusResponse } from "@/types/request-statuses";
import { MobileStatusCard } from "./mobile-status-card";
import { MobileStatusActions } from "./mobile-status-actions";
import ViewStatusSheet from "../modal/view-request-status-sheet";
import { useRequestStatusesActions } from "../../context/request-statuses-actions-context";
import { Button } from "@/components/ui/button";
import { X, CheckCircle2, XCircle } from "lucide-react";

interface MobileStatusesListProps {
  statuses: RequestStatusResponse[];
  refetch: () => void;
  updateStatuses: (updatedStatuses: RequestStatusResponse[]) => Promise<void>;
}

/**
 * Mobile-optimized statuses list with long-press multi-select
 * Excludes readonly statuses from selection
 */
export function MobileStatusesList({
  statuses,
  refetch,
  updateStatuses,
}: MobileStatusesListProps) {
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedStatusIds, setSelectedStatusIds] = useState<Set<number>>(new Set());
  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set());
  const [viewingStatus, setViewingStatus] = useState<RequestStatusResponse | null>(null);

  const { handleBulkUpdate } = useRequestStatusesActions();

  // Get selected statuses (only non-readonly)
  const selectedStatuses = useMemo(
    () => statuses.filter((status) => selectedStatusIds.has(status.id) && !status.readonly),
    [statuses, selectedStatusIds]
  );

  /**
   * Mark statuses as being updated
   */
  const markUpdating = useCallback((ids: number[]) => {
    setUpdatingIds(new Set(ids));
  }, []);

  /**
   * Clear updating state
   */
  const clearUpdating = useCallback(
    (ids?: number[]) => {
      if (ids && ids.length > 0) {
        const newSet = new Set(updatingIds);
        ids.forEach((id) => newSet.delete(id));
        setUpdatingIds(newSet);
      } else {
        setUpdatingIds(new Set());
      }
    },
    [updatingIds]
  );

  /**
   * Handle long press - enter selection mode and select the status
   * Only works on non-readonly statuses
   */
  const handleLongPress = useCallback((statusId: number) => {
    const status = statuses.find((s) => s.id === statusId);
    if (status && !status.readonly) {
      setIsSelectionMode(true);
      setSelectedStatusIds(new Set([statusId]));
    }
  }, [statuses]);

  /**
   * Handle status selection toggle
   * Only allows selecting non-readonly statuses
   */
  const handleSelect = useCallback((statusId: number) => {
    setSelectedStatusIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(statusId)) {
        newSet.delete(statusId);
      } else {
        newSet.add(statusId);
      }

      // Exit selection mode if no statuses selected
      if (newSet.size === 0) {
        setIsSelectionMode(false);
      }

      return newSet;
    });
  }, []);

  /**
   * Handle card click in non-selection mode - opens status view sheet
   */
  const handleCardClick = useCallback(
    (statusId: number) => {
      if (!isSelectionMode) {
        const status = statuses.find((s) => s.id === statusId);
        if (status) {
          setViewingStatus(status);
        }
      }
    },
    [isSelectionMode, statuses]
  );

  /**
   * Exit selection mode and clear selections
   */
  const handleExitSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedStatusIds(new Set());
  }, []);

  /**
   * Handle bulk activate
   */
  const handleBulkActivate = useCallback(async () => {
    const ids = Array.from(selectedStatusIds).map(String);
    markUpdating(Array.from(selectedStatusIds));
    await handleBulkUpdate(ids, true);
    clearUpdating();
    handleExitSelectionMode();
  }, [selectedStatusIds, handleBulkUpdate, markUpdating, clearUpdating, handleExitSelectionMode]);

  /**
   * Handle bulk deactivate
   */
  const handleBulkDeactivate = useCallback(async () => {
    const ids = Array.from(selectedStatusIds).map(String);
    markUpdating(Array.from(selectedStatusIds));
    await handleBulkUpdate(ids, false);
    clearUpdating();
    handleExitSelectionMode();
  }, [selectedStatusIds, handleBulkUpdate, markUpdating, clearUpdating, handleExitSelectionMode]);

  // Count statuses that can be activated/deactivated
  const canActivateCount = selectedStatuses.filter((s) => !s.isActive).length;
  const canDeactivateCount = selectedStatuses.filter((s) => s.isActive).length;

  return (
    <div className="flex flex-col h-full">
      {/* Selection mode toolbar */}
      {isSelectionMode && (
        <div className="sticky top-0 z-20 bg-background border-b shadow-sm">
          <div className="flex items-center justify-between p-3 gap-2">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleExitSelectionMode}
                className="h-8"
              >
                <X className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium">
                {selectedStatusIds.size} selected
              </span>
            </div>

            <div className="flex items-center gap-1">
              {canActivateCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkActivate}
                  disabled={updatingIds.size > 0}
                  className="h-8 text-xs min-h-[44px]"
                >
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Activate
                </Button>
              )}
              {canDeactivateCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkDeactivate}
                  disabled={updatingIds.size > 0}
                  className="h-8 text-xs min-h-[44px]"
                >
                  <XCircle className="w-3 h-3 mr-1" />
                  Deactivate
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Statuses list */}
      <div className="flex-1 overflow-y-auto">
        {statuses.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div className="text-muted-foreground mb-2">
              <svg
                className="w-16 h-16 mx-auto mb-4 opacity-50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-foreground mb-1">
              No statuses found
            </h3>
            <p className="text-sm text-muted-foreground">
              Try adjusting your filters or search query
            </p>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {statuses.map((status) => {
              const isUpdating = updatingIds.has(status.id);

              return (
                <MobileStatusCard
                  key={status.id}
                  status={status}
                  isSelected={selectedStatusIds.has(status.id)}
                  isSelectionMode={isSelectionMode}
                  isUpdating={isUpdating}
                  onSelect={handleSelect}
                  onLongPress={handleLongPress}
                  onCardClick={handleCardClick}
                  actions={
                    <MobileStatusActions
                      status={status}
                      onUpdate={refetch}
                      onStatusUpdated={(updatedStatus) => {
                        updateStatuses([updatedStatus]);
                      }}
                      disabled={isUpdating}
                    />
                  }
                />
              );
            })}
          </div>
        )}
      </div>

      {/* View Status Sheet - opens on card click */}
      {viewingStatus && (
        <ViewStatusSheet
          status={viewingStatus}
          onOpenChange={(open) => {
            if (!open) {
              setViewingStatus(null);
            }
          }}
        />
      )}
    </div>
  );
}
