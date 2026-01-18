"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { RoleResponse } from "@/types/roles";
import { Shield, FileText, Users, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLongPress } from "@/hooks/use-long-press";

interface MobileRoleCardProps {
  role: RoleResponse;
  isSelected: boolean;
  isSelectionMode: boolean;
  isUpdating: boolean;
  onSelect: (roleId: string) => void;
  onLongPress: (roleId: string) => void;
  onCardClick: (roleId: string) => void;
  actions?: React.ReactNode;
}

/**
 * Mobile-optimized role card for the Roles table
 * Displays role info in a compact, scannable format
 * Supports long-press for multi-select mode
 */
export function MobileRoleCard({
  role,
  isSelected,
  isSelectionMode,
  isUpdating,
  onSelect,
  onLongPress,
  onCardClick,
  actions,
}: MobileRoleCardProps) {
  const longPressHandlers = useLongPress({
    onLongPress: () => onLongPress(role.id),
    delay: 500,
  });

  const handleClick = () => {
    if (isSelectionMode) {
      onSelect(role.id);
    } else {
      onCardClick(role.id);
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
        {/* Header: Role Name + Status */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Shield className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="font-medium text-sm truncate">{role.name}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {role.isActive ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : (
              <XCircle className="w-4 h-4 text-destructive" />
            )}
          </div>
        </div>

        {/* Description */}
        {role.description && (
          <div className="text-sm text-muted-foreground line-clamp-2">
            {role.description}
          </div>
        )}

        {/* Stats: Pages and Users count */}
        <div className="flex gap-2 items-center">
          {/* Pages count */}
          {role.pagePaths && role.pagePaths.length > 0 && (
            <Badge variant="outline" className="text-xs shrink-0">
              <FileText className="mr-1 h-3 w-3" />
              {role.pagePaths.length} {role.pagePaths.length === 1 ? "Page" : "Pages"}
            </Badge>
          )}

          {/* Users count */}
          {role.totalUsers !== null && role.totalUsers !== undefined && (
            <Badge variant="outline" className="text-xs shrink-0">
              <Users className="mr-1 h-3 w-3" />
              {role.totalUsers} {role.totalUsers === 1 ? "User" : "Users"}
            </Badge>
          )}
        </div>

        {/* Actions (shown only when not in selection mode) */}
        {!isSelectionMode && actions && (
          <div className="pt-2 border-t" onClick={(e) => e.stopPropagation()}>{actions}</div>
        )}
      </div>
    </Card>
  );
}
