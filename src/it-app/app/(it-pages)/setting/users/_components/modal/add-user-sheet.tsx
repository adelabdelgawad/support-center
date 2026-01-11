"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/custom-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useConfirmationDialog } from "@/hooks/use-confirmation-dialog";
import { useAuthUsers, useClearAuthUsersCache } from "@/hooks/use-domain-users";
import { useDebouncedState } from "@/hooks/use-debounced-search";
import { useRoles } from "@/hooks/use-roles";
import { Loader2, Plus, RefreshCw, User, Users } from "lucide-react";
import { syncDomainUsers } from "@/lib/api/domain-users";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DomainUsersSelect, type DomainUserOption } from "@/components/ui/domain-users-select";
import { RolesSelect, type RoleOption } from "@/components/ui/roles-select";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import type { AuthUserResponse, UserCreate } from "@/types/users";



interface FormData {
  selectedUser: DomainUserOption | null;
  selectedRoles: RoleOption[];
}

interface AddUserSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (user: UserCreate) => Promise<void>;
}

const initialFormData: FormData = {
  selectedUser: null,
  selectedRoles: [],
};

export function AddUserSheet({
  open,
  onOpenChange,
  onSave,
}: AddUserSheetProps) {
  // Fetch roles from API
  const { roles, isLoading: isLoadingRoles } = useRoles({ enabled: open });

  // Debounced search for domain users
  const [searchValue, setSearchValue, debouncedSearch] = useDebouncedState("", 300);

  // Fetch domain users with pagination and search
  const {
    isLoading: isLoadingUsers,
    paginatedOptions,
    mutate: mutateUsers,
  } = useAuthUsers({
    search: debouncedSearch,
    page: 1,
    limit: 50,
    enabled: open,
  });

  // Hook for clearing cache
  const { clearCache } = useClearAuthUsersCache();

  const {
    isOpen: showSaveConfirmDialog,
    _isLoading: saveConfirmLoading,
    openDialog: openSaveDialog,
    closeDialog: closeSaveDialog,
    handleConfirm: handleSaveConfirm,
    dialogProps: saveDialogProps,
  } = useConfirmationDialog({
    title: "Create User",
    description: "Are you sure you want to create this user?",
    confirmText: "Create",
    cancelText: "Cancel",
    variant: "default",
  });
  const {
    isOpen: showCancelConfirmDialog,
    _isLoading: cancelConfirmLoading,
    openDialog: openCancelDialog,
    closeDialog: closeCancelDialog,
    handleConfirm: handleCancelConfirm,
    dialogProps: cancelDialogProps,
  } = useConfirmationDialog({
    title: "Discard Changes",
    description: "Are you sure you want to discard your changes?",
    confirmText: "Discard",
    cancelText: "Cancel",
    variant: "warning",
  });

  const originalFormData = useRef<FormData>(initialFormData);

  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Create role options with proper array check
  const roleOptions: RoleOption[] = useMemo(() => {
    if (!Array.isArray(roles)) {
      return [];
    }

    return roles
      .filter((role) => role.isActive)
      .map((role) => ({
        value: role.id,
        label: role.name || "Unknown Role",
        description: role.description || undefined,
      }));
  }, [roles]);

  const resetForm = useCallback(() => {
    const resetData = { ...initialFormData };
    setFormData(resetData);
    originalFormData.current = resetData;
    setHasChanges(false);
    setIsSubmitting(false);
  }, []);

  // Check if form has changes
  const checkForChanges = useCallback((currentData: FormData) => {
    const hasUserChanged =
      currentData.selectedUser?.value !==
      originalFormData.current.selectedUser?.value;
    const hasRolesChanged =
      currentData.selectedRoles.length !==
        originalFormData.current.selectedRoles.length ||
      currentData.selectedRoles.some(
        (role) =>
          !originalFormData.current.selectedRoles.find(
            (originalRole) => originalRole.value === role.value
          )
      );

    return hasUserChanged || hasRolesChanged;
  }, []);

  // Update hasChanges when form _data changes
  useEffect(() => {
    const changes = checkForChanges(formData);
    setHasChanges(changes);
  }, [formData, checkForChanges]);

  // Reset form when sheet opens
  useEffect(() => {
    if (open) {
      resetForm();
    }
  }, [open, resetForm]);

  const handleUserSelect = useCallback((option: DomainUserOption | null) => {
    setFormData((prev) => ({ ...prev, selectedUser: option }));
  }, []);

  const handleRoleSelect = useCallback((options: RoleOption[]) => {
    setFormData((prev) => ({ ...prev, selectedRoles: options }));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.selectedUser || formData.selectedRoles.length === 0) {
      toast.error("Please select a user and at least one role");
      return;
    }

    openSaveDialog(performSave);
  };

  const performSave = async () => {
    setIsSubmitting(true);

    try {
      const roleIds = formData.selectedRoles.map((role) => role.value);

      const userToCreate: UserCreate = {
        username: formData.selectedUser!.user.username,
        fullName: formData.selectedUser!.user.fullName || undefined,
        title: formData.selectedUser!.user.title || undefined,
        email: formData.selectedUser!.user.email || undefined,
        isTechnician: true, // Default to technician
        roleIds: roleIds,
      };

      await onSave(userToCreate);

      resetForm();
      onOpenChange(false);
    } catch (_error) {
      // Error handled by parent
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSyncDomainUsers = async () => {
    setIsSyncing(true);
    try {
      const result = await syncDomainUsers();
      toast.success(`Successfully synced ${result.syncedCount} domain users`, {
        description: result.message,
      });
      // Clear cache and revalidate to refresh the list
      clearCache();
      setSearchValue("");
      await mutateUsers();
    } catch (error: any) {
      toast.error("Failed to sync domain users", {
        description: error.message || "An error occurred during sync",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCancel = () => {
    if (hasChanges) {
      openCancelDialog(performCancel);
    } else {
      performCancel();
    }
  };

  // Create the performCancel function separately:
  const performCancel = () => {
    resetForm();
    onOpenChange(false);
  };

  const isBusy = isSubmitting || isLoadingRoles;

  return (
    <>
      <Sheet open={open} onOpenChange={handleCancel}>
        <SheetContent
          className="w-full sm:max-w-2xl lg:max-w-3xl flex flex-col p-0"
          side="right"
        >
          {/* Fixed Header */}
          <SheetHeader className="px-6 py-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <SheetTitle className="flex items-center gap-3 text-lg font-semibold">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Plus className="h-5 w-5 text-primary" />
              </div>
              Add New User
            </SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground">
              Select a domain user and assign roles to create a new user account.
            </SheetDescription>
          </SheetHeader>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-6 space-y-6">
                {/* User Selection Card */}
                <Card className="border-2 border-muted hover:border-primary/30 transition-all duration-200">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-base font-medium">
                        <User className="h-4 w-4 text-primary" />
                        Select User
                        <span className="text-destructive text-sm">*</span>
                      </CardTitle>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSyncDomainUsers}
                        disabled={isSyncing || isBusy}
                        className="h-8 px-3"
                      >
                        {isSyncing ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                            Syncing...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 mr-2" />
                            Sync Users
                          </>
                        )}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <DomainUsersSelect
                      options={paginatedOptions as any}
                      value={formData.selectedUser}
                      onChange={handleUserSelect}
                      searchValue={searchValue}
                      onSearchChange={setSearchValue}
                      placeholder="Search for a user..."
                      isLoading={isLoadingUsers}
                      disabled={isBusy}
                    />

                    {formData.selectedUser && (
                      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mt-4">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                            <User className="w-5 h-5 text-primary" />
                          </div>
                          <div className="flex-1 space-y-2">
                            <h4 className="font-medium text-sm text-primary">
                              Selected User
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                              <div>
                                <span className="font-medium text-muted-foreground block mb-1">
                                  Username:
                                </span>
                                <div className="font-medium">
                                  {formData.selectedUser.user.username}
                                </div>
                              </div>
                              {formData.selectedUser.user.fullName && (
                                <div>
                                  <span className="font-medium text-muted-foreground block mb-1">
                                    Full Name:
                                  </span>
                                  <div className="font-medium">
                                    {formData.selectedUser.user.fullName}
                                  </div>
                                </div>
                              )}
                              {formData.selectedUser.user.email && (
                                <div>
                                  <span className="font-medium text-muted-foreground block mb-1">
                                    Email:
                                  </span>
                                  <div className="font-medium">
                                    {formData.selectedUser.user.email}
                                  </div>
                                </div>
                              )}
                              {formData.selectedUser.user.title && (
                                <div>
                                  <span className="font-medium text-muted-foreground block mb-1">
                                    Title:
                                  </span>
                                  <div className="font-medium">
                                    {formData.selectedUser.user.title}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Roles Selection Card */}
                <Card className="border-2 border-muted hover:border-primary/30 transition-all duration-200">
                  <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-base font-medium">
                        <Users className="h-4 w-4 text-primary" />
                        Roles
                        <span className="text-destructive text-sm">*</span>
                      </CardTitle>
                      <Badge
                        variant="secondary"
                        className="font-normal text-xs px-2 py-1"
                      >
                        {formData.selectedRoles.length}{" "}
                        {formData.selectedRoles.length === 1 ? "role" : "roles"}{" "}
                        selected
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <RolesSelect
                      options={roleOptions}
                      value={formData.selectedRoles}
                      onChange={handleRoleSelect}
                      placeholder="Select roles..."
                      disabled={isBusy}
                      isLoading={isLoadingRoles}
                    />
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          </div>

          {/* Fixed Footer */}
          <SheetFooter className="p-6 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex flex-col-reverse sm:flex-row gap-3 w-full">
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={isBusy}
                className="flex-1 sm:flex-none min-w-[120px] h-10"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={
                  !formData.selectedUser ||
                  formData.selectedRoles.length === 0 ||
                  isBusy
                }
                className="flex-1 sm:flex-none min-w-[120px] h-10"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Create User
                  </>
                )}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Save Confirmation Dialog */}
      <ConfirmationDialog
        open={showSaveConfirmDialog}
        onOpenChange={closeSaveDialog}
        onConfirm={handleSaveConfirm}
        _isLoading={saveConfirmLoading}
        {...saveDialogProps}
      />

      <ConfirmationDialog
        open={showCancelConfirmDialog}
        onOpenChange={closeCancelDialog}
        onConfirm={handleCancelConfirm}
        _isLoading={cancelConfirmLoading}
        {...cancelDialogProps}
      />
    </>
  );
}