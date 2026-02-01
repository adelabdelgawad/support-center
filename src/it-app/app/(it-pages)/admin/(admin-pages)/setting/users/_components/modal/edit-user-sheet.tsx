"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Select, { MultiValue, components, type OptionProps } from 'react-select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Edit, Loader2, Save, X } from "lucide-react";
import { toast } from "@/components/ui/custom-toast";
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { useConfirmationDialog } from '@/hooks/use-confirmation-dialog';
import { updateUserRoles, toggleUserStatus } from '@/lib/api/users';
import { UnsavedChangesWarning } from '@/components/ui/unsaved-changes-warning';
import { useRoles } from '@/hooks/use-roles';
import { Switch } from "@/components/ui/switch";
import type { UserWithRolesResponse } from '@/types/users';

interface EditUserSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserWithRolesResponse;
  onSuccess: () => void;
  onUserUpdated?: (updatedUser: UserWithRolesResponse) => void;
}

type OptionType = {
  value: string;
  label: string;
  description: string;
};

const CustomOption = (props: OptionProps<OptionType, true>) => {
  return (
    <components.Option {...props}>
      <div>
        <div style={{ fontWeight: 500 }}>{props.data.label}</div>
        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>{props.data.description}</div>
      </div>
    </components.Option>
  );
};

function areRolesEqual(a: MultiValue<OptionType>, b: MultiValue<OptionType>) {
  if (a.length !== b.length) return false;
  const aIds = a.map(r => r.value).sort();
  const bIds = b.map(r => r.value).sort();
  return aIds.every((id, idx) => id === bIds[idx]);
}

