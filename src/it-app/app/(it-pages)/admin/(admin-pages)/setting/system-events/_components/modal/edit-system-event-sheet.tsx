'use client';

import { useMemo } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { EntityFormSheet } from '@/components/settings';
import { updateSystemEvent } from '@/lib/api/system-events';
import { useSystemEventsActions } from '../../context/system-events-actions-context';
import { Zap } from 'lucide-react';
import type { SystemEventResponse, SystemEventUpdate } from '@/types/system-events';

const systemEventSchema = z.object({
  eventNameEn: z.string().min(1, 'English name is required').max(100, 'Name must be 100 characters or less'),
  eventNameAr: z.string().min(1, 'Arabic name is required').max(100, 'Name must be 100 characters or less'),
  descriptionEn: z.string().max(500, 'Description must be 500 characters or less').optional().nullable(),
  descriptionAr: z.string().max(500, 'Description must be 500 characters or less').optional().nullable(),
  systemMessageId: z.number().optional().nullable(),
  triggerTiming: z.enum(['immediate', 'delayed']),
  isActive: z.boolean(),
});

type SystemEventFormData = z.infer<typeof systemEventSchema>;

interface EditSystemEventSheetProps {
  event: SystemEventResponse;
  onOpenChange?: (open: boolean) => void;
}

export function EditSystemEventSheet({
  event,
  onOpenChange,
}: EditSystemEventSheetProps) {
  const { updateEventsOptimistic } = useSystemEventsActions();

  const handleSubmit = async (data: SystemEventFormData) => {
    const updateData: SystemEventUpdate = {
      eventNameEn: data.eventNameEn !== event.eventNameEn ? data.eventNameEn : null,
      eventNameAr: data.eventNameAr !== event.eventNameAr ? data.eventNameAr : null,
      descriptionEn: data.descriptionEn !== event.descriptionEn ? (data.descriptionEn || null) : null,
      descriptionAr: data.descriptionAr !== event.descriptionAr ? (data.descriptionAr || null) : null,
      systemMessageId: data.systemMessageId !== event.systemMessageId ? (data.systemMessageId || null) : null,
      triggerTiming: data.triggerTiming !== event.triggerTiming ? data.triggerTiming : null,
      isActive: data.isActive !== event.isActive ? data.isActive : null,
    };

    const updatedEvent = await updateSystemEvent(String(event.id), updateData);
    await updateEventsOptimistic([updatedEvent]);
  };

  const defaultValues: SystemEventFormData = useMemo(() => ({
    eventNameEn: event.eventNameEn,
    eventNameAr: event.eventNameAr,
    descriptionEn: event.descriptionEn ?? null,
    descriptionAr: event.descriptionAr ?? null,
    systemMessageId: event.systemMessageId ?? null,
    triggerTiming: (event.triggerTiming as 'immediate' | 'delayed') || 'immediate',
    isActive: event.isActive,
  }), [event]);

  return (
    <EntityFormSheet<SystemEventFormData>
      open={true}
      onOpenChange={onOpenChange ?? (() => {})}
      mode="edit"
      title="System Event"
      description={`Update details for "${event.eventNameEn}".`}
      icon={Zap}
      schema={systemEventSchema}
      defaultValues={defaultValues}
      onSubmit={handleSubmit}
      size="md"
    >
      {(form) => (
        <>
          {/* Event Key - Read Only */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Event Key</Label>
            <div className="text-sm bg-muted px-3 py-2 rounded border font-mono">
              {event.eventKey}
            </div>
            <p className="text-xs text-muted-foreground">
              Event key cannot be changed after creation
            </p>
          </div>

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

export default EditSystemEventSheet;
