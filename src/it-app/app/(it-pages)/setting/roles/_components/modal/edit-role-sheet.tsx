  
"use client";

import { Button } from "@/components/ui/button";
import { toastSuccess, toastWarning, toastError } from "@/lib/toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { updateRole } from "@/lib/api/roles";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { UnsavedChangesWarning } from '@/components/ui/unsaved-changes-warning';
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { RoleResponse, RoleUpdateRequest } from "@/types/roles";

// Form validation schema
const roleFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

type RoleFormData = z.infer<typeof roleFormSchema>;

interface EditRoleSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: RoleResponse;
  onSuccess?: () => void;
  onUpdate?: (updatedRole: RoleResponse) => void;
}

export function EditRoleSheet({
  open,
  onOpenChange,
  role,
  onSuccess,
  onUpdate,
}: EditRoleSheetProps) {
  const [_isLoading, setIsLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Store original values for comparison
  const originalValues = useRef<RoleFormData>({
    name: "",
    description: "",
  });

  const form = useForm<RoleFormData>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  // Initialize form and original values when sheet opens
  useEffect(() => {
    if (!open) {return;}

    const initialValues: RoleFormData = {
      name: role.name || "",
      description: role.description || "",
    };

    // Store original values for comparison
    originalValues.current = { ...initialValues };

    // Reset form with current role data
    form.reset(initialValues);
    setHasChanges(false);
    setIsLoading(false);
  }, [open, role, form]);

  // Watch for form changes
  useEffect(() => {
    if (!open) {return;}

    const subscription = form.watch((values) => {
      const currentValues = {
        name: values.name || "",
        description: values.description || "",
      };

      const hasChanged =
        currentValues.name !== originalValues.current.name ||
        currentValues.description !== originalValues.current.description;

      setHasChanges(hasChanged);
    });

    return () => subscription.unsubscribe();
  }, [form, open]);

  const performSave = async () => {
    const formData = form.getValues();
    setIsLoading(true);

    try {
      // Build the request structure matching backend RoleUpdate schema
      const requestBody: RoleUpdateRequest = {
        name: formData.name !== originalValues.current.name ? formData.name : null,
        description: formData.description !== originalValues.current.description ? formData.description : null,
      };

      // Call API and get updated role data
      const updatedRole = await updateRole(role.id, requestBody);

      toastSuccess("Role updated successfully");

      // Update local state with returned data (optimistic update - no refetch needed)
      if (onUpdate) {
        onUpdate(updatedRole);
      }
      if (onSuccess) {
        onSuccess();
      }

      onOpenChange(false);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toastError(errorMessage || "Failed to update role");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    const isValid = await form.trigger();
    if (!isValid) {
      toastWarning("Please fix validation errors");
      return;
    }

    if (!hasChanges) {
      toastWarning("No changes to save");
      return;
    }

    await performSave();
  };

  const handleCancel = () => {
    form.reset();
    setHasChanges(false);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Edit Role</SheetTitle>
          <SheetDescription>
            Update role information and permissions.
          </SheetDescription>
        </SheetHeader>

        <UnsavedChangesWarning show={hasChanges} className="mt-4" />

        <div className="grid gap-4 py-4">
          {/* Name */}
          <div className="grid gap-2">
            <Label htmlFor="name">
              Name{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              {...form.register("name")}
              placeholder="Enter role name"
              disabled={_isLoading}
            />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="grid gap-2">
            <Label htmlFor="description">
              Description
            </Label>
            <Textarea
              {...form.register("description")}
              placeholder="Enter role description"
              disabled={_isLoading}
              rows={3}
            />
          </div>
        </div>

        <SheetFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={_isLoading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={_isLoading || !hasChanges}
          >
            {_isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
