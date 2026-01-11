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
import { updateRequestStatus } from '@/lib/api/request-statuses';
import { useRequestStatusesActions } from '../../context/request-statuses-actions-context';
import { toast } from 'sonner';
import { UnsavedChangesWarning } from '@/components/ui/unsaved-changes-warning';
import type { RequestStatusResponse, RequestStatusUpdate } from '@/types/request-statuses';

interface EditRequestStatusSheetProps {
  status: RequestStatusResponse;
  onOpenChange?: (open: boolean) => void;
}

export default function EditRequestStatusSheet({
  status,
  onOpenChange,
}: EditRequestStatusSheetProps) {
  const { updateStatusesOptimistic } = useRequestStatusesActions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [formData, setFormData] = useState<RequestStatusUpdate>({
    name: status.name,
    nameEn: status.nameEn,
    nameAr: status.nameAr,
    description: status.description,
    color: status.color,
    readonly: status.readonly,
    isActive: status.isActive,
    countAsSolved: status.countAsSolved,
    visibleOnRequesterPage: status.visibleOnRequesterPage,
  });

  const hasChanges =
    formData.name !== status.name ||
    formData.nameEn !== status.nameEn ||
    formData.nameAr !== status.nameAr ||
    formData.description !== status.description ||
    formData.color !== status.color ||
    formData.readonly !== status.readonly ||
    formData.isActive !== status.isActive ||
    formData.countAsSolved !== status.countAsSolved ||
    formData.visibleOnRequesterPage !== status.visibleOnRequesterPage;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name?.trim()) {
      toast.error('Name is required');
      return;
    }

    if (!formData.nameEn?.trim()) {
      toast.error('English name is required');
      return;
    }

    if (!formData.nameAr?.trim()) {
      toast.error('Arabic name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const updatedStatus = await updateRequestStatus(status.id.toString(), formData);
      await updateStatusesOptimistic([updatedStatus]);
      toast.success('Request status updated successfully');
      onOpenChange?.(false);
    } catch (error) {
      toast.error('Failed to update request status');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={true} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit Request Status</SheetTitle>
          <SheetDescription>Update the request status details</SheetDescription>
        </SheetHeader>

        <UnsavedChangesWarning show={hasChanges} className="mt-4 mx-4" />

        <form onSubmit={handleSubmit} className="space-y-4 pt-6 px-4">
          <div className="space-y-2">
            <Label htmlFor="name">Internal Name *</Label>
            <Input
              id="name"
              placeholder="e.g., in_progress"
              value={formData.name || ''}
              onChange={(e) => {
                setFormData({ ...formData, name: e.target.value });
                setIsDirty(true);
              }}
              disabled={isSubmitting || status.readonly}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nameEn">English Name *</Label>
            <Input
              id="nameEn"
              placeholder="e.g., In Progress"
              value={formData.nameEn || ''}
              onChange={(e) => {
                setFormData({ ...formData, nameEn: e.target.value });
                setIsDirty(true);
              }}
              disabled={isSubmitting || status.readonly}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nameAr">Arabic Name *</Label>
            <Input
              id="nameAr"
              placeholder="e.g., قيد التنفيذ"
              value={formData.nameAr || ''}
              onChange={(e) => {
                setFormData({ ...formData, nameAr: e.target.value });
                setIsDirty(true);
              }}
              disabled={isSubmitting || status.readonly}
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
                onChange={(e) => {
                  setFormData({ ...formData, color: e.target.value });
                  setIsDirty(true);
                }}
                disabled={isSubmitting || status.readonly}
                className="w-16 h-10 cursor-pointer"
              />
              <Input
                type="text"
                placeholder="#6b7280"
                value={formData.color || ''}
                onChange={(e) => {
                  setFormData({ ...formData, color: e.target.value || null });
                  setIsDirty(true);
                }}
                disabled={isSubmitting || status.readonly}
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
              onChange={(e) => {
                setFormData({ ...formData, description: e.target.value || null });
                setIsDirty(true);
              }}
              disabled={isSubmitting || status.readonly}
              rows={3}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="countAsSolved"
                checked={formData.countAsSolved || false}
                onCheckedChange={(checked) => {
                  setFormData({ ...formData, countAsSolved: checked === true });
                  setIsDirty(true);
                }}
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
                onCheckedChange={(checked) => {
                  setFormData({ ...formData, visibleOnRequesterPage: checked === true });
                  setIsDirty(true);
                }}
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
                onCheckedChange={(checked) => {
                  setFormData({ ...formData, isActive: checked === true });
                  setIsDirty(true);
                }}
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
            <Button type="submit" disabled={isSubmitting || !hasChanges}>
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