export function EditUserSheet({
  open,
  onOpenChange,
  user,
  onSuccess,
  onUserUpdated,
}: EditUserSheetProps) {
  // Fetch roles from API
  const { roles, isLoading: isLoadingRoles } = useRoles({ enabled: open });

  const [selectedRoles, setSelectedRoles] = useState<MultiValue<OptionType>>([]);
  const [isActive, setIsActive] = useState(user.isActive);
  const [isLoading, setIsLoading] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Confirmation dialog for closing with unsaved changes
  const {
    isOpen: showCloseConfirmDialog,
    _isLoading: closeConfirmLoading,
    openDialog: openCloseDialog,
    closeDialog: closeCloseDialog,
    handleConfirm: handleCloseConfirm,
    dialogProps: closeDialogProps
  } = useConfirmationDialog({
    title: 'Confirm Close',
    description: 'You have unsaved changes. Are you sure you want to close?',
    confirmText: 'Close',
    cancelText: 'Cancel',
    variant: 'warning'
  });

  // Confirmation dialog for saving changes
  const {
    isOpen: showSaveConfirmDialog,
    _isLoading: saveConfirmLoading,
    openDialog: openSaveDialog,
    closeDialog: closeSaveDialog,
    handleConfirm: handleSaveConfirm,
    dialogProps: saveDialogProps
  } = useConfirmationDialog({
    title: 'Confirm Save',
    description: 'Are you sure you want to save these changes?',
    confirmText: 'Save',
    cancelText: 'Cancel',
    variant: 'default'
  });

  // Store initial values in a ref to avoid re-renders
  const initialValues = useRef<{ roles: MultiValue<OptionType>; isActive: boolean }>({
    roles: [],
    isActive: true
  });

  // Create options from roles - memoize to prevent recreation
  const options: OptionType[] = useMemo(() =>
    (roles || [])
      .filter(role => role.isActive)
      .map(role => ({
        value: role.id,
        label: role.name,
        description: role.description || ''
      })), [roles]
  );

  // Initialize form when sheet opens
  useEffect(() => {
    if (open && user && options.length > 0) {
      setIsMounted(true);

      const userSelectedRoles = options.filter(option =>
        user.roleIds.includes(option.value)
      );
      setSelectedRoles(userSelectedRoles);
      setIsActive(user.isActive);

      initialValues.current = {
        roles: userSelectedRoles,
        isActive: user.isActive
      };

      setIsDirty(false);
    }
  }, [open, user, options]);

  // Efficient isDirty logic
  useEffect(() => {
    if (!isMounted) return;
    const rolesChanged = !areRolesEqual(selectedRoles, initialValues.current.roles);
    const statusChanged = isActive !== initialValues.current.isActive;
    setIsDirty(rolesChanged || statusChanged);
  }, [selectedRoles, isActive, isMounted]);

  const handleRoleChange = (newSelectedRoles: MultiValue<OptionType>) => {
    setSelectedRoles(newSelectedRoles);
  };

  const closeSheet = () => {
    setSelectedRoles([]);
    setIsActive(user.isActive);
    setIsDirty(false);
    setIsMounted(false);
    onOpenChange(false);
  };

  const handleClose = () => {
    if (isDirty) {
      openCloseDialog(closeSheet);
      return;
    }
    closeSheet();
  };

  const performSave = async () => {
    setIsLoading(true);

    try {
      const rolesChanged = !areRolesEqual(selectedRoles, initialValues.current.roles);
      const statusChanged = isActive !== initialValues.current.isActive;

      let updatedUser: UserWithRolesResponse | null = null;

      // Update roles if changed
      if (rolesChanged) {
        const originalRoleIds = initialValues.current.roles.map((role: OptionType) => role.value);
        const updatedRoleIds = selectedRoles.map((role: OptionType) => role.value);
        await updateUserRoles({
          userId: user.id,
          originalRoleIds,
          updatedRoleIds
        });
      }

      // Toggle status if changed — use the response which has the latest user state
      if (statusChanged) {
        updatedUser = await toggleUserStatus(user.id, isActive);
      }

      toast.success("User updated successfully");
      setIsDirty(false);
      onOpenChange(false);

      // Build updated user from API response or local state
      if (!updatedUser) {
        const updatedRoleIds = selectedRoles.map((role: OptionType) => role.value);
        const updatedRoleObjects = (roles || []).filter(r => updatedRoleIds.includes(r.id));
        updatedUser = {
          ...user,
          isActive: isActive,
          roleIds: updatedRoleIds,
          roles: updatedRoleObjects.map(r => ({ id: String(r.id) || '0', name: r.name })),
        };
      }

      if (onUserUpdated) {
        onUserUpdated(updatedUser);
      } else {
        onSuccess();
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update user"
      );
      throw error; // Re-throw to prevent dialog from closing
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    openSaveDialog(performSave);
  };

  if (!isMounted) return null;

  const isBusy = isLoading || isLoadingRoles;

  return (
    <>
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent
          className="w-full sm:max-w-2xl overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Edit User
            </SheetTitle>
            <SheetDescription>
              Edit status and roles for {user.username}
            </SheetDescription>
          </SheetHeader>

          <UnsavedChangesWarning show={isDirty} className="mt-4" />

          {/* User Info Display */}
          <div className="grid grid-cols-1 gap-4 border rounded-md p-4 bg-muted/50 text-sm sm:grid-cols-3 mt-6">
            <div>
              <Label className="text-muted-foreground">Username</Label>
              <div>{user.username}</div>
            </div>
            <div>
              <Label className="text-muted-foreground">Full Name</Label>
              <div>{user.fullName || "-"}</div>
            </div>
            <div>
              <Label className="text-muted-foreground">Title</Label>
              <div>{user.title || "-"}</div>
            </div>
          </div>

          {/* Status Toggle */}
          <div className="flex items-center justify-between border rounded-md p-4 bg-muted/50 mt-4">
            <div className="space-y-0.5">
              <Label htmlFor="user-status" className="text-sm font-medium">
                User Status
              </Label>
              <p className="text-sm text-muted-foreground">
                {isActive ? "User can access the system" : "User is blocked from system access"}
              </p>
            </div>
            <Switch
              id="user-status"
              checked={isActive}
              onCheckedChange={setIsActive}
              disabled={isBusy}
              className="data-[state=checked]:bg-green-600"
            />
          </div>

          <form onSubmit={handleSubmit} className="space-y-6 mt-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="roles">Roles</Label>
                <Select<OptionType, true>
                  instanceId="user-roles-select"
                  options={options}
                  isMulti
                  onChange={handleRoleChange}
                  value={selectedRoles}
                  placeholder="Select roles..."
                  className="react-select-container"
                  classNamePrefix="react-select"
                  components={{
                    Option: CustomOption
                  }}
                  isDisabled={isBusy}
                  isLoading={isLoadingRoles}
                  menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
                  menuPosition="fixed"
                  menuShouldBlockScroll={false}
                  styles={{
                    menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                    menuList: (base) => ({
                      ...base,
                      maxHeight: 300,
                      overflowY: 'auto',
                    }),
                  }}
                />
              </div>
            </div>

            <SheetFooter className="pt-4">
              <div className="flex justify-end items-center w-full">
                <div className="flex space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClose}
                    disabled={isBusy}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isBusy || !isDirty}
                    className={isDirty ? "bg-primary" : ""}
                  >
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {!isLoading && <Save className="mr-2 h-4 w-4" />}
                    Save Changes
                  </Button>
                </div>
              </div>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* Close Confirmation Dialog */}
      <ConfirmationDialog
        open={showCloseConfirmDialog}
        onOpenChange={closeCloseDialog}
        onConfirm={handleCloseConfirm}
        _isLoading={closeConfirmLoading}
        {...closeDialogProps}
      />

      {/* Save Confirmation Dialog */}
      <ConfirmationDialog
        open={showSaveConfirmDialog}
        onOpenChange={closeSaveDialog}
        onConfirm={handleSaveConfirm}
        _isLoading={saveConfirmLoading}
        {...saveDialogProps}
      />
    </>
  );
}

