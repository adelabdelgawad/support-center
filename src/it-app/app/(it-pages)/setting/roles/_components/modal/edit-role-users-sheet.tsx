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
import { Loader2, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { UnsavedChangesWarning } from '@/components/ui/unsaved-changes-warning';
import { toastSuccess, toastError } from "@/lib/toast";
import Select, { MultiValue, components, OptionProps } from "react-select";
import { fetchRoleUsers, updateRoleUsers } from "@/lib/api/roles";
import type { RoleResponse } from "@/types/roles";
import type { AuthUserResponse } from "@/types/users";

interface UserOptionType {
  value: number;
  label: string;
  username: string;
  email?: string | null;
}

interface EditRoleUsersSheetProps {
  role: RoleResponse;
  preloadedUsers: AuthUserResponse[];
  onMutate?: () => void;
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
  preloadedUsers,
  onMutate,
  onSuccess,
  open,
  onOpenChange,
}: EditRoleUsersSheetProps) {
  const roleId = role.id;
  const [selectedUsers, setSelectedUsers] = useState<
    MultiValue<UserOptionType>
  >([]);
  const [isLoading, setIsLoading] = useState(false);

  // Store original user IDs for comparison/reset
  const originalUserIds = useRef<number[]>([]);

  // Options derived from pre-loaded users
  const userOptions: UserOptionType[] = useMemo(
    () =>
      preloadedUsers.map((u) => ({
        value: typeof u.id === 'string' ? parseInt(u.id, 10) : u.id,
        label: u.username,
        username: u.username,
        email: u.fullName || null, // Using fullName as display info
      })),
    [preloadedUsers]
  );

  /* ------------------------------------------------------------------
   * Single effect: fetch role users + initialise selection on open
   * -----------------------------------------------------------------*/
  useEffect(() => {
    const fetchAndInit = async () => {
      if (!roleId || !open) {return;}

      setIsLoading(true);
      try {
        const users = await fetchRoleUsers(roleId);

        const initialSelected = userOptions.filter((opt) =>
          users.some((u) => (typeof u.id === 'string' ? parseInt(u.id, 10) : u.id) === opt.value)
        );
        setSelectedUsers(initialSelected);
        originalUserIds.current = initialSelected.map((u) => u.value);
      } catch {
        toastError("Failed to load role users");
      } finally {
        setIsLoading(false);
      }
    };

    fetchAndInit();
     
  }, [roleId, open, userOptions]);

  // Change detection
  const hasChanges = useMemo(() => {
    const curr = selectedUsers.map((u) => u.value).sort();
    const orig = [...originalUserIds.current].sort();
    return (
      curr.length !== orig.length || curr.some((_id, idx) => _id !== orig[idx])
    );
  }, [selectedUsers]);

  /* ------------------------------------------------------------------
   * Confirmation dialog
   * -----------------------------------------------------------------*/
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

  /* ------------------------------------------------------------------
   * Save & cancel handlers
   * -----------------------------------------------------------------*/
  const performSave = async () => {
    setIsLoading(true);
    try {
      const updatedIds = selectedUsers.map((u) => u.value);
      // Call API to update role users with original and updated IDs
      await updateRoleUsers(roleId, originalUserIds.current, updatedIds);

      toastSuccess("Role users updated!");
      if (onMutate) {onMutate();}
      if (onSuccess) {onSuccess();}
      onOpenChange(false);
    } catch {
      toastError("Failed to update role users");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = () => {
    if (!hasChanges) {return;}
    openDialog(performSave);
  };

  const handleCancel = () => {
    const reset = userOptions.filter((o) =>
      originalUserIds.current.includes(o.value)
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

          <UnsavedChangesWarning show={hasChanges && !isLoading} className="mt-4" />

          <div className="py-6">
            <div className="space-y-2">
              <Label className="text-sm">
                Assigned Users{" "}
                ({selectedUsers.length} selected)
              </Label>

              {isLoading ? (
                <div className="flex items-center justify-center h-[120px] border rounded-md">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
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
                  isDisabled={isLoading}
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
                    if (!inputVal) {return true;}
                    const term = inputVal.toLowerCase();
                    return (
                      option.label.toLowerCase().includes(term) ||
                      (option.data.email?.toLowerCase() ?? "").includes(term)
                    );
                  }}
                />
              )}
            </div>
          </div>

          <SheetFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={isLoading}
              size="sm"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasChanges || isLoading}
              size="sm"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
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
