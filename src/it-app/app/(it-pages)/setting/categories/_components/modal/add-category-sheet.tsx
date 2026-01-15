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
import { createCategory } from "@/lib/api/categories";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { CategoryCreateRequest, CategoryResponse } from "@/types/categories";

interface AddCategorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd?: (newCategory: CategoryResponse) => Promise<void>;
}

const createCategorySchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be 100 characters or less"),
  nameEn: z
    .string()
    .min(2, "English name must be at least 2 characters")
    .max(100, "English name must be 100 characters or less"),
  nameAr: z
    .string()
    .min(2, "Arabic name must be at least 2 characters")
    .max(100, "Arabic name must be 100 characters or less"),
  description: z
    .string()
    .max(500, "Description must be 500 characters or less")
    .optional(),
});

type CreateCategoryFormData = z.infer<typeof createCategorySchema>;

export function AddCategorySheet({
  open,
  onOpenChange,
  onAdd,
}: AddCategorySheetProps) {
  const form = useForm<CreateCategoryFormData>({
    resolver: zodResolver(createCategorySchema),
    mode: "onChange",
    defaultValues: {
      name: "",
      nameEn: "",
      nameAr: "",
      description: "",
    },
  });

  const [isLoading, setIsLoading] = useState(false);

  // Reset form when sheet opens
  useEffect(() => {
    if (open) {
      form.reset({
        name: "",
        nameEn: "",
        nameAr: "",
        description: "",
      });
    }
  }, [open, form]);

  const handleSave = async (data: CreateCategoryFormData) => {
    setIsLoading(true);
    try {
      const categoryData: CategoryCreateRequest = {
        name: data.name,
        nameEn: data.nameEn,
        nameAr: data.nameAr,
        description: data.description || null,
        isActive: true,
      };

      const createdCategory = await createCategory(categoryData);
      toastSuccess("Category created successfully");

      if (onAdd) {
        await onAdd(createdCategory);
      }

      onOpenChange(false);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      toastError(errorMessage || "Failed to create category");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Create New Category</SheetTitle>
          <SheetDescription>
            Add a new category to organize service requests.
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSave)}
            className="space-y-4 p-4"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Internal Name <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g., hardware_support" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="nameEn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    English Name <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g., Hardware Support" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="nameAr"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Arabic Name <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="e.g., دعم الأجهزة"
                      dir="rtl"
                    />
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
                    <Textarea
                      {...field}
                      placeholder="Enter category description (optional)"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <SheetFooter>
              <div className="flex flex-col-reverse sm:flex-row gap-3 w-full">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isLoading}
                  className="flex-1 sm:flex-none min-w-[120px] h-10"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 sm:flex-none min-w-[120px] h-10"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Category
                    </>
                  )}
                </Button>
              </div>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}
