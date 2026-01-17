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
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useConfirmationDialog } from "@/hooks/use-confirmation-dialog";
import { Loader2, Building2, X, Save } from "lucide-react";
import React, { useEffect, useState, useRef } from "react";
import { toastSuccess, toastError } from "@/lib/toast";
import {
  bulkAssignUsers,
  bulkRemoveUsers,
} from "@/lib/api/business-unit-user-assigns";
import type { UserWithRolesResponse } from "@/types/users.d";

interface BusinessUnitResponse {
  id: number;
  name: string;
  description?: string | null;
  network?: string | null;
  businessUnitRegionId: number;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  updatedBy?: string | null;
}

interface AssignBusinessUnitsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserWithRolesResponse | null;
  onSuccess?: () => void;
}

function areBusinessUnitsEqual(a: number[], b: number[]) {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((id, idx) => id === sortedB[idx]);
}

export function AssignBusinessUnitsSheet({
  open,
  onOpenChange,
  user,
  onSuccess,
}: AssignBusinessUnitsSheetProps) {
  const [selectedBusinessUnitIds, setSelectedBusinessUnitIds] = useState<
    number[]
  >([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnitResponse[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Store initial values in a ref to avoid re-renders
  const initialValues = useRef<{ businessUnitIds: number[] }>({
    businessUnitIds: [],
  });

  // Confirmation dialog for closing with unsaved changes
  const {
    isOpen: showCloseConfirmDialog,
    openDialog: openCloseDialog,
    closeDialog: closeCloseDialog,
    handleConfirm: handleCloseConfirm,
    dialogProps: closeDialogProps,
  } = useConfirmationDialog({
    title: "Confirm Close",
    description: "You have unsaved changes. Are you sure you want to close?",
    confirmText: "Close",
    cancelText: "Cancel",
    variant: "warning",
  });

  // Confirmation dialog for saving changes
  const {
    isOpen: showSaveConfirmDialog,
    openDialog: openSaveDialog,
    closeDialog: closeSaveDialog,
    handleConfirm: handleSaveConfirm,
    dialogProps: saveDialogProps,
  } = useConfirmationDialog({
    title: "Confirm Save",
    description:
      "Are you sure you want to update business unit assignments for this user?",
    confirmText: "Save",
    cancelText: "Cancel",
    variant: "default",
  });

  // Load user's current business units and fetch all business units when sheet opens
  useEffect(() => {
    if (open && user) {
      setIsMounted(true);

      const currentBusinessUnitIds = user.businessUnits.map((bu) => bu.id);
      setSelectedBusinessUnitIds(currentBusinessUnitIds);
      initialValues.current = {
        businessUnitIds: currentBusinessUnitIds,
      };
      setIsDirty(false);

      // Fetch all business units
      const fetchBusinessUnits = async () => {
        setIsLoading(true);
        try {
          const response = await fetch("/api/setting/business-units", {
            credentials: "include",
          });
          if (!response.ok) {
            throw new Error("Failed to fetch business units");
          }
          const data = await response.json();
          setBusinessUnits(data.businessUnits || []);
        } catch (error) {
          console.error("Error fetching business units:", error);
          toastError("Failed to load business units");
        } finally {
          setIsLoading(false);
        }
      };

      fetchBusinessUnits();
    }
  }, [open, user]);

  // Efficient isDirty logic
  useEffect(() => {
    if (!isMounted) return;
    const dirty = !areBusinessUnitsEqual(
      selectedBusinessUnitIds,
      initialValues.current.businessUnitIds
    );
    setIsDirty(dirty);
  }, [selectedBusinessUnitIds, isMounted]);

  const handleToggleBusinessUnit = (businessUnitId: number) => {
    setSelectedBusinessUnitIds((prev) =>
      prev.includes(businessUnitId)
        ? prev.filter((id) => id !== businessUnitId)
        : [...prev, businessUnitId]
    );
  };

  const closeSheet = () => {
    setSelectedBusinessUnitIds([]);
    setBusinessUnits([]);
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
    if (!user) return;

    setIsSaving(true);
    try {
      // Find business units to add and remove
      const toAdd = selectedBusinessUnitIds.filter(
        (id) => !initialValues.current.businessUnitIds.includes(id)
      );
      const toRemove = initialValues.current.businessUnitIds.filter(
        (id) => !selectedBusinessUnitIds.includes(id)
      );

      // Process additions
      for (const businessUnitId of toAdd) {
        await bulkAssignUsers({
          userIds: [user.id],
          businessUnitId,
        });
      }

      // Process removals
      for (const businessUnitId of toRemove) {
        await bulkRemoveUsers({
          userIds: [user.id],
          businessUnitId,
        });
      }

      toastSuccess("Business units updated successfully");
      setIsDirty(false);
      onSuccess?.();
      closeSheet();
    } catch (error: any) {
      console.error("Error updating business units:", error);
      toastError(error.message || "Failed to update business units");
      throw error; // Re-throw to prevent dialog from closing
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    openSaveDialog(performSave);
  };

  if (!isMounted) return null;

  const activeBusinessUnits = businessUnits.filter((bu) => bu.isActive);
  const isBusy = isLoading || isSaving;

  return (
    <>
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent className="sm:max-w-[500px]">
          <SheetHeader>
            <SheetTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Assign Business Units
              </div>
              {isDirty && (
                <span className="text-sm text-orange-600 font-normal">
                  • Unsaved changes
                </span>
              )}
            </SheetTitle>
            <SheetDescription>
              Select business units to assign to <strong>{user?.username}</strong>
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit}>
            <ScrollArea className="h-[calc(100vh-240px)] pr-4 mt-6">
              <div className="space-y-2">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : activeBusinessUnits.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No active business units available
                  </div>
                ) : (
                  activeBusinessUnits.map((bu) => (
                    <div
                      key={bu.id}
                      className="flex items-center space-x-3 rounded-lg border p-3 hover:bg-accent transition-colors"
                    >
                      <Checkbox
                        id={`bu-${bu.id}`}
                        checked={selectedBusinessUnitIds.includes(bu.id)}
                        onCheckedChange={() => handleToggleBusinessUnit(bu.id)}
                        disabled={isBusy}
                      />
                      <label
                        htmlFor={`bu-${bu.id}`}
                        className="flex-1 cursor-pointer"
                      >
                        <div className="font-medium">{bu.name}</div>
                        {bu.description && (
                          <div className="text-sm text-muted-foreground">
                            {bu.description}
                          </div>
                        )}
                      </label>
                      {selectedBusinessUnitIds.includes(bu.id) && (
                        <Badge variant="default" className="text-xs">
                          Assigned
                        </Badge>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>

            <SheetFooter className="mt-4 pt-4">
              <div className="flex justify-between items-center w-full">
                <div className="text-sm text-muted-foreground">
                  {isDirty && "Unsaved changes"}
                </div>

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
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {!isSaving && <Save className="mr-2 h-4 w-4" />}
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
        {...closeDialogProps}
      />

      {/* Save Confirmation Dialog */}
      <ConfirmationDialog
        open={showSaveConfirmDialog}
        onOpenChange={closeSaveDialog}
        onConfirm={handleSaveConfirm}
        {...saveDialogProps}
      />
    </>
  );
}
