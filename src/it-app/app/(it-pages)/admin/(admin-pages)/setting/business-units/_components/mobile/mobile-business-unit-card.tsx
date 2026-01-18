"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { BusinessUnitResponse } from "@/types/business-units";
import type { BusinessUnitRegionResponse } from "@/types/business-unit-regions";
import { Building2, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLongPress } from "@/hooks/use-long-press";

interface MobileBusinessUnitCardProps {
  businessUnit: BusinessUnitResponse;
  region?: BusinessUnitRegionResponse;
  isSelected: boolean;
  isSelectionMode: boolean;
  isUpdating: boolean;
  onSelect: (unitId: number) => void;
  onLongPress: (unitId: number) => void;
  onCardClick: (unitId: number) => void;
  actions?: React.ReactNode;
}

/**
 * Mobile-optimized business unit card
 * Displays business unit info in a compact, scannable format
 * Supports long-press for multi-select mode
 */
export function MobileBusinessUnitCard({
  businessUnit,
  region,
  isSelected,
  isSelectionMode,
  isUpdating,
  onSelect,
  onLongPress,
  onCardClick,
  actions,
}: MobileBusinessUnitCardProps) {
  const longPressHandlers = useLongPress({
    onLongPress: () => onLongPress(businessUnit.id),
    delay: 500,
  });

  const handleClick = () => {
    if (isSelectionMode) {
      onSelect(businessUnit.id);
    } else {
      onCardClick(businessUnit.id);
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
        {/* Header: Business Unit Name + Status */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="font-medium text-sm truncate">{businessUnit.name}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {businessUnit.isActive ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : (
              <XCircle className="w-4 h-4 text-destructive" />
            )}
          </div>
        </div>

        {/* Description */}
        {businessUnit.description && (
          <div className="text-sm text-foreground line-clamp-2">
            {businessUnit.description}
          </div>
        )}

        {/* Region Badge */}
        {region && (
          <div className="flex items-center gap-1">
            <Badge variant="secondary" className="text-xs">
              {region.name}
            </Badge>
          </div>
        )}

        {/* Network (if available) */}
        {businessUnit.network && (
          <div className="text-xs text-muted-foreground font-mono truncate">
            Network: {businessUnit.network}
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
