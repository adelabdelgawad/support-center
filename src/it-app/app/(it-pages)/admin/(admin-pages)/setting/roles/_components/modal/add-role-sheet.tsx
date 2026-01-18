  
"use client";

import { Button } from "@/components/ui/button";
import { toastSuccess, toastError } from "@/lib/toast";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { createRole } from "@/lib/api/roles";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { RoleCreateRequest, RoleResponse } from "@/types/roles";

interface AddRoleSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd?: (newRole: RoleResponse) => Promise<void>;
}

export function AddRoleSheet({
  open,
  onOpenChange,
  onAdd,
}: AddRoleSheetProps) {
  // Create dynamic schema with hardcoded English messages
  const createRoleSchema = z.object({
    name: z.string().min(1, "English name is required").max(100, "English name must be 100 characters or less"),
    description: z.string().max(500, "Description must be 500 characters or less").optional(),
  });

  type CreateRoleFormData = z.infer<typeof createRoleSchema>;

  const form = useForm<CreateRoleFormData>({
    resolver: zodResolver(createRoleSchema),
    mode: "onChange",
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const [isLoading, setIsLoading] = useState(false);

  // Reset form when sheet opens
  useEffect(() => {
    if (open) {
      form.reset({
        name: "",
        description: "",
      });
    }
  }, [open, form]);

  const handleSave = async (_data: CreateRoleFormData) => {
    setIsLoading(true);
    try {
      const roleData: RoleCreateRequest = {
        name: _data.name,
        description: _data.description || null,
        isActive: true, // Default to active
      };

      // Create role and get the response
      const createdRole = await createRole(roleData);
      toastSuccess("Role created successfully");

      // Add to cache via optimistic update (no refetch needed)
      if (onAdd) {
        await onAdd(createdRole);
      }

      onOpenChange(false);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toastError(errorMessage || "Failed to create role");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
    >
      <SheetContent className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Create New Role</SheetTitle>
          <SheetDescription>Add a new role to the system with specific permissions and access levels.</SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4 p-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Enter role name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="Enter role description (optional)" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <SheetFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Role
                  </>
                )}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
