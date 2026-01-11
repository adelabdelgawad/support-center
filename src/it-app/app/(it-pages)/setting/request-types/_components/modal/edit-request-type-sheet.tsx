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
import { updateRequestType } from '@/lib/api/request-types';
import { useRequestTypesActions } from '../../context/request-types-actions-context';
import { toast } from 'sonner';
import { UnsavedChangesWarning } from '@/components/ui/unsaved-changes-warning';
import type { RequestType, RequestTypeUpdate } from '@/types/request-types';

interface EditRequestTypeSheetProps {
  type: RequestType;
  onOpenChange?: (open: boolean) => void;
}

export default function EditRequestTypeSheet({
  type,
  onOpenChange,
}: EditRequestTypeSheetProps) {
  const { updateTypesOptimistic } = useRequestTypesActions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<RequestTypeUpdate>({
    nameEn: type.nameEn,
    nameAr: type.nameAr,
    briefEn: type.briefEn,
    briefAr: type.briefAr,
    isActive: type.isActive,
  });

  const hasChanges =
    formData.nameEn !== type.nameEn ||
    formData.nameAr !== type.nameAr ||
    formData.briefEn !== type.briefEn ||
    formData.briefAr !== type.briefAr ||
    formData.isActive !== type.isActive;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.nameEn?.trim()) {
      toast.error('Name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const updatedType = await updateRequestType(type.id.toString(), formData);
      await updateTypesOptimistic([updatedType]);
      toast.success('Request type updated successfully');
      onOpenChange?.(false);
    } catch (error) {
      toast.error('Failed to update request type');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={true} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit Request Type</SheetTitle>
          <SheetDescription>Update the request type details</SheetDescription>
        </SheetHeader>

        <UnsavedChangesWarning show={hasChanges} className="mt-4 mx-4" />

        <form onSubmit={handleSubmit} className="space-y-4 pt-6 px-4">
          <div className="space-y-2">
            <Label htmlFor="nameEn">Name (English) *</Label>
            <Input
              id="nameEn"
              placeholder="e.g., Hardware Request"
              value={formData.nameEn || ''}
              onChange={(e) => {
                setFormData({ ...formData, nameEn: e.target.value });
              }}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nameAr">Name (Arabic) *</Label>
            <Input
              id="nameAr"
              placeholder="e.g., طلب أجهزة"
              value={formData.nameAr || ''}
              onChange={(e) => {
                setFormData({ ...formData, nameAr: e.target.value });
              }}
              disabled={isSubmitting}
              dir="rtl"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="briefEn">Description (English)</Label>
            <Textarea
              id="briefEn"
              placeholder="Optional description"
              value={formData.briefEn || ''}
              onChange={(e) => {
                setFormData({ ...formData, briefEn: e.target.value || null });
              }}
              disabled={isSubmitting}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="briefAr">Description (Arabic)</Label>
            <Textarea
              id="briefAr"
              placeholder="وصف اختياري"
              value={formData.briefAr || ''}
              onChange={(e) => {
                setFormData({ ...formData, briefAr: e.target.value || null });
              }}
              disabled={isSubmitting}
              rows={3}
              dir="rtl"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="isActive"
                checked={formData.isActive !== false}
                onCheckedChange={(checked) => {
                  setFormData({ ...formData, isActive: checked === true });
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
