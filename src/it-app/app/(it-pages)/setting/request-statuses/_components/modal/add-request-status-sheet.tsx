'use client';

import { z } from 'zod';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { EntityFormSheet } from '@/components/settings';
import { createRequestStatus } from '@/lib/api/request-statuses';
import { useRequestStatusesActions } from '../../context/request-statuses-actions-context';
import { CircleDot } from 'lucide-react';
import type { RequestStatusCreate } from '@/types/request-statuses';

const requestStatusSchema = z.object({
  name: z.string().min(1, 'Internal name is required').max(50, 'Name must be 50 characters or less'),
  nameEn: z.string().min(1, 'English name is required').max(100, 'Name must be 100 characters or less'),
  nameAr: z.string().min(1, 'Arabic name is required').max(100, 'Name must be 100 characters or less'),
  description: z.string().max(500, 'Description must be 500 characters or less').optional().nullable(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format').optional().nullable(),
  countAsSolved: z.boolean(),
  visibleOnRequesterPage: z.boolean(),
  isActive: z.boolean(),
});

type RequestStatusFormData = z.infer<typeof requestStatusSchema>;

interface AddRequestStatusSheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AddRequestStatusSheet({
  open = true,
  onOpenChange,
}: AddRequestStatusSheetProps) {
  const { addStatusToCache } = useRequestStatusesActions();

  const handleSubmit = async (data: RequestStatusFormData) => {
    const createData: RequestStatusCreate = {
      name: data.name,
      nameEn: data.nameEn,
      nameAr: data.nameAr,
      description: data.description || null,
      color: data.color || null,
      readonly: false,
      isActive: data.isActive,
      countAsSolved: data.countAsSolved,
      visibleOnRequesterPage: data.visibleOnRequesterPage,
    };

    const newStatus = await createRequestStatus(createData);
    await addStatusToCache(newStatus);
  };

  const defaultValues: RequestStatusFormData = {
    name: '',
    nameEn: '',
    nameAr: '',
    description: null,
    color: null,
    countAsSolved: false,
    visibleOnRequesterPage: true,
    isActive: true,
  };

  return (
    <EntityFormSheet<RequestStatusFormData>
      open={open}
      onOpenChange={onOpenChange ?? (() => {})}
      mode="add"
      title="Request Status"
      description="Create a new status for tracking service request progress."
      icon={CircleDot}
      schema={requestStatusSchema}
      defaultValues={defaultValues}
      onSubmit={handleSubmit}
      size="md"
    >
      {(form) => (
        <>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Internal Name <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Input {...field} placeholder="e.g., in_progress" />
                </FormControl>
                <FormDescription>
                  Unique identifier used in the system (lowercase, underscores)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="nameEn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    English Name <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g., In Progress" />
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
                    <Input {...field} placeholder="e.g., قيد التنفيذ" dir="rtl" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="color"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Color</FormLabel>
                <div className="flex items-center gap-2">
                  <FormControl>
                    <Input
                      type="color"
                      value={field.value || '#6b7280'}
                      onChange={(e) => field.onChange(e.target.value)}
                      className="w-16 h-10 cursor-pointer p-1"
                    />
                  </FormControl>
                  <Input
                    type="text"
                    placeholder="#6b7280"
                    value={field.value || ''}
                    onChange={(e) => field.onChange(e.target.value || null)}
                    className="flex-1"
                  />
                </div>
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
                    value={field.value ?? ''}
                    placeholder="Optional description"
                    rows={3}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="space-y-3 border-t pt-4">
            <FormField
              control={form.control}
              name="countAsSolved"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-2 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="font-normal cursor-pointer">
                    Count as Solved
                  </FormLabel>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="visibleOnRequesterPage"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center gap-2 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormLabel className="font-normal cursor-pointer">
                    Visible to Requester
                  </FormLabel>
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
          </div>
        </>
      )}
    </EntityFormSheet>
  );
}

export default AddRequestStatusSheet;
