"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { UserWithRolesResponse } from "@/types/users.d";
import { User as UserIcon, Mail, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLongPress } from "@/hooks/use-long-press";

interface MobileUserCardProps {
  user: UserWithRolesResponse;
  isSelected: boolean;
  isSelectionMode: boolean;
  isUpdating: boolean;
  onSelect: (userId: string) => void;
  onLongPress: (userId: string) => void;
  onCardClick: (userId: string) => void;
  actions?: React.ReactNode;
}

/**
 * Mobile-optimized user card for the Users table
 * Displays user info in a compact, scannable format
 * Supports long-press for multi-select mode
 */
export function MobileUserCard({
  user,
  isSelected,
  isSelectionMode,
  isUpdating,
  onSelect,
  onLongPress,
  onCardClick,
  actions,
}: MobileUserCardProps) {
  const longPressHandlers = useLongPress({
    onLongPress: () => onLongPress(user.id),
    delay: 500,
  });

  const handleClick = () => {
    if (isSelectionMode) {
      onSelect(user.id);
    } else {
      onCardClick(user.id);
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
        {/* Header: Username + Status */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <UserIcon className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="font-medium text-sm truncate">{user.username}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {user.isActive ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : (
              <XCircle className="w-4 h-4 text-destructive" />
            )}
          </div>
        </div>

        {/* Full Name - Title */}
        {(user.fullName || user.title) && (
          <div className="text-sm text-foreground truncate">
            {user.fullName && user.title
              ? `${user.fullName} - ${user.title}`
              : user.fullName || user.title}
          </div>
        )}

        {/* Email */}
        {user.email && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground truncate">
            <Mail className="w-3 h-3 shrink-0" />
            <span className="truncate">{user.email}</span>
          </div>
        )}

        {/* Roles - single line with overflow indicator */}
        {(user.isTechnician || (user.roles && user.roles.length > 0)) && (
          <div className="flex gap-1 items-center">
            {user.isTechnician && (
              <Badge variant="secondary" className="text-xs shrink-0">
                Technician
              </Badge>
            )}
            {user.roles && user.roles.slice(0, 2).map((role) => (
              <Badge key={role.id} variant="outline" className="text-xs shrink-0">
                {role.name}
              </Badge>
            ))}
            {user.roles && user.roles.length > 2 && (
              <span className="text-xs text-muted-foreground shrink-0">
                +{user.roles.length - 2} more
              </span>
            )}
          </div>
        )}

        {/* Business Units */}
        {user.businessUnits && user.businessUnits.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {user.businessUnits.map((bu) => (
              <Badge
                key={bu.id}
                variant={bu.isActive ? "default" : "secondary"}
                className="text-xs"
              >
                {bu.name}
              </Badge>
            ))}
          </div>
        )}

        {/* Actions (shown only when not in selection mode) */}
        {!isSelectionMode && actions && (
          <div className="pt-2 border-t" onClick={(e) => e.stopPropagation()}>{actions}</div>
        )}
      </div>
    </Card>
  );
}
