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
import { createRequestStatus } from '@/lib/api/request-statuses';
import { useRequestStatusesActions } from '../../context/request-statuses-actions-context';
import { toast } from 'sonner';
import type { RequestStatusCreate } from '@/types/request-statuses';

interface AddRequestStatusSheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function AddRequestStatusSheet({
  open = true,
  onOpenChange,
}: AddRequestStatusSheetProps) {
  const { addStatusToCache } = useRequestStatusesActions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<RequestStatusCreate>({
    name: '',
    nameEn: '',
    nameAr: '',
    description: null,
    color: null,
    readonly: false,
    isActive: true,
    countAsSolved: false,
    visibleOnRequesterPage: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('Name is required');
      return;
    }

    if (!formData.nameEn.trim()) {
      toast.error('English name is required');
      return;
    }

    if (!formData.nameAr.trim()) {
      toast.error('Arabic name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const newStatus = await createRequestStatus(formData);
      await addStatusToCache(newStatus);
      toast.success('Request status created successfully');
      setFormData({
        name: '',
        nameEn: '',
        nameAr: '',
        description: null,
        color: null,
        readonly: false,
        isActive: true,
        countAsSolved: false,
        visibleOnRequesterPage: true,
      });
      onOpenChange?.(false);
    } catch (error) {
      toast.error('Failed to create request status');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Add Request Status</SheetTitle>
          <SheetDescription>Create a new request status</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-6 px-4">
          <div className="space-y-2">
            <Label htmlFor="name">Internal Name *</Label>
            <Input
              id="name"
              placeholder="e.g., in_progress"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nameEn">English Name *</Label>
            <Input
              id="nameEn"
              placeholder="e.g., In Progress"
              value={formData.nameEn}
              onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nameAr">Arabic Name *</Label>
            <Input
              id="nameAr"
              placeholder="e.g., قيد التنفيذ"
              value={formData.nameAr}
              onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
              disabled={isSubmitting}
              dir="rtl"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="color">Color</Label>
            <div className="flex items-center gap-2">
              <Input
                id="color"
                type="color"
                value={formData.color || '#6b7280'}
                onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                disabled={isSubmitting}
                className="w-16 h-10 cursor-pointer"
              />
              <Input
                type="text"
                placeholder="#6b7280"
                value={formData.color || ''}
                onChange={(e) => setFormData({ ...formData, color: e.target.value || null })}
                disabled={isSubmitting}
                className="flex-1"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Optional description"
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value || null })}
              disabled={isSubmitting}
              rows={3}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="countAsSolved"
                checked={formData.countAsSolved || false}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, countAsSolved: checked === true })
                }
                disabled={isSubmitting}
              />
              <Label htmlFor="countAsSolved" className="font-normal cursor-pointer">
                Count as Solved
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="visibleOnRequesterPage"
                checked={formData.visibleOnRequesterPage !== false}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, visibleOnRequesterPage: checked === true })
                }
                disabled={isSubmitting}
              />
              <Label htmlFor="visibleOnRequesterPage" className="font-normal cursor-pointer">
                Visible to Requester
              </Label>
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
