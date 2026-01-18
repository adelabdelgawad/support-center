"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { RequestStatusResponse } from "@/types/request-statuses";
import { CheckCircle2, XCircle, Loader2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLongPress } from "@/hooks/use-long-press";

interface MobileStatusCardProps {
  status: RequestStatusResponse;
  isSelected: boolean;
  isSelectionMode: boolean;
  isUpdating: boolean;
  onSelect: (statusId: number) => void;
  onLongPress: (statusId: number) => void;
  onCardClick: (statusId: number) => void;
  actions?: React.ReactNode;
}

/**
 * Mobile-optimized status card for the Request Statuses table
 * Displays status info in a compact, scannable format
 * Supports long-press for multi-select mode (excludes readonly)
 */
export function MobileStatusCard({
  status,
  isSelected,
  isSelectionMode,
  isUpdating,
  onSelect,
  onLongPress,
  onCardClick,
  actions,
}: MobileStatusCardProps) {
  const longPressHandlers = useLongPress({
    onLongPress: () => {
      // Only allow long-press on non-readonly statuses
      if (!status.readonly) {
        onLongPress(status.id);
      }
    },
    delay: 500,
  });

  const handleClick = () => {
    if (isSelectionMode && !status.readonly) {
      onSelect(status.id);
    } else if (!isSelectionMode) {
      onCardClick(status.id);
    }
  };

  return (
    <Card
      className={cn(
        "relative p-4 transition-all duration-200",
        isSelected && "ring-2 ring-primary bg-primary/5",
        isUpdating && "opacity-60 pointer-events-none",
        !isSelectionMode && !status.readonly && "active:scale-[0.98]",
        status.readonly && "opacity-75"
      )}
      {...(!status.readonly ? longPressHandlers : {})}
      onClick={handleClick}
    >
      {/* Loading overlay */}
      {isUpdating && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-lg z-10">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      )}

      {/* Selection indicator (only for non-readonly) */}
      {isSelectionMode && !status.readonly && (
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
      <div className={cn("space-y-2", isSelectionMode && !status.readonly && "ml-7")}>
        {/* Header: Name with color indicator + Status */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {/* Color indicator */}
            {status.color && (
              <div
                className="w-3 h-3 rounded-full shrink-0 border border-border"
                style={{ backgroundColor: status.color }}
              />
            )}
            <span className="font-medium text-sm truncate">{status.name}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {status.isActive ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : (
              <XCircle className="w-4 h-4 text-destructive" />
            )}
          </div>
        </div>

        {/* Description */}
        {status.description && (
          <div className="text-sm text-muted-foreground line-clamp-2">
            {status.description}
          </div>
        )}

        {/* Badges row */}
        <div className="flex flex-wrap gap-1.5 items-center">
          {/* Readonly badge */}
          {status.readonly && (
            <Badge variant="secondary" className="text-xs shrink-0">
              <Lock className="w-3 h-3 mr-1" />
              System
            </Badge>
          )}

          {/* Visible on requester page */}
          {status.visibleOnRequesterPage && (
            <Badge variant="outline" className="text-xs shrink-0">
              Visible to Users
            </Badge>
          )}

          {/* Count as solved */}
          {status.countAsSolved && (
            <Badge variant="outline" className="text-xs shrink-0 border-green-500 text-green-700">
              Resolved
            </Badge>
          )}
        </div>

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
