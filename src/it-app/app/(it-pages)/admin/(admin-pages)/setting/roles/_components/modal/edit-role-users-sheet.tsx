"use client";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useConfirmationDialog } from "@/hooks/use-confirmation-dialog";
import { Loader2, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { UnsavedChangesWarning } from '@/components/ui/unsaved-changes-warning';
import { toastSuccess, toastError } from "@/lib/toast";
import Select, { MultiValue, components, OptionProps } from "react-select";
import { updateRoleUsers } from "@/lib/api/roles";
import type { RoleResponse } from "@/types/roles";
import type { AuthUserResponse } from "@/types/users";

interface UserOptionType {
  value: string;  // UUID
  label: string;
  username: string;
  email?: string | null;
}

interface EditRoleUsersSheetProps {
  role: RoleResponse;
  currentUsers: AuthUserResponse[];  // Users currently assigned to role
  availableUsers: AuthUserResponse[];  // All available users
  onMutate?: (updatedRole: RoleResponse) => void;
  onSuccess?: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CustomUserOption = (props: OptionProps<UserOptionType, true>) => {
  return (
    <components.Option {...props}>
      <div>
        <div className="font-medium">{props.data.label}</div>
        {props.data.email && (
          <div className="text-xs text-muted-foreground">{props.data.email}</div>
        )}
      </div>
    </components.Option>
  );
};

export function EditRoleUsersSheet({
  role,
  currentUsers,
  availableUsers,
  onMutate,
  onSuccess,
  open,
  onOpenChange,
}: EditRoleUsersSheetProps) {
  const roleId = role.id;
  const [isSaving, setIsSaving] = useState(false);

  // Extract original user IDs (UUIDs as strings)
  const originalUserIds = useMemo(
    () => currentUsers.map((u) => u.id),
    [currentUsers]
  );

  // Options derived from available users, ensuring currently assigned users are included
  const userOptions: UserOptionType[] = useMemo(() => {
    const userMap = new Map<string, UserOptionType>();

    // First, add all currently assigned users (even if not in availableUsers)
    currentUsers.forEach((u) => {
      userMap.set(u.id, {
        value: u.id,
        label: u.username,
        username: u.username,
        email: u.fullName || null,
      });
    });

    // Then add/update with all available users
    availableUsers.forEach((u) => {
      userMap.set(u.id, {
        value: u.id,
        label: u.username,
        username: u.username,
        email: u.fullName || null,
      });
    });

    // Convert to array and sort by username
    return Array.from(userMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [availableUsers, currentUsers]);

  // Initialize selected users from current users
  const [selectedUsers, setSelectedUsers] = useState<MultiValue<UserOptionType>>(
    userOptions.filter((opt) => originalUserIds.includes(opt.value))
  );

  // Change detection
  const hasChanges = useMemo(() => {
    const curr = selectedUsers.map((u) => u.value).sort();
    const orig = [...originalUserIds].sort();
    return (
      curr.length !== orig.length || curr.some((id, idx) => id !== orig[idx])
    );
  }, [selectedUsers, originalUserIds]);

  // Confirmation dialog
  const {
    isOpen: confirmOpen,
    _isLoading: confirmLoading,
    openDialog,
    closeDialog,
    handleConfirm: confirmSave,
    dialogProps,
  } = useConfirmationDialog({
    title: "Save changes?",
    description: "Are you sure you want to update users for this role?",
    confirmText: "Save",
    cancelText: "Cancel",
    variant: "default",
  });

  // Save handler
  const performSave = async () => {
    setIsSaving(true);
    try {
      const updatedIds = selectedUsers.map((u) => u.value);
      // Call API to update role users with original and updated IDs
      const updatedRole = await updateRoleUsers(roleId, originalUserIds, updatedIds);

      toastSuccess("Role users updated!");
      if (onMutate) onMutate(updatedRole);
      if (onSuccess) onSuccess();
      onOpenChange(false);
    } catch (error) {
      toastError(error instanceof Error ? error.message : "Failed to update role users");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = () => {
    if (!hasChanges) return;
    openDialog(performSave);
  };

  const handleCancel = () => {
    const reset = userOptions.filter((o) =>
      originalUserIds.includes(o.value)
    );
    setSelectedUsers(reset);
    onOpenChange(false);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={handleCancel}>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Edit users assigned to this role
            </SheetTitle>
            <SheetDescription>Choose which users are assigned to this role. Any changes will require confirmation.</SheetDescription>
          </SheetHeader>

          <UnsavedChangesWarning show={hasChanges} className="mt-4" />

          <div className="py-6">
            <div className="space-y-2">
              <Label className="text-sm">
                Assigned Users{" "}
                ({selectedUsers.length} selected)
              </Label>

              <Select<UserOptionType, true>
                instanceId="role-users-select"
                options={userOptions}
                isMulti
                isSearchable
                onChange={setSelectedUsers}
                value={selectedUsers}
                placeholder="Search users..."
                className="react-select-container"
                classNamePrefix="react-select"
                components={{ Option: CustomUserOption }}
                isDisabled={isSaving}
                maxMenuHeight={200}
                menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
                menuPosition="fixed"
                menuShouldBlockScroll={false}
                styles={{
                  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                  menuList: (base) => ({
                    ...base,
                    maxHeight: 200,
                    overflowY: 'auto',
                  }),
                }}
                noOptionsMessage={({ inputValue }) =>
                  inputValue
                    ? `No users found matching "${inputValue}"`
                    : "No users available"
                }
                filterOption={(option, inputVal) => {
                  if (!inputVal) return true;
                  const term = inputVal.toLowerCase();
                  return (
                    option.label.toLowerCase().includes(term) ||
                    (option.data.email?.toLowerCase() ?? "").includes(term)
                  );
                }}
              />
            </div>
          </div>

          <SheetFooter>
            <div className="flex flex-col-reverse sm:flex-row gap-3 w-full">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={isSaving}
                className="flex-1 sm:flex-none min-w-[120px]"
              >
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={!hasChanges || isSaving}
                className="flex-1 sm:flex-none min-w-[120px]"
              >
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmationDialog
        open={confirmOpen}
        onOpenChange={closeDialog}
        onConfirm={confirmSave}
        _isLoading={confirmLoading}
        {...dialogProps}
      />
    </>
  );
}
