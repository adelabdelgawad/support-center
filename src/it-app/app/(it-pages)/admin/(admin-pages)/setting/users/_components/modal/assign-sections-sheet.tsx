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
import { Loader2, Layers, X, Save } from "lucide-react";
import React, { useEffect, useState, useRef } from "react";
import { toastSuccess, toastError } from "@/lib/toast";
import type { Section } from "@/lib/api/sections";
import type { UserWithRolesResponse, UserSectionInfo } from "@/types/users.d";

interface AssignSectionsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserWithRolesResponse | null;
  sections: Section[];
  onSuccess?: (updatedSections: UserSectionInfo[]) => void;
}

function areSectionsEqual(a: number[], b: number[]) {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((id, idx) => id === sortedB[idx]);
}

export function AssignSectionsSheet({
  open,
  onOpenChange,
  user,
  sections,
  onSuccess,
}: AssignSectionsSheetProps) {
  const [selectedSectionIds, setSelectedSectionIds] = useState<number[]>(
    []
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Store initial values in a ref to avoid re-renders
  const initialValues = useRef<{ sectionIds: number[] }>({
    sectionIds: [],
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
      "Are you sure you want to update section assignments for this user?",
    confirmText: "Save",
    cancelText: "Cancel",
    variant: "default",
  });

  // Initialize user's current sections when sheet opens
  useEffect(() => {
    if (open && user) {
      setIsMounted(true);

      const currentSectionIds = (user.sections || []).map((s) => s.sectionId);
      setSelectedSectionIds(currentSectionIds);
      initialValues.current = {
        sectionIds: currentSectionIds,
      };
      setIsDirty(false);
    }
  }, [open, user]);

  // Efficient isDirty logic
  useEffect(() => {
    if (!isMounted) return;
    const dirty = !areSectionsEqual(
      selectedSectionIds,
      initialValues.current.sectionIds
    );
    setIsDirty(dirty);
  }, [selectedSectionIds, isMounted]);

  const handleToggleSection = (sectionId: number) => {
    setSelectedSectionIds((prev) =>
      prev.includes(sectionId)
        ? prev.filter((id) => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  const closeSheet = () => {
    setSelectedSectionIds([]);
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
      // Call the backend API to set sections
      const response = await fetch(`/api/users/${user.id}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sectionIds: selectedSectionIds }),
      });

      if (!response.ok) {
        throw new Error("Failed to update sections");
      }

      const updatedSections: UserSectionInfo[] = await response.json();
      toastSuccess("Sections updated successfully");
      setIsDirty(false);
      onSuccess?.(updatedSections);
      closeSheet();
    } catch (error: any) {
      console.error("Error updating sections:", error);
      toastError(error.message || "Failed to update sections");
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

  const activeSections = sections.filter((s) => s.isActive);

  return (
    <>
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent className="sm:max-w-[500px]">
          <SheetHeader>
            <SheetTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-purple-600" />
                Assign Sections
              </div>
              {isDirty && (
                <span className="text-sm text-orange-600 font-normal">
                  • Unsaved changes
                </span>
              )}
            </SheetTitle>
            <SheetDescription>
              Select sections to assign to <strong>{user?.username}</strong>
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit}>
            <ScrollArea className="h-[calc(100vh-240px)] pr-4 mt-6">
              <div className="space-y-2">
                {activeSections.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No active sections available
                  </div>
                ) : (
                  activeSections.map((section) => (
                    <div
                      key={section.id}
                      className="flex items-center space-x-3 rounded-lg border p-3 hover:bg-accent transition-colors"
                    >
                      <Checkbox
                        id={`section-${section.id}`}
                        checked={selectedSectionIds.includes(section.id)}
                        onCheckedChange={() => handleToggleSection(section.id)}
                        disabled={isSaving}
                      />
                      <label
                        htmlFor={`section-${section.id}`}
                        className="flex-1 cursor-pointer"
                      >
                        <div className="font-medium">{section.shownNameEn}</div>
                        {section.description && (
                          <div className="text-sm text-muted-foreground">
                            {section.description}
                          </div>
                        )}
                      </label>
                      {selectedSectionIds.includes(section.id) && (
                        <Badge variant="default" className="text-xs bg-purple-600">
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
                    disabled={isSaving}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSaving || !isDirty}
                    className={isDirty ? "bg-purple-600 hover:bg-purple-700" : ""}
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
