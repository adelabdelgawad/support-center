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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EntityFormSheet } from '@/components/settings';
import { createSystemEvent } from '@/lib/api/system-events';
import { useSystemEventsActions } from '../../context/system-events-actions-context';
import { Zap } from 'lucide-react';
import type { SystemEventCreate } from '@/types/system-events';

const systemEventSchema = z.object({
  eventKey: z.string().min(1, 'Event key is required').max(100, 'Event key must be 100 characters or less')
    .regex(/^[a-z_]+$/, 'Event key must be lowercase with underscores only'),
  eventNameEn: z.string().min(1, 'English name is required').max(100, 'Name must be 100 characters or less'),
  eventNameAr: z.string().min(1, 'Arabic name is required').max(100, 'Name must be 100 characters or less'),
  descriptionEn: z.string().max(500, 'Description must be 500 characters or less').optional().nullable(),
  descriptionAr: z.string().max(500, 'Description must be 500 characters or less').optional().nullable(),
  systemMessageId: z.number().optional().nullable(),
  triggerTiming: z.enum(['immediate', 'delayed']),
  isActive: z.boolean(),
});

type SystemEventFormData = z.infer<typeof systemEventSchema>;

interface AddSystemEventSheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AddSystemEventSheet({
  open = false,
  onOpenChange,
}: AddSystemEventSheetProps) {
  const { addEventToCache } = useSystemEventsActions();

  const handleSubmit = async (data: SystemEventFormData) => {
    const createData: SystemEventCreate = {
      eventKey: data.eventKey,
      eventNameEn: data.eventNameEn,
      eventNameAr: data.eventNameAr,
      descriptionEn: data.descriptionEn || null,
      descriptionAr: data.descriptionAr || null,
      systemMessageId: data.systemMessageId || null,
      triggerTiming: data.triggerTiming,
      isActive: data.isActive,
    };

    const newEvent = await createSystemEvent(createData);
    await addEventToCache(newEvent);
  };

  const defaultValues: SystemEventFormData = {
    eventKey: '',
    eventNameEn: '',
    eventNameAr: '',
    descriptionEn: null,
    descriptionAr: null,
    systemMessageId: null,
    triggerTiming: 'immediate',
    isActive: true,
  };

  return (
    <EntityFormSheet<SystemEventFormData>
      open={open}
      onOpenChange={onOpenChange ?? (() => {})}
      mode="add"
      title="System Event"
      description="Create a new system event for triggering notifications."
      icon={Zap}
      schema={systemEventSchema}
      defaultValues={defaultValues}
      onSubmit={handleSubmit}
      size="md"
    >
      {(form) => (
        <>
          <FormField
            control={form.control}
            name="eventKey"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Event Key <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Input {...field} placeholder="e.g., new_request, ticket_assigned" className="font-mono" />
                </FormControl>
                <FormDescription>
                  Unique identifier (lowercase, underscores only)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="eventNameEn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Name (English) <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g., New Request Created" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="eventNameAr"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Name (Arabic) <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g., طلب جديد تم إنشاؤه" dir="rtl" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="descriptionEn"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description (English)</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    value={field.value ?? ''}
                    placeholder="Optional description"
                    rows={2}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="descriptionAr"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description (Arabic)</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    value={field.value ?? ''}
                    placeholder="وصف اختياري"
                    rows={2}
                    dir="rtl"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="triggerTiming"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Trigger Timing</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select trigger timing" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="immediate">Immediate</SelectItem>
                    <SelectItem value="delayed">Delayed</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="systemMessageId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>System Message ID (Optional)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="Leave empty if not linking to a message"
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}
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
              <FormItem className="flex flex-row items-center gap-2 space-y-0 border-t pt-4">
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

export default AddSystemEventSheet;
