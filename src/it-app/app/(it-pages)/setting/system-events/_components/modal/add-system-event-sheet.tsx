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
import { createSystemEvent } from '@/lib/api/system-events';
import { useSystemEventsActions } from '../../context/system-events-actions-context';
import { toast } from 'sonner';
import type { SystemEventCreate } from '@/types/system-events';

interface AddSystemEventSheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function AddSystemEventSheet({
  open = true,
  onOpenChange,
}: AddSystemEventSheetProps) {
  const { addEventToCache } = useSystemEventsActions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<SystemEventCreate>({
    eventKey: '',
    eventNameEn: '',
    eventNameAr: '',
    descriptionEn: null,
    descriptionAr: null,
    systemMessageId: null,
    triggerTiming: 'immediate',
    isActive: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.eventKey.trim()) {
      toast.error('Event key is required');
      return;
    }
    if (!formData.eventNameEn.trim()) {
      toast.error('Event name (English) is required');
      return;
    }
    if (!formData.eventNameAr.trim()) {
      toast.error('Event name (Arabic) is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const newEvent = await createSystemEvent(formData);
      await addEventToCache(newEvent);
      toast.success('System event created successfully');
      setFormData({
        eventKey: '',
        eventNameEn: '',
        eventNameAr: '',
        descriptionEn: null,
        descriptionAr: null,
        systemMessageId: null,
        triggerTiming: 'immediate',
        isActive: true,
      });
      onOpenChange?.(false);
    } catch (error) {
      toast.error('Failed to create system event');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add System Event</SheetTitle>
          <SheetDescription>Create a new system event</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label htmlFor="eventKey">Event Key *</Label>
            <Input
              id="eventKey"
              placeholder="e.g., new_request, ticket_assigned"
              value={formData.eventKey}
              onChange={(e) => setFormData({ ...formData, eventKey: e.target.value })}
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              Unique identifier for the event (lowercase, underscores)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="eventNameEn">Event Name (English) *</Label>
            <Input
              id="eventNameEn"
              placeholder="e.g., New Request Created"
              value={formData.eventNameEn}
              onChange={(e) => setFormData({ ...formData, eventNameEn: e.target.value })}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="eventNameAr">Event Name (Arabic) *</Label>
            <Input
              id="eventNameAr"
              placeholder="e.g., طلب جديد تم إنشاؤه"
              value={formData.eventNameAr}
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
              value={formData.triggerTiming}
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
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
