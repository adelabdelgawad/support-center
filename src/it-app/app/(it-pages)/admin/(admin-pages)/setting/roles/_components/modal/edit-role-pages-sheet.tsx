"use client";

import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { toastSuccess, toastError } from "@/lib/toast";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useConfirmationDialog } from "@/hooks/use-confirmation-dialog";
import { updateRolePages } from "@/lib/api/roles";
import { Loader2, Save, FileText, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { UnsavedChangesWarning } from '@/components/ui/unsaved-changes-warning';
import Select, { MultiValue, components, type OptionProps } from 'react-select';
import type { RoleResponse, PageRoleResponse } from "@/types/roles";
import type { PageResponse } from "@/types/pages";

interface EditRolePagesSheetProps {
  role: RoleResponse;
  currentPages: PageRoleResponse[];  // Pages currently assigned to role
  availablePages: PageResponse[];  // All available pages
  onMutate?: (updatedRole: RoleResponse) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type PageOptionType = {
  value: number;
  label: string;
  description?: string;
};

// Custom Option component
const CustomPageOption = (props: OptionProps<PageOptionType, true>) => (
  <components.Option {...props}>
    <div>
      <div className="font-medium">{props.data.label}</div>
      {props.data.description && (
        <div className="text-sm text-muted-foreground">
          {props.data.description}
        </div>
      )}
    </div>
  </components.Option>
);

export function EditRolePagesSheet({
  role,
  currentPages,
  availablePages,
  onMutate,
  open = false,
  onOpenChange = () => {},
}: EditRolePagesSheetProps) {
  const [isSaving, setIsSaving] = useState(false);

  // Extract original page IDs
  const originalPageIds = useMemo(
    () => currentPages
      .map((page) => page.id)
      .filter((id): id is number => id !== undefined),
    [currentPages]
  );

  // Track selected page IDs
  const [selectedPageIds, setSelectedPageIds] = useState<number[]>(originalPageIds);

  const selectRef = useRef<any>(null);

  // Convert pages to options, ensuring currently assigned pages are included even if inactive
  const pageOptions: PageOptionType[] = useMemo(() => {
    // Create a map to track all pages
    const pageMap = new Map<number, PageOptionType>();

    // First, add all currently assigned pages (including inactive ones)
    currentPages.forEach((page) => {
      if (typeof page.id === 'number' && page.title) {
        pageMap.set(page.id, {
          value: page.id,
          label: page.title,
          ...(page.description ? { description: page.description } : {}),
        });
      }
    });

    // Then add all active pages from availablePages
    availablePages
      .filter((page) => page._isActive || page.isActive)
      .forEach((page) => {
        if (typeof page.id === 'number' && (page.title || page.enTitle)) {
          const desc = page.description || page.enDescription;
          pageMap.set(page.id, {
            value: page.id,
            label: page.title || page.enTitle || "",
            ...(desc ? { description: desc } : {}),
          });
        }
      });

    // Convert map to array and sort by label
    return Array.from(pageMap.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [availablePages, currentPages]);

  // Convert selected page IDs to selected options
  const selectedOptions = useMemo(
    () => pageOptions.filter((option) => selectedPageIds.includes(option.value)),
    [pageOptions, selectedPageIds]
  );

  // Handle selection change
  const handleSelectionChange = (newValue: MultiValue<PageOptionType>) => {
    setSelectedPageIds(newValue.map((option) => option.value));
  };

  // Check if there are changes
  const hasChanges = useMemo(() => {
    if (selectedPageIds.length !== originalPageIds.length) return true;
    return !selectedPageIds.every((id) => originalPageIds.includes(id));
  }, [selectedPageIds, originalPageIds]);

  // Confirmation dialog
  const {
    isOpen: showConfirmDialog,
    _isLoading: confirmLoading,
    openDialog,
    closeDialog,
    handleConfirm,
    dialogProps,
  } = useConfirmationDialog({
    title: "Update Role Pages",
    description: `Are you sure you want to update the pages for "${role.name}"?`,
    confirmText: "Update",
    cancelText: "Cancel",
    variant: "default",
  });

  // Perform save
  const performSave = async () => {
    setIsSaving(true);
    try {
      const updatedRole = await updateRolePages(role.id, originalPageIds, selectedPageIds);
      toastSuccess("Role pages updated successfully");
      if (onMutate) onMutate(updatedRole);
      onOpenChange(false);
    } catch (error) {
      toastError(
        error instanceof Error ? error.message : "Failed to update role pages"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveClick = () => {
    if (!hasChanges) {
      onOpenChange(false);
      return;
    }
    openDialog(performSave);
  };

  const handleCancel = () => {
    setSelectedPageIds(originalPageIds);
    onOpenChange(false);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={handleCancel}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Edit Pages for {role.name}
            </SheetTitle>
            <SheetDescription>
              Select the pages that this role can access. Changes will apply to all users with this role.
            </SheetDescription>
          </SheetHeader>

          <UnsavedChangesWarning show={hasChanges} className="mt-4" />

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Pages ({selectedPageIds.length} selected)</Label>
              <Select
                ref={selectRef}
                isMulti
                value={selectedOptions}
                onChange={handleSelectionChange}
                options={pageOptions}
                components={{ Option: CustomPageOption }}
                placeholder="Select pages..."
                className="react-select-container"
                classNamePrefix="react-select"
                isDisabled={isSaving}
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

          <SheetFooter>
            <div className="flex flex-col-reverse sm:flex-row gap-3 w-full">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={isSaving}
                className="flex-1 sm:flex-none min-w-[120px]"
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSaveClick}
                disabled={isSaving || !hasChanges}
                className="flex-1 sm:flex-none min-w-[120px]"
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Changes
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmationDialog
        open={showConfirmDialog}
        onOpenChange={closeDialog}
        onConfirm={handleConfirm}
        _isLoading={confirmLoading}
        {...dialogProps}
      />
    </>
  );
}
