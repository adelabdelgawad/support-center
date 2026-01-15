"use client";

import React, { useCallback, useState, useEffect, useRef } from "react";
import { useForm, UseFormReturn, FieldValues, DefaultValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Form } from "@/components/ui/form";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { UnsavedChangesWarning } from "@/components/ui/unsaved-changes-warning";
import { useConfirmationDialog } from "@/hooks/use-confirmation-dialog";
import { toastSuccess, toastError, toastWarning } from "@/lib/toast";
import { Loader2, Plus, Save, X, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

/**
 * Sheet size presets for consistent widths across settings pages
 */
export const SHEET_SIZES = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
  xl: "sm:max-w-3xl",
} as const;

export type SheetSize = keyof typeof SHEET_SIZES;

/**
 * Base props shared by all entity sheets
 */
interface BaseSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  size?: SheetSize;
  className?: string;
}

/**
 * Props for EntityFormSheet - handles Add/Edit operations
 */
export interface EntityFormSheetProps<TFormData extends FieldValues> extends BaseSheetProps {
  mode: "add" | "edit";
  title: string;
  description: string;
  icon?: LucideIcon;
  schema: z.ZodType<TFormData, any, any>;
  defaultValues: DefaultValues<TFormData>;
  onSubmit: (data: TFormData) => Promise<void>;
  children: (form: UseFormReturn<TFormData>) => React.ReactNode;
  submitButtonText?: string;
  submitButtonIcon?: LucideIcon;
  showUnsavedWarning?: boolean;
  requireConfirmation?: boolean;
  confirmationTitle?: string;
  confirmationDescription?: string;
}

/**
 * Props for EntityViewSheet - read-only display
 */
export interface EntityViewSheetProps extends BaseSheetProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  children: React.ReactNode;
}

/**
 * EntityFormSheet - Standardized form sheet for Add/Edit operations
 *
 * Features:
 * - react-hook-form + Zod validation
 * - Unsaved changes warning banner
 * - Confirmation dialogs for save and discard
 * - Consistent loading states
 * - Standardized layout with fixed header/footer
 */
