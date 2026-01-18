"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { BusinessUnitRegionResponse } from "@/types/business-unit-regions";
import { MapPin, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLongPress } from "@/hooks/use-long-press";

interface MobileRegionCardProps {
  region: BusinessUnitRegionResponse;
  isSelected: boolean;
  isSelectionMode: boolean;
  isUpdating: boolean;
  onSelect: (regionId: number) => void;
  onLongPress: (regionId: number) => void;
  onCardClick: (regionId: number) => void;
  actions?: React.ReactNode;
}

/**
 * Mobile-optimized region card for the Business Unit Regions table
 * Displays region info in a compact, scannable format
 * Supports long-press for multi-select mode
 */
export function MobileRegionCard({
  region,
  isSelected,
  isSelectionMode,
  isUpdating,
  onSelect,
  onLongPress,
  onCardClick,
  actions,
}: MobileRegionCardProps) {
  const longPressHandlers = useLongPress({
    onLongPress: () => onLongPress(region.id),
    delay: 500,
  });

  const handleClick = () => {
    if (isSelectionMode) {
      onSelect(region.id);
    } else {
      onCardClick(region.id);
    }
  };

  return (
    <Card
      className={cn(
        "relative p-4 transition-all duration-200",
        isSelected && "ring-2 ring-primary bg-primary/5",
        isUpdating && "opacity-60 pointer-events-none",
        !isSelectionMode && "active:scale-[0.98]"
      )}
      {...longPressHandlers}
      onClick={handleClick}
    >
      {/* Loading overlay */}
      {isUpdating && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-lg z-10">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}

      {/* Selection indicator */}
      {isSelectionMode && (
        <div className="absolute top-2 left-2">
          <div
            className={cn(
              "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
              isSelected
                ? "bg-primary border-primary"
                : "border-input bg-background"
            )}
          >
            {isSelected && (
              <CheckCircle2 className="w-4 h-4 text-primary-foreground" />
            )}
          </div>
        </div>
      )}

      {/* Card content */}
      <div className={cn("space-y-2", isSelectionMode && "ml-7")}>
        {/* Header: Region Name + Status */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="font-medium text-sm truncate">{region.name}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {region.isActive ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : (
              <XCircle className="w-4 h-4 text-destructive" />
            )}
          </div>
        </div>

        {/* Description */}
        {region.description && (
          <div className="text-sm text-muted-foreground line-clamp-2">
            {region.description}
          </div>
        )}

        {/* Created Date (optional - can be hidden if needed) */}
        {region.createdAt && (
          <div className="text-xs text-muted-foreground">
            Created: {new Date(region.createdAt).toLocaleDateString()}
          </div>
        )}

        {/* Actions (shown only when not in selection mode) */}
        {!isSelectionMode && actions && (
          <div className="pt-2 border-t" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </div>
    </Card>
  );
}
