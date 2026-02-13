"use client";

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EntityFormSheet } from "@/components/settings";
import { updateCategory } from "@/lib/api/categories";
import { getSections, type Section } from "@/lib/api/sections";
import { useCategoriesActions } from "../../context/categories-actions-context";
import { Edit } from "lucide-react";
import type { CategoryResponse, CategoryUpdateRequest } from "@/types/categories";

const NONE_VALUE = "__none__";

const categorySchema = z.object({
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
  sectionId: z.string().optional(),
});

type CategoryFormData = z.infer<typeof categorySchema>;

interface EditCategorySheetProps {
  category: CategoryResponse;
  onOpenChange?: (open: boolean) => void;
}

export function EditCategorySheet({
  category,
  onOpenChange,
}: EditCategorySheetProps) {
  const { handleUpdateCategory } = useCategoriesActions();
  const [sections, setSections] = useState<Section[]>([]);
  const [loadingSections, setLoadingSections] = useState(false);

  // Fetch sections on mount
  useEffect(() => {
    setLoadingSections(true);
    getSections(true, false, false)
      .then(setSections)
      .catch(() => setSections([]))
      .finally(() => setLoadingSections(false));
  }, []);

  const handleSubmit = async (data: CategoryFormData) => {
    const updateData: CategoryUpdateRequest = {};

    if (data.name !== category.name) {
      updateData.name = data.name;
    }
    if (data.nameEn !== category.nameEn) {
      updateData.nameEn = data.nameEn;
    }
    if (data.nameAr !== category.nameAr) {
      updateData.nameAr = data.nameAr;
    }
    if (data.description !== category.description) {
      updateData.description = data.description || null;
    }

    const newSectionId = data.sectionId === NONE_VALUE ? null : (data.sectionId ? Number(data.sectionId) : null);
    if (newSectionId !== category.sectionId) {
      updateData.sectionId = newSectionId;
    }

    const updatedCategory = await updateCategory(category.id, updateData);
    handleUpdateCategory(category.id, updatedCategory);
  };

  const defaultValues: CategoryFormData = useMemo(
    () => ({
      name: category.name,
      nameEn: category.nameEn,
      nameAr: category.nameAr,
      description: category.description ?? null,
      sectionId: category.sectionId ? String(category.sectionId) : "",
    }),
    [category]
  );

  return (
    <EntityFormSheet<CategoryFormData>
      open={true}
      onOpenChange={onOpenChange ?? (() => {})}
      mode="edit"
      title="Category"
      description={`Update details for "${category.nameEn}".`}
      icon={Edit}
      schema={categorySchema}
      defaultValues={defaultValues}
      onSubmit={handleSubmit}
      size="md"
    >
      {(form) => (
        <>
          <FormField
            control={form.control}
            name="sectionId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Section</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  disabled={loadingSections}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue
                        placeholder={
                          loadingSections
                            ? "Loading sections..."
                            : "Select a section (optional)"
                        }
                      />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NONE_VALUE}>
                      <span className="text-muted-foreground">No section</span>
                    </SelectItem>
                    {sections.map((section) => (
                      <SelectItem
                        key={section.id}
                        value={String(section.id)}
                      >
                        {section.shownNameEn}
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
                  <Input {...field} placeholder="e.g., دعم الأجهزة" dir="rtl" />
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

export default EditCategorySheet;
