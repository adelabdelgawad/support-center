"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";
import React, { useEffect, useState } from "react";
import { toastSuccess, toastError } from "@/lib/toast";
import {
  bulkAssignUsers,
  bulkRemoveUsers,
  getBusinessUnitUsers,
} from "@/lib/api/business-unit-user-assigns";
import type { BusinessUnitResponse } from "@/types/business-units";

interface UserListItem {
  id: string;
  username: string;
  fullName?: string | null;
  email?: string | null;
  isActive: boolean;
  isTechnician: boolean;
}

interface ManageUsersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessUnit: BusinessUnitResponse | null;
  onSuccess?: () => void;
}

export function ManageUsersSheet({
  open,
  onOpenChange,
  businessUnit,
  onSuccess,
}: ManageUsersSheetProps) {
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [originalUserIds, setOriginalUserIds] = useState<string[]>([]);
  const [allUsers, setAllUsers] = useState<UserListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load business unit's current users and all users when sheet opens
  useEffect(() => {
    if (open && businessUnit) {
      const fetchData = async () => {
        setIsLoading(true);
        try {
          // Fetch users assigned to this business unit
          const assignedUsers = await getBusinessUnitUsers(businessUnit.id);
          const assignedUserIds = assignedUsers.map((u: any) => u.userId || u.id);
          setSelectedUserIds(assignedUserIds);
          setOriginalUserIds(assignedUserIds);

          // Fetch all users
          const response = await fetch("/api/setting/users/with-roles/", {
            credentials: "include",
          });
          if (!response.ok) {
            throw new Error("Failed to fetch users");
          }
          const data = await response.json();
          setAllUsers(data.users || []);
        } catch (error) {
          console.error("Error fetching users:", error);
          toastError("Failed to load users");
        } finally {
          setIsLoading(false);
        }
      };

      fetchData();
    }
  }, [open, businessUnit]);

  const handleToggleUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSave = async () => {
    if (!businessUnit) return;

    setIsSaving(true);
    try {
      // Find users to add and remove
      const toAdd = selectedUserIds.filter(
        (id) => !originalUserIds.includes(id)
      );
      const toRemove = originalUserIds.filter(
        (id) => !selectedUserIds.includes(id)
      );

      // Process additions
      if (toAdd.length > 0) {
        await bulkAssignUsers({
          userIds: toAdd,
          businessUnitId: businessUnit.id,
        });
      }

      // Process removals
      if (toRemove.length > 0) {
        await bulkRemoveUsers({
          userIds: toRemove,
          businessUnitId: businessUnit.id,
        });
      }

      toastSuccess("Users updated successfully");
      onSuccess?.();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error updating users:", error);
      toastError(error.message || "Failed to update users");
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges =
    JSON.stringify([...selectedUserIds].sort()) !==
    JSON.stringify([...originalUserIds].sort());

  // Filter users based on search query
  const filteredUsers = allUsers.filter((user) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      user.username?.toLowerCase().includes(searchLower) ||
      user.fullName?.toLowerCase().includes(searchLower) ||
      user.email?.toLowerCase().includes(searchLower)
    );
  });

  const activeUsers = filteredUsers.filter((user) => user.isActive);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[600px]">
        <SheetHeader>
          <SheetTitle>Manage Users</SheetTitle>
          <SheetDescription>
            Select users to assign to <strong>{businessUnit?.name}</strong>
          </SheetDescription>
        </SheetHeader>

        <div className="py-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              disabled={isLoading}
            />
          </div>
        </div>

        <ScrollArea className="h-[calc(100vh-280px)] pr-4">
          <div className="space-y-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : activeUsers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchQuery ? "No users found" : "No active users available"}
              </div>
            ) : (
              activeUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center space-x-3 rounded-lg border p-3 hover:bg-accent transition-colors"
                >
                  <Checkbox
                    id={`user-${user.id}`}
                    checked={selectedUserIds.includes(user.id)}
                    onCheckedChange={() => handleToggleUser(user.id)}
                    disabled={isSaving}
                  />
                  <label
                    htmlFor={`user-${user.id}`}
                    className="flex-1 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{user.username}</span>
                      {user.isTechnician && (
                        <Badge variant="secondary" className="text-xs">
                          Technician
                        </Badge>
                      )}
                    </div>
                    {user.fullName && (
                      <div className="text-sm text-muted-foreground">
                        {user.fullName}
                      </div>
                    )}
                    {user.email && (
                      <div className="text-xs text-muted-foreground">
                        {user.email}
                      </div>
                    )}
                  </label>
                  {selectedUserIds.includes(user.id) && (
                    <Badge variant="default" className="text-xs">
                      Assigned
                    </Badge>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="mt-4">
          <div className="flex items-center justify-between w-full">
            <div className="text-sm text-muted-foreground">
              {selectedUserIds.length} user{selectedUserIds.length !== 1 ? "s" : ""} selected
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={!hasChanges || isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
