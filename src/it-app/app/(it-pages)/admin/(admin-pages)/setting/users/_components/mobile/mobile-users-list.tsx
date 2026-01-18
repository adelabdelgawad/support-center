"use client";

import { useState, useCallback, useMemo } from "react";
import { UserWithRolesResponse } from "@/types/users.d";
import { MobileUserCard } from "./mobile-user-card";
import { MobileUserActions } from "./mobile-user-actions";
import { ViewUserSheet } from "../modal";
import { useUsersTableActions } from "../table/users-table-actions";
import { Button } from "@/components/ui/button";
import { X, Trash2, CheckCircle2, UserCog } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileUsersListProps {
  users: UserWithRolesResponse[];
  refetch: () => void;
  updateUsers: (updatedUsers: UserWithRolesResponse[]) => Promise<void>;
}

/**
 * Mobile-optimized users list with long-press multi-select
 */
export function MobileUsersList({
  users,
  refetch,
  updateUsers,
}: MobileUsersListProps) {
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set());
  const [viewingUser, setViewingUser] = useState<UserWithRolesResponse | null>(null);

  const selectedUsers = useMemo(
    () => users.filter((user) => selectedUserIds.has(user.id)),
    [users, selectedUserIds]
  );

  const selectedIds = useMemo(
    () =>
      selectedUsers
        .map((user) => (typeof user.id === "string" ? parseInt(user.id, 10) : user.id))
        .filter(Boolean) as number[],
    [selectedUsers]
  );

  /**
   * Mark users as being updated
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
  const { handleDisable, handleEnable, handleConvertToTechnician } =
    useUsersTableActions({
      users,
      updateUsers,
      refetch,
      markUpdating,
      clearUpdating,
    });

  /**
   * Handle long press - enter selection mode and select the user
   */
  const handleLongPress = useCallback((userId: string) => {
    setIsSelectionMode(true);
    setSelectedUserIds(new Set([userId]));
  }, []);

  /**
   * Handle user selection toggle
   */
  const handleSelect = useCallback((userId: string) => {
    setSelectedUserIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }

      // Exit selection mode if no users selected
      if (newSet.size === 0) {
        setIsSelectionMode(false);
      }

      return newSet;
    });
  }, []);

  /**
   * Handle card click in non-selection mode - opens user view sheet
   */
  const handleCardClick = useCallback(
    (userId: string) => {
      if (!isSelectionMode) {
        const user = users.find((u) => u.id === userId);
        if (user) {
          setViewingUser(user);
        }
      }
    },
    [isSelectionMode, users]
  );

  /**
   * Exit selection mode and clear selections
   */
  const handleExitSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedUserIds(new Set());
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

  /**
   * Handle bulk convert to technician
   */
  const handleBulkTechnician = useCallback(async () => {
    await handleConvertToTechnician(selectedIds);
    handleExitSelectionMode();
  }, [handleConvertToTechnician, selectedIds, handleExitSelectionMode]);

  // Count users that can be disabled/enabled
  const canDisableCount = selectedUsers.filter((u) => u.isActive).length;
  const canEnableCount = selectedUsers.filter((u) => !u.isActive).length;
  const canTechnicianCount = selectedUsers.filter((u) => !u.isTechnician).length;

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
                {selectedUserIds.size} selected
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
              {canTechnicianCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkTechnician}
                  disabled={updatingIds.size > 0}
                  className="h-8 text-xs"
                >
                  <UserCog className="w-3 h-3 mr-1" />
                  Tech
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Users list */}
      <div className="flex-1 overflow-y-auto">
        {users.length === 0 ? (
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
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-foreground mb-1">
              No users found
            </h3>
            <p className="text-sm text-muted-foreground">
              Try adjusting your filters or search query
            </p>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {users.map((user) => {
              const userId =
                typeof user.id === "string" ? parseInt(user.id, 10) : user.id;
              const isUpdating = updatingIds.has(userId);

              return (
                <MobileUserCard
                  key={user.id}
                  user={user}
                  isSelected={selectedUserIds.has(user.id)}
                  isSelectionMode={isSelectionMode}
                  isUpdating={isUpdating}
                  onSelect={handleSelect}
                  onLongPress={handleLongPress}
                  onCardClick={handleCardClick}
                  actions={
                    <MobileUserActions
                      user={user}
                      onUpdate={refetch}
                      onUserUpdated={(updatedUser) => {
                        updateUsers([updatedUser]);
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

      {/* View User Sheet - opens on card click */}
      {viewingUser && (
        <ViewUserSheet
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setViewingUser(null);
            }
          }}
          user={viewingUser}
        />
      )}
    </div>
  );
}