export function EntityFormSheet<TFormData extends FieldValues>({
  open,
  onOpenChange,
  mode,
  title,
  description,
  icon: Icon,
  schema,
  defaultValues,
  onSubmit,
  children,
  size = "lg",
  className,
  submitButtonText,
  submitButtonIcon: SubmitIcon,
  showUnsavedWarning = true,
  requireConfirmation = true,
  confirmationTitle,
  confirmationDescription,
}: EntityFormSheetProps<TFormData>) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const initialValuesRef = useRef<DefaultValues<TFormData>>(defaultValues);

  const form = useForm<TFormData>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues,
  });

  const { isDirty } = form.formState;

  // Save confirmation dialog
  const {
    isOpen: showSaveConfirm,
    _isLoading: saveLoading,
    openDialog: openSaveDialog,
    closeDialog: closeSaveDialog,
    handleConfirm: handleSaveConfirm,
    dialogProps: saveDialogProps,
  } = useConfirmationDialog({
    title: confirmationTitle || (mode === "add" ? `Create ${title}` : "Save Changes"),
    description: confirmationDescription || (mode === "add"
      ? `Are you sure you want to create this ${title.toLowerCase()}?`
      : "Are you sure you want to save these changes?"),
    confirmText: mode === "add" ? "Create" : "Save",
    cancelText: "Cancel",
    variant: "default",
  });

  // Discard changes confirmation dialog
  const {
    isOpen: showDiscardConfirm,
    _isLoading: discardLoading,
    openDialog: openDiscardDialog,
    closeDialog: closeDiscardDialog,
    handleConfirm: handleDiscardConfirm,
    dialogProps: discardDialogProps,
  } = useConfirmationDialog({
    title: "Discard Changes",
    description: "You have unsaved changes. Are you sure you want to discard them?",
    confirmText: "Discard",
    cancelText: "Keep Editing",
    variant: "warning",
  });

  // Reset form when sheet opens with new default values
  useEffect(() => {
    if (open) {
      initialValuesRef.current = defaultValues;
      form.reset(defaultValues);
    }
  }, [open, defaultValues, form]);

  // Perform the actual save operation
  const performSave = useCallback(async () => {
    const formData = form.getValues();
    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      toastSuccess(mode === "add" ? `${title} created successfully` : `${title} updated successfully`);
      form.reset();
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "An error occurred";
      toastError(message);
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  }, [form, onSubmit, mode, title, onOpenChange]);

  // Handle form submission
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    const isFormValid = await form.trigger();
    if (!isFormValid) {
      toastWarning("Please fix validation errors");
      return;
    }

    if (requireConfirmation) {
      openSaveDialog(performSave);
    } else {
      await performSave();
    }
  }, [form, requireConfirmation, openSaveDialog, performSave]);

  // Handle close/cancel with unsaved changes check
  const handleClose = useCallback(() => {
    if (isDirty && showUnsavedWarning) {
      openDiscardDialog(() => {
        form.reset();
        onOpenChange(false);
      });
    } else {
      form.reset();
      onOpenChange(false);
    }
  }, [isDirty, showUnsavedWarning, openDiscardDialog, form, onOpenChange]);

  const isBusy = isSubmitting;
  const DefaultIcon = mode === "add" ? Plus : Save;
  const ButtonIcon = SubmitIcon || DefaultIcon;
  const buttonText = submitButtonText || (mode === "add" ? `Create ${title}` : "Save Changes");

  return (
    <>
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent
          className={cn(
            "w-full flex flex-col p-0",
            SHEET_SIZES[size],
            className
          )}
          side="right"
          hideClose
        >
          {/* Fixed Header */}
          <SheetHeader className="px-6 py-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <SheetTitle className="flex items-center gap-3 text-lg font-semibold">
              {Icon && (
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
              )}
              {mode === "add" ? `Add ${title}` : `Edit ${title}`}
            </SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground">
              {description}
            </SheetDescription>
          </SheetHeader>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-6">
                {showUnsavedWarning && (
                  <UnsavedChangesWarning show={isDirty} className="mb-6" />
                )}
                <Form {...form}>
                  <form id="entity-form" onSubmit={handleSubmit} className="space-y-6">
                    {children(form)}
                  </form>
                </Form>
              </div>
            </ScrollArea>
          </div>

          {/* Fixed Footer */}
          <SheetFooter className="px-6 py-4 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex flex-col-reverse sm:flex-row gap-3 w-full">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isBusy}
                className="flex-1 sm:flex-none min-w-[120px] h-10"
              >
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button
                type="submit"
                form="entity-form"
                disabled={isBusy || (mode === "edit" && !isDirty)}
                className="flex-1 sm:flex-none min-w-[120px] h-10"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {mode === "add" ? "Creating..." : "Saving..."}
                  </>
                ) : (
                  <>
                    <ButtonIcon className="mr-2 h-4 w-4" />
                    {buttonText}
                  </>
                )}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Save Confirmation Dialog */}
      <ConfirmationDialog
        open={showSaveConfirm}
        onOpenChange={closeSaveDialog}
        onConfirm={handleSaveConfirm}
        _isLoading={saveLoading}
        {...saveDialogProps}
      />

      {/* Discard Changes Confirmation Dialog */}
      <ConfirmationDialog
        open={showDiscardConfirm}
        onOpenChange={closeDiscardDialog}
        onConfirm={handleDiscardConfirm}
        _isLoading={discardLoading}
        {...discardDialogProps}
      />
    </>
  );
}

/**
 * EntityViewSheet - Standardized read-only view sheet
 *
 * Features:
 * - Consistent layout matching form sheets
 * - Scrollable content area
 * - Simple close functionality
 */
export function EntityViewSheet({
  open,
  onOpenChange,
  title,
  description,
  icon: Icon,
  size = "lg",
  className,
  children,
}: EntityViewSheetProps) {
  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent
        className={cn(
          "w-full flex flex-col p-0",
          SHEET_SIZES[size],
          className
        )}
        side="right"
        hideClose
      >
        {/* Fixed Header */}
        <SheetHeader className="px-6 py-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <SheetTitle className="flex items-center gap-3 text-lg font-semibold">
            {Icon ? (
              <div className="p-2 bg-primary/10 rounded-lg">
                <Icon className="h-5 w-5 text-primary" />
              </div>
            ) : (
              <div className="p-2 bg-primary/10 rounded-lg">
                <Eye className="h-5 w-5 text-primary" />
              </div>
            )}
            View {title}
          </SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">
            {description}
          </SheetDescription>
        </SheetHeader>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-6">
              {children}
            </div>
          </ScrollArea>
        </div>

        {/* Fixed Footer */}
        <SheetFooter className="px-6 py-4 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <Button
            variant="outline"
            onClick={handleClose}
            className="w-full sm:w-auto min-w-[120px] h-10"
          >
            <X className="mr-2 h-4 w-4" />
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
