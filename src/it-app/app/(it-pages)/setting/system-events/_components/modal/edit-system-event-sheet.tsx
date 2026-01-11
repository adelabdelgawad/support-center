'use client';

import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { updateSystemEvent } from '@/lib/api/system-events';
import { useSystemEventsActions } from '../../context/system-events-actions-context';
import { toast } from 'sonner';
import { UnsavedChangesWarning } from '@/components/ui/unsaved-changes-warning';
import type { SystemEventResponse, SystemEventUpdate } from '@/types/system-events';

interface EditSystemEventSheetProps {
  event: SystemEventResponse;
  onOpenChange?: (open: boolean) => void;
}

export default function EditSystemEventSheet({
  event,
  onOpenChange,
}: EditSystemEventSheetProps) {
  const { updateEventsOptimistic } = useSystemEventsActions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<SystemEventUpdate>({
    eventNameEn: event.eventNameEn,
    eventNameAr: event.eventNameAr,
    descriptionEn: event.descriptionEn,
    descriptionAr: event.descriptionAr,
    systemMessageId: event.systemMessageId,
    triggerTiming: event.triggerTiming,
    isActive: event.isActive,
  });

  const hasChanges =
    formData.eventNameEn !== event.eventNameEn ||
    formData.eventNameAr !== event.eventNameAr ||
    formData.descriptionEn !== event.descriptionEn ||
    formData.descriptionAr !== event.descriptionAr ||
    formData.systemMessageId !== event.systemMessageId ||
    formData.triggerTiming !== event.triggerTiming ||
    formData.isActive !== event.isActive;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.eventNameEn?.trim()) {
      toast.error('Event name (English) is required');
      return;
    }
    if (!formData.eventNameAr?.trim()) {
      toast.error('Event name (Arabic) is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const updatedEvent = await updateSystemEvent(String(event.id), formData);
      await updateEventsOptimistic([updatedEvent]);
      toast.success('System event updated successfully');
      onOpenChange?.(false);
    } catch (error) {
      toast.error('Failed to update system event');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={true} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit System Event</SheetTitle>
          <SheetDescription>Update the system event details</SheetDescription>
        </SheetHeader>

        <UnsavedChangesWarning show={hasChanges} className="mt-4" />

        <form onSubmit={handleSubmit} className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-500">Event Key</Label>
            <p className="text-sm text-muted-foreground bg-muted p-2 rounded">
              {event.eventKey}
            </p>
            <p className="text-xs text-muted-foreground">
              Event key cannot be changed
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="eventNameEn">Event Name (English) *</Label>
            <Input
              id="eventNameEn"
              placeholder="e.g., New Request Created"
              value={formData.eventNameEn || ''}
              onChange={(e) => setFormData({ ...formData, eventNameEn: e.target.value })}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="eventNameAr">Event Name (Arabic) *</Label>
            <Input
              id="eventNameAr"
              placeholder="e.g., طلب جديد تم إنشاؤه"
              value={formData.eventNameAr || ''}
              onChange={(e) => setFormData({ ...formData, eventNameAr: e.target.value })}
              disabled={isSubmitting}
              dir="rtl"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="descriptionEn">Description (English)</Label>
            <Textarea
              id="descriptionEn"
              placeholder="Optional description"
              value={formData.descriptionEn || ''}
              onChange={(e) => setFormData({ ...formData, descriptionEn: e.target.value || null })}
              disabled={isSubmitting}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="descriptionAr">Description (Arabic)</Label>
            <Textarea
              id="descriptionAr"
              placeholder="وصف اختياري"
              value={formData.descriptionAr || ''}
              onChange={(e) => setFormData({ ...formData, descriptionAr: e.target.value || null })}
              disabled={isSubmitting}
              dir="rtl"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="triggerTiming">Trigger Timing</Label>
            <Select
              value={formData.triggerTiming || 'immediate'}
              onValueChange={(value) => setFormData({ ...formData, triggerTiming: value })}
              disabled={isSubmitting}
            >
              <SelectTrigger id="triggerTiming">
                <SelectValue placeholder="Select trigger timing" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="immediate">Immediate</SelectItem>
                <SelectItem value="delayed">Delayed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="systemMessageId">System Message ID (Optional)</Label>
            <Input
              id="systemMessageId"
              type="number"
              placeholder="Leave empty if not linking to a message"
              value={formData.systemMessageId || ''}
              onChange={(e) => setFormData({
                ...formData,
                systemMessageId: e.target.value ? Number(e.target.value) : null
              })}
              disabled={isSubmitting}
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="isActive"
              checked={formData.isActive !== false}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, isActive: checked === true })
              }
              disabled={isSubmitting}
            />
            <Label htmlFor="isActive" className="font-normal cursor-pointer">
              Active
            </Label>
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange?.(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !hasChanges}>
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
