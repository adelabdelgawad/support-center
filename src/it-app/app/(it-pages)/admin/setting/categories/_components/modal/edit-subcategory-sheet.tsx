"use client";

import { useMemo } from "react";
import { z } from "zod";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntityFormSheet } from "@/components/settings";
import { updateSubcategory } from "@/lib/api/subcategories";
import { Edit } from "lucide-react";
import type { CategoryResponse, SubcategoryResponse, SubcategoryUpdateRequest } from "@/types/categories";

const subcategorySchema = z.object({
  categoryId: z
    .number()
    .int("Category must be selected")
    .positive("Category must be selected"),
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
    .optional()
    .nullable(),
});

type SubcategoryFormData = z.infer<typeof subcategorySchema>;

interface EditSubcategorySheetProps {
  subcategory: SubcategoryResponse;
  categories: CategoryResponse[];
  onOpenChange?: (open: boolean) => void;
  onUpdate?: () => void;
}

export function EditSubcategorySheet({
  subcategory,
  categories,
  onOpenChange,
  onUpdate,
}: EditSubcategorySheetProps) {
  const handleSubmit = async (data: SubcategoryFormData) => {
    const updateData: SubcategoryUpdateRequest = {};

    if (data.categoryId !== subcategory.categoryId) {
      updateData.categoryId = data.categoryId;
    }
    if (data.name !== subcategory.name) {
      updateData.name = data.name;
    }
    if (data.nameEn !== subcategory.nameEn) {
      updateData.nameEn = data.nameEn;
    }
    if (data.nameAr !== subcategory.nameAr) {
      updateData.nameAr = data.nameAr;
    }
    if (data.description !== subcategory.description) {
      updateData.description = data.description || null;
    }

    await updateSubcategory(subcategory.id, updateData);

    if (onUpdate) {
      onUpdate();
    }
  };

  const defaultValues: SubcategoryFormData = useMemo(
    () => ({
      categoryId: subcategory.categoryId,
      name: subcategory.name,
      nameEn: subcategory.nameEn,
      nameAr: subcategory.nameAr,
      description: subcategory.description ?? null,
    }),
    [subcategory]
  );

  return (
    <EntityFormSheet<SubcategoryFormData>
      open={true}
      onOpenChange={onOpenChange ?? (() => {})}
      mode="edit"
      title="Subcategory"
      description={`Update details for "${subcategory.nameEn}".`}
      icon={Edit}
      schema={subcategorySchema}
      defaultValues={defaultValues}
      onSubmit={handleSubmit}
      size="md"
    >
      {(form) => (
        <>
          <FormField
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Category <span className="text-destructive">*</span>
                </FormLabel>
                <Select
                  onValueChange={(value) => field.onChange(Number(value))}
                  value={field.value?.toString()}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem
                        key={category.id}
                        value={category.id.toString()}
                      >
                        {category.nameEn}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Internal Name <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Input {...field} placeholder="e.g., laptop_repair" />
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
                  <Input {...field} placeholder="e.g., Laptop Repair" />
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
                  <Input {...field} placeholder="e.g., إصلاح الكمبيوتر المحمول" dir="rtl" />
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
                    value={field.value ?? ""}
                    placeholder="Optional description"
                    rows={3}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </>
      )}
    </EntityFormSheet>
  );
}

export default EditSubcategorySheet;
