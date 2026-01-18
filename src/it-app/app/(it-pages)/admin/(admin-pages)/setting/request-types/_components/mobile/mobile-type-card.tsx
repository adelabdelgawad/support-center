"use client";

import { Card } from "@/components/ui/card";
import type { RequestType } from "@/types/request-types";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLongPress } from "@/hooks/use-long-press";

interface MobileTypeCardProps {
  type: RequestType;
  isSelected: boolean;
  isSelectionMode: boolean;
  isUpdating: boolean;
  onSelect: (typeId: number) => void;
  onLongPress: (typeId: number) => void;
  onCardClick: (typeId: number) => void;
  actions?: React.ReactNode;
}

/**
 * Mobile-optimized type card for the Request Types table
 * Displays type info in a compact, scannable format
 * Supports long-press for multi-select mode
 */
export function MobileTypeCard({
  type,
  isSelected,
  isSelectionMode,
  isUpdating,
  onSelect,
  onLongPress,
  onCardClick,
  actions,
}: MobileTypeCardProps) {
  const longPressHandlers = useLongPress({
    onLongPress: () => {
      onLongPress(type.id);
    },
    delay: 500,
  });

  const handleClick = () => {
    if (isSelectionMode) {
      onSelect(type.id);
    } else {
      onCardClick(type.id);
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
        {/* Header: Name + Status */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="font-medium text-sm truncate">{type.nameEn}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {type.isActive ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : (
              <XCircle className="w-4 h-4 text-destructive" />
            )}
          </div>
        </div>

        {/* Description */}
        {type.briefEn && (
          <div className="text-sm text-muted-foreground line-clamp-2">
            {type.briefEn}
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
