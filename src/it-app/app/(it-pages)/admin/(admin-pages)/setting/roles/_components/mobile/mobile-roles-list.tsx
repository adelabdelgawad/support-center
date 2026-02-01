"use client";

import { useState, useCallback } from "react";
import { MobileRoleCard } from "./mobile-role-card";
import { MobileRoleActions } from "./mobile-role-actions";
import { Button } from "@/components/ui/button";
import { X, Loader2 } from "lucide-react";
import { toggleRoleStatus } from "@/lib/api/roles";
import { toastSuccess, toastError, toastWarning } from "@/lib/toast";
import type { RoleResponse } from "@/types/roles";
import type { PageResponse } from "@/types/pages";
import type { AuthUserResponse } from "@/types/users";

interface MobileRolesListProps {
  roles: RoleResponse[];
  refetch: () => void;
  updateRoles: (updatedRoles: RoleResponse[]) => void;
  preloadedPages: PageResponse[];
  preloadedUsers: AuthUserResponse[];
}

/**
 * Mobile-optimized roles list with selection mode support
 * Supports long-press for multi-select and bulk operations
 */
export function MobileRolesList({
  roles,
  refetch,
  updateRoles,
  preloadedPages,
  preloadedUsers,
}: MobileRolesListProps) {
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);

  // Enter selection mode with initial role selected
  const handleLongPress = useCallback((roleId: string) => {
    setIsSelectionMode(true);
    setSelectedIds(new Set([roleId]));
  }, []);

  // Toggle role selection
  const handleSelect = useCallback((roleId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) {
        next.delete(roleId);
      } else {
        next.add(roleId);
      }

      // Exit selection mode if no roles selected
      if (next.size === 0) {
        setIsSelectionMode(false);
      }

      return next;
    });
  }, []);

  // Exit selection mode
  const handleExitSelection = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  // Handle card click (do nothing in mobile, actions are in footer)
  const handleCardClick = useCallback((_roleId: string) => {
    // No-op - actions are shown in card footer
  }, []);

  // Bulk enable selected roles
  const handleBulkEnable = useCallback(async () => {
    try {
      setIsBulkUpdating(true);

      // Filter to only inactive roles
      const inactiveRolesToEnable = roles.filter(
        (r) => selectedIds.has(r.id) && !r.isActive
      );

      if (inactiveRolesToEnable.length === 0) {
        toastWarning("Selected roles are already enabled");
        return;
      }

      const roleIdsToEnable = inactiveRolesToEnable.map((r) => r.id);
      setUpdatingIds(new Set(roleIdsToEnable));

      // Call API for each role
      const updatedRoles: RoleResponse[] = [];
      for (const roleId of roleIdsToEnable) {
        const updated = await toggleRoleStatus(roleId, true);
        updatedRoles.push(updated);
      }

      // Update local state
      if (updatedRoles.length > 0) {
        await updateRoles(updatedRoles);
      }

      toastSuccess(`Successfully enabled ${updatedRoles.length} role(s)`);

      // Exit selection mode
      handleExitSelection();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toastError(`Failed to enable roles: ${errorMessage}`);
    } finally {
      setUpdatingIds(new Set());
      setIsBulkUpdating(false);
    }
  }, [roles, selectedIds, updateRoles, handleExitSelection]);

  // Bulk disable selected roles
  const handleBulkDisable = useCallback(async () => {
    try {
      setIsBulkUpdating(true);

      // Filter to only active roles
      const activeRolesToDisable = roles.filter(
        (r) => selectedIds.has(r.id) && r.isActive
      );

      if (activeRolesToDisable.length === 0) {
        toastWarning("Selected roles are already disabled");
        return;
      }

      const roleIdsToDisable = activeRolesToDisable.map((r) => r.id);
      setUpdatingIds(new Set(roleIdsToDisable));

      // Call API for each role
      const updatedRoles: RoleResponse[] = [];
      for (const roleId of roleIdsToDisable) {
        const updated = await toggleRoleStatus(roleId, false);
        updatedRoles.push(updated);
      }

      // Update local state
      if (updatedRoles.length > 0) {
        await updateRoles(updatedRoles);
      }

      toastSuccess(`Successfully disabled ${updatedRoles.length} role(s)`);

      // Exit selection mode
      handleExitSelection();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toastError(`Failed to disable roles: ${errorMessage}`);
    } finally {
      setUpdatingIds(new Set());
      setIsBulkUpdating(false);
    }
  }, [roles, selectedIds, updateRoles, handleExitSelection]);

  // Empty state
  if (roles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <svg
          className="w-16 h-16 mx-auto mb-4 opacity-50"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <h3 className="text-lg font-medium">No roles found</h3>
        <p className="text-sm text-muted-foreground">
          Try adjusting your filters or search query
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Selection toolbar (sticky at top when in selection mode) */}
      {isSelectionMode && (
        <div className="sticky top-0 z-10 bg-background border-b shadow-md p-3 flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleExitSelection}
            className="h-11 w-11 shrink-0"
          >
            <X className="h-4 w-4" />
          </Button>

          <div className="flex-1 text-sm font-medium">
            {selectedIds.size} selected
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkEnable}
              disabled={isBulkUpdating}
              className="min-h-[44px]"
            >
              {isBulkUpdating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Enable
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkDisable}
              disabled={isBulkUpdating}
              className="min-h-[44px]"
            >
              {isBulkUpdating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Disable
            </Button>
          </div>
        </div>
      )}

      {/* Scrollable roles list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {roles.map((role) => (
          <MobileRoleCard
            key={role.id}
            role={role}
            isSelected={selectedIds.has(role.id)}
            isSelectionMode={isSelectionMode}
            isUpdating={updatingIds.has(role.id)}
            onSelect={handleSelect}
            onLongPress={handleLongPress}
            onCardClick={handleCardClick}
            actions={
              <MobileRoleActions
                role={role}
                preloadedPages={preloadedPages}
                preloadedUsers={preloadedUsers}
              />
            }
          />
        ))}
      </div>
    </div>
  );
}
