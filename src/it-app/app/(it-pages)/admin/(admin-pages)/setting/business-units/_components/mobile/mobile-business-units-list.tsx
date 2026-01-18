"use client";

import { useState, useCallback, useMemo } from "react";
import type { BusinessUnitResponse } from "@/types/business-units";
import type { BusinessUnitRegionResponse } from "@/types/business-unit-regions";
import { MobileBusinessUnitCard } from "./mobile-business-unit-card";
import { MobileBusinessUnitActions } from "./mobile-business-unit-actions";
import { ViewBusinessUnitSheet } from "../modal";
import { useBusinessUnitsTableActions } from "../table/business-units-table-actions";
import { Button } from "@/components/ui/button";
import { X, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileBusinessUnitsListProps {
  businessUnits: BusinessUnitResponse[];
  regions: BusinessUnitRegionResponse[];
  refetch: () => void;
  updateBusinessUnits: (updatedUnits: BusinessUnitResponse[]) => Promise<void>;
}

/**
 * Mobile-optimized business units list with long-press multi-select
 */
export function MobileBusinessUnitsList({
  businessUnits,
  regions,
  refetch,
  updateBusinessUnits,
}: MobileBusinessUnitsListProps) {
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<number>>(new Set());
  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set());
  const [viewingUnit, setViewingUnit] = useState<BusinessUnitResponse | null>(null);

  // Create a region map for quick lookups
  const regionMap = useMemo(
    () => new Map(regions.map((r) => [r.id, r])),
    [regions]
  );

  const selectedUnits = useMemo(
    () => businessUnits.filter((unit) => selectedUnitIds.has(unit.id)),
    [businessUnits, selectedUnitIds]
  );

  const selectedIds = useMemo(
    () => Array.from(selectedUnitIds),
    [selectedUnitIds]
  );

  /**
   * Mark business units as being updated
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

  // Get bulk action handlers
  const { handleDisable, handleEnable } = useBusinessUnitsTableActions({
    businessUnits,
    updateBusinessUnits,
    refetch,
    markUpdating,
    clearUpdating,
  });

  /**
   * Handle long press - enter selection mode and select the unit
   */
  const handleLongPress = useCallback((unitId: number) => {
    setIsSelectionMode(true);
    setSelectedUnitIds(new Set([unitId]));
  }, []);

  /**
   * Handle unit selection toggle
   */
  const handleSelect = useCallback((unitId: number) => {
    setSelectedUnitIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(unitId)) {
        newSet.delete(unitId);
      } else {
        newSet.add(unitId);
      }

      // Exit selection mode if no units selected
      if (newSet.size === 0) {
        setIsSelectionMode(false);
      }

      return newSet;
    });
  }, []);

  /**
   * Handle card click in non-selection mode - opens unit view sheet
   */
  const handleCardClick = useCallback(
    (unitId: number) => {
      if (!isSelectionMode) {
        const unit = businessUnits.find((u) => u.id === unitId);
        if (unit) {
          setViewingUnit(unit);
        }
      }
    },
    [isSelectionMode, businessUnits]
  );

  /**
   * Exit selection mode and clear selections
   */
  const handleExitSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedUnitIds(new Set());
  }, []);

  /**
   * Handle bulk disable
   */
  const handleBulkDisable = useCallback(async () => {
    await handleDisable(selectedIds);
    handleExitSelectionMode();
  }, [handleDisable, selectedIds, handleExitSelectionMode]);

  /**
   * Handle bulk enable
   */
  const handleBulkEnable = useCallback(async () => {
    await handleEnable(selectedIds);
    handleExitSelectionMode();
  }, [handleEnable, selectedIds, handleExitSelectionMode]);

  // Count units that can be disabled/enabled
  const canDisableCount = selectedUnits.filter((u) => u.isActive).length;
  const canEnableCount = selectedUnits.filter((u) => !u.isActive).length;

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
                {selectedUnitIds.size} selected
              </span>
            </div>

            <div className="flex items-center gap-1">
              {canDisableCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkDisable}
                  disabled={updatingIds.size > 0}
                  className="h-8 text-xs"
                >
                  <XCircle className="w-3 h-3 mr-1" />
                  Disable
                </Button>
              )}
              {canEnableCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkEnable}
                  disabled={updatingIds.size > 0}
                  className="h-8 text-xs"
                >
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Enable
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Business units list */}
      <div className="flex-1 overflow-y-auto">
        {businessUnits.length === 0 ? (
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
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-foreground mb-1">
              No business units found
            </h3>
            <p className="text-sm text-muted-foreground">
              Try adjusting your filters or search query
            </p>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {businessUnits.map((unit) => {
              const isUpdating = updatingIds.has(unit.id);
              const region = unit.businessUnitRegionId
                ? regionMap.get(unit.businessUnitRegionId)
                : undefined;

              return (
                <MobileBusinessUnitCard
                  key={unit.id}
                  businessUnit={unit}
                  region={region}
                  isSelected={selectedUnitIds.has(unit.id)}
                  isSelectionMode={isSelectionMode}
                  isUpdating={isUpdating}
                  onSelect={handleSelect}
                  onLongPress={handleLongPress}
                  onCardClick={handleCardClick}
                  actions={
                    <MobileBusinessUnitActions
                      businessUnit={unit}
                      regions={regions}
                      onUpdate={refetch}
                      onBusinessUnitUpdated={(updatedUnit) => {
                        updateBusinessUnits([updatedUnit]);
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

      {/* View Business Unit Sheet - opens on card click */}
      {viewingUnit && (
        <ViewBusinessUnitSheet
          unit={viewingUnit}
          regions={regions}
          onOpenChange={(open: boolean) => {
            if (!open) {
              setViewingUnit(null);
            }
          }}
        />
      )}
    </div>
  );
}
