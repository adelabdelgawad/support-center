'use client';

import { z } from 'zod';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { EntityFormSheet } from '@/components/settings';
import { createRequestType } from '@/lib/api/request-types';
import { useRequestTypesActions } from '../../context/request-types-actions-context';
import { FileType } from 'lucide-react';
import type { RequestTypeCreate } from '@/types/request-types';

const requestTypeSchema = z.object({
  nameEn: z.string().min(1, 'English name is required').max(100, 'Name must be 100 characters or less'),
  nameAr: z.string().min(1, 'Arabic name is required').max(100, 'Name must be 100 characters or less'),
  briefEn: z.string().max(500, 'Description must be 500 characters or less').optional().nullable(),
  briefAr: z.string().max(500, 'Description must be 500 characters or less').optional().nullable(),
  isActive: z.boolean(),
});

type RequestTypeFormData = z.infer<typeof requestTypeSchema>;

interface AddRequestTypeSheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AddRequestTypeSheet({
  open = true,
  onOpenChange,
}: AddRequestTypeSheetProps) {
  const { addTypeToCache } = useRequestTypesActions();

  const handleSubmit = async (data: RequestTypeFormData) => {
    const createData: RequestTypeCreate = {
      nameEn: data.nameEn,
      nameAr: data.nameAr,
      briefEn: data.briefEn || null,
      briefAr: data.briefAr || null,
      isActive: data.isActive,
    };

    const newType = await createRequestType(createData);
    await addTypeToCache(newType);
  };

  const defaultValues: RequestTypeFormData = {
    nameEn: '',
    nameAr: '',
    briefEn: null,
    briefAr: null,
    isActive: true,
  };

  return (
    <EntityFormSheet<RequestTypeFormData>
      open={open}
      onOpenChange={onOpenChange ?? (() => {})}
      mode="add"
      title="Request Type"
      description="Create a new request type for categorizing service requests."
      icon={FileType}
      schema={requestTypeSchema}
      defaultValues={defaultValues}
      onSubmit={handleSubmit}
      size="md"
    >
      {(form) => (
        <>
          <FormField
            control={form.control}
            name="nameEn"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Name (English) <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Input {...field} placeholder="e.g., Hardware Request" />
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
                  Name (Arabic) <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Input {...field} placeholder="e.g., طلب أجهزة" dir="rtl" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="briefEn"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description (English)</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    value={field.value ?? ''}
                    placeholder="Optional description"
                    rows={3}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="briefAr"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description (Arabic)</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    value={field.value ?? ''}
                    placeholder="وصف اختياري"
                    rows={3}
                    dir="rtl"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center gap-2 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <FormLabel className="font-normal cursor-pointer">Active</FormLabel>
              </FormItem>
            )}
          />
        </>
      )}
    </EntityFormSheet>
  );
}

export default AddRequestTypeSheet;
