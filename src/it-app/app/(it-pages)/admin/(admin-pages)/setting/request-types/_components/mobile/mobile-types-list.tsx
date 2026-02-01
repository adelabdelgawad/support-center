"use client";

import { useState, useCallback, useMemo } from "react";
import type { RequestType } from "@/types/request-types";
import { MobileTypeCard } from "./mobile-type-card";
import { MobileTypeActions } from "./mobile-type-actions";
import { ViewRequestTypeSheet } from "../modal";
import { useRequestTypesActions } from "../../context/request-types-actions-context";
import { Button } from "@/components/ui/button";
import { X, CheckCircle2, XCircle } from "lucide-react";

interface MobileTypesListProps {
  types: RequestType[];
  refetch: () => void;
  updateTypes: (updatedTypes: RequestType[]) => void;
}

/**
 * Mobile-optimized types list with long-press multi-select
 */
export function MobileTypesList({
  types,
  refetch,
  updateTypes,
}: MobileTypesListProps) {
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedTypeIds, setSelectedTypeIds] = useState<Set<number>>(new Set());
  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set());
  const [viewingType, setViewingType] = useState<RequestType | null>(null);

  const { handleBulkUpdate } = useRequestTypesActions();

  // Get selected types
  const selectedTypes = useMemo(
    () => types.filter((type) => selectedTypeIds.has(type.id)),
    [types, selectedTypeIds]
  );

  /**
   * Mark types as being updated
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
   * Handle long press - enter selection mode and select the type
   */
  const handleLongPress = useCallback((typeId: number) => {
    setIsSelectionMode(true);
    setSelectedTypeIds(new Set([typeId]));
  }, []);

  /**
   * Handle type selection toggle
   */
  const handleSelect = useCallback((typeId: number) => {
    setSelectedTypeIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(typeId)) {
        newSet.delete(typeId);
      } else {
        newSet.add(typeId);
      }

      // Exit selection mode if no types selected
      if (newSet.size === 0) {
        setIsSelectionMode(false);
      }

      return newSet;
    });
  }, []);

  /**
   * Handle card click in non-selection mode - opens type view sheet
   */
  const handleCardClick = useCallback(
    (typeId: number) => {
      if (!isSelectionMode) {
        const type = types.find((t) => t.id === typeId);
        if (type) {
          setViewingType(type);
        }
      }
    },
    [isSelectionMode, types]
  );

  /**
   * Exit selection mode and clear selections
   */
  const handleExitSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedTypeIds(new Set());
  }, []);

  /**
   * Handle bulk activate
   */
  const handleBulkActivate = useCallback(async () => {
    const ids = Array.from(selectedTypeIds).map(String);
    markUpdating(Array.from(selectedTypeIds));
    await handleBulkUpdate(ids, true);
    clearUpdating();
    handleExitSelectionMode();
  }, [selectedTypeIds, handleBulkUpdate, markUpdating, clearUpdating, handleExitSelectionMode]);

  /**
   * Handle bulk deactivate
   */
  const handleBulkDeactivate = useCallback(async () => {
    const ids = Array.from(selectedTypeIds).map(String);
    markUpdating(Array.from(selectedTypeIds));
    await handleBulkUpdate(ids, false);
    clearUpdating();
    handleExitSelectionMode();
  }, [selectedTypeIds, handleBulkUpdate, markUpdating, clearUpdating, handleExitSelectionMode]);

  // Count types that can be activated/deactivated
  const canActivateCount = selectedTypes.filter((t) => !t.isActive).length;
  const canDeactivateCount = selectedTypes.filter((t) => t.isActive).length;

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
                {selectedTypeIds.size} selected
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

      {/* Types list */}
      <div className="flex-1 overflow-y-auto">
        {types.length === 0 ? (
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
              No types found
            </h3>
            <p className="text-sm text-muted-foreground">
              Try adjusting your filters or search query
            </p>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {types.map((type) => {
              const isUpdating = updatingIds.has(type.id);

              return (
                <MobileTypeCard
                  key={type.id}
                  type={type}
                  isSelected={selectedTypeIds.has(type.id)}
                  isSelectionMode={isSelectionMode}
                  isUpdating={isUpdating}
                  onSelect={handleSelect}
                  onLongPress={handleLongPress}
                  onCardClick={handleCardClick}
                  actions={
                    <MobileTypeActions
                      type={type}
                      onUpdate={refetch}
                      onTypeUpdated={(updatedType) => {
                        updateTypes([updatedType]);
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

      {/* View Type Sheet - opens on card click */}
      {viewingType && (
        <ViewRequestTypeSheet
          type={viewingType}
          onOpenChange={(open) => {
            if (!open) {
              setViewingType(null);
            }
          }}
        />
      )}
    </div>
  );
}
