 
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
import { getRolePages, updateRolePages } from "@/lib/api/roles";
import { Loader2, Save, FileText, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { UnsavedChangesWarning } from '@/components/ui/unsaved-changes-warning';
import Select, { MultiValue, components, type OptionProps } from 'react-select';
import type { RoleResponse } from "@/types/roles";
import type { PageResponse } from "@/types/pages";

interface EditRolePagesSheetProps {
  role: RoleResponse;
  preloadedPages: PageResponse[];
  onMutate?: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  preloadedPages,
  onMutate,
  open,
  onOpenChange,
}: EditRolePagesSheetProps) {
  const [_isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [originalPageIds, setOriginalPageIds] = useState<number[]>([]);
  const [selectedPageIds, setSelectedPageIds] = useState<number[]>([]);
  const selectRef = useRef<any>(null);

  // Fetch role pages on mount
  useEffect(() => {
    if (!open) {
      // Reset state when closing
      setOriginalPageIds([]);
      setSelectedPageIds([]);
      setIsFetching(true);
      return;
    }

    const fetchRolePages = async () => {
      setIsFetching(true);
      try {
        const response = await getRolePages(role.id, true);
        const pageIds = response.pages
          .map((page) => page.id)
          .filter((id): id is number => id !== undefined);
        setOriginalPageIds(pageIds);
        setSelectedPageIds(pageIds);
      } catch (_error) {
        toastError("Failed to load role pages");
      } finally {
        setIsFetching(false);
      }
    };

    fetchRolePages();
  }, [role.id, open]);

  // Convert active pages to options
  const pageOptions: PageOptionType[] = useMemo(
    () =>
      preloadedPages
        .filter((page) => page._isActive || page.isActive)
        .map((page) => ({
          value: page.id,
          label: page.title || page.enTitle || "",
          ...(page.description || page.enDescription ? { description: page.description ?? page.enDescription } : {}),
        }))
        .filter((opt): opt is PageOptionType => typeof opt.value === 'number' && typeof opt.label === 'string' && opt.label !== null),
    [preloadedPages]
  );

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
    if (selectedPageIds.length !== originalPageIds.length) {return true;}
    return !selectedPageIds.every((_id) => originalPageIds.includes(_id));
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
    setIsLoading(true);
    try {
      await updateRolePages(role.id, originalPageIds, selectedPageIds);
      toastSuccess("Role pages updated successfully");
      if (onMutate) {onMutate();}
      onOpenChange(false);
    } catch (_error) {
      toastError(
        _error instanceof Error ? _error.message : "Failed to update role pages"
      );
    } finally {
      setIsLoading(false);
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
      <Sheet open={open} onOpenChange={onOpenChange}>
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

          <UnsavedChangesWarning show={hasChanges && !isFetching} className="mt-4" />

          {isFetching ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
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
                  isDisabled={_isLoading}
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
          )}

          <SheetFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={_isLoading || isFetching}
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveClick}
              disabled={_isLoading || isFetching || !hasChanges}
            >
              {_isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
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
