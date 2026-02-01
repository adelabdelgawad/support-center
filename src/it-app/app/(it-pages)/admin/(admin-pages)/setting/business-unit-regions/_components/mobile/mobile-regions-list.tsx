"use client";

import { useState, useCallback, useMemo } from "react";
import type { BusinessUnitRegionResponse } from "@/types/business-unit-regions";
import { MobileRegionCard } from "./mobile-region-card";
import { MobileRegionActions } from "./mobile-region-actions";
import { ViewRegionSheet } from "../modal";
import { useRegionsTableActions } from "../table/regions-table-actions";
import { Button } from "@/components/ui/button";
import { X, Trash2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileRegionsListProps {
  regions: BusinessUnitRegionResponse[];
  refetch: () => void;
  updateRegions: (updatedRegions: BusinessUnitRegionResponse[]) => void;
}

/**
 * Mobile-optimized regions list with long-press multi-select
 */
export function MobileRegionsList({
  regions,
  refetch,
  updateRegions,
}: MobileRegionsListProps) {
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedRegionIds, setSelectedRegionIds] = useState<Set<number>>(new Set());
  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set());
  const [viewingRegion, setViewingRegion] = useState<BusinessUnitRegionResponse | null>(null);

  const selectedRegions = useMemo(
    () => regions.filter((region) => selectedRegionIds.has(region.id)),
    [regions, selectedRegionIds]
  );

  const selectedIds = useMemo(
    () => Array.from(selectedRegionIds),
    [selectedRegionIds]
  );

  /**
   * Mark regions as being updated
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
  const { handleDisable, handleEnable } = useRegionsTableActions({
    regions,
    updateRegions,
    refetch,
    markUpdating,
    clearUpdating,
  });

  /**
   * Handle long press - enter selection mode and select the region
   */
  const handleLongPress = useCallback((regionId: number) => {
    setIsSelectionMode(true);
    setSelectedRegionIds(new Set([regionId]));
  }, []);

  /**
   * Handle region selection toggle
   */
  const handleSelect = useCallback((regionId: number) => {
    setSelectedRegionIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(regionId)) {
        newSet.delete(regionId);
      } else {
        newSet.add(regionId);
      }

      // Exit selection mode if no regions selected
      if (newSet.size === 0) {
        setIsSelectionMode(false);
      }

      return newSet;
    });
  }, []);

  /**
   * Handle card click in non-selection mode - opens region view sheet
   */
  const handleCardClick = useCallback(
    (regionId: number) => {
      if (!isSelectionMode) {
        const region = regions.find((r) => r.id === regionId);
        if (region) {
          setViewingRegion(region);
        }
      }
    },
    [isSelectionMode, regions]
  );

  /**
   * Exit selection mode and clear selections
   */
  const handleExitSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedRegionIds(new Set());
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

  // Count regions that can be disabled/enabled
  const canDisableCount = selectedRegions.filter((r) => r.isActive).length;
  const canEnableCount = selectedRegions.filter((r) => !r.isActive).length;

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
                {selectedRegionIds.size} selected
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
                  <Trash2 className="w-3 h-3 mr-1" />
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

      {/* Regions list */}
      <div className="flex-1 overflow-y-auto">
        {regions.length === 0 ? (
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
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-foreground mb-1">
              No regions found
            </h3>
            <p className="text-sm text-muted-foreground">
              Try adjusting your filters or search query
            </p>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {regions.map((region) => {
              const isUpdating = updatingIds.has(region.id);

              return (
                <MobileRegionCard
                  key={region.id}
                  region={region}
                  isSelected={selectedRegionIds.has(region.id)}
                  isSelectionMode={isSelectionMode}
                  isUpdating={isUpdating}
                  onSelect={handleSelect}
                  onLongPress={handleLongPress}
                  onCardClick={handleCardClick}
                  actions={
                    <MobileRegionActions
                      region={region}
                      onUpdate={refetch}
                      onRegionUpdated={(updatedRegion) => {
                        updateRegions([updatedRegion]);
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

      {/* View Region Sheet - opens on card click */}
      {viewingRegion && (
        <ViewRegionSheet
          region={viewingRegion}
          onOpenChange={(open) => {
            if (!open) {
              setViewingRegion(null);
            }
          }}
        />
      )}
    </div>
  );
}
