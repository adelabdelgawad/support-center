'use client';

import { useMemo } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { EntityFormSheet } from '@/components/settings';
import { updateRequestStatus } from '@/lib/api/request-statuses';
import { useRequestStatusesActions } from '../../context/request-statuses-actions-context';
import { CircleDot, Lock } from 'lucide-react';
import type { RequestStatusResponse, RequestStatusUpdate } from '@/types/request-statuses';

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

interface EditRequestStatusSheetProps {
  status: RequestStatusResponse;
  onOpenChange?: (open: boolean) => void;
}

export function EditRequestStatusSheet({
  status,
  onOpenChange,
}: EditRequestStatusSheetProps) {
  const { updateStatusesOptimistic } = useRequestStatusesActions();

  const handleSubmit = async (data: RequestStatusFormData) => {
    const updateData: RequestStatusUpdate = {
      name: data.name !== status.name ? data.name : null,
      nameEn: data.nameEn !== status.nameEn ? data.nameEn : null,
      nameAr: data.nameAr !== status.nameAr ? data.nameAr : null,
      description: data.description !== status.description ? (data.description || null) : null,
      color: data.color !== status.color ? (data.color || null) : null,
      countAsSolved: data.countAsSolved !== status.countAsSolved ? data.countAsSolved : null,
      visibleOnRequesterPage: data.visibleOnRequesterPage !== status.visibleOnRequesterPage ? data.visibleOnRequesterPage : null,
      isActive: data.isActive !== status.isActive ? data.isActive : null,
    };

    const updatedStatus = await updateRequestStatus(status.id.toString(), updateData);
    await updateStatusesOptimistic([updatedStatus]);
  };

  const defaultValues: RequestStatusFormData = useMemo(() => ({
    name: status.name,
    nameEn: status.nameEn,
    nameAr: status.nameAr,
    description: status.description ?? null,
    color: status.color ?? null,
    countAsSolved: status.countAsSolved,
    visibleOnRequesterPage: status.visibleOnRequesterPage,
    isActive: status.isActive,
  }), [status]);

  const isReadonly = status.readonly;

  return (
    <EntityFormSheet<RequestStatusFormData>
      open={true}
      onOpenChange={onOpenChange ?? (() => {})}
      mode="edit"
      title="Request Status"
      description={`Update details for "${status.nameEn}".`}
      icon={CircleDot}
      schema={requestStatusSchema}
      defaultValues={defaultValues}
      onSubmit={handleSubmit}
      size="md"
    >
      {(form) => (
        <>
          {isReadonly && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-4">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  This is a system status and some fields cannot be modified.
                </span>
              </div>
            </div>
          )}

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Internal Name <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Input {...field} placeholder="e.g., in_progress" disabled={isReadonly} />
                </FormControl>
                <FormDescription>
                  Unique identifier used in the system
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
                    <Input {...field} placeholder="e.g., In Progress" disabled={isReadonly} />
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
                    <Input {...field} placeholder="e.g., قيد التنفيذ" dir="rtl" disabled={isReadonly} />
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
                      disabled={isReadonly}
                    />
                  </FormControl>
                  <Input
                    type="text"
                    placeholder="#6b7280"
                    value={field.value || ''}
                    onChange={(e) => field.onChange(e.target.value || null)}
                    className="flex-1"
                    disabled={isReadonly}
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
                    disabled={isReadonly}
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

export default EditRequestStatusSheet;
