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
import { createRequestType } from '@/lib/api/request-types';
import { useRequestTypesActions } from '../../context/request-types-actions-context';
import { toast } from 'sonner';
import type { RequestTypeCreate } from '@/types/request-types';

interface AddRequestTypeSheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function AddRequestTypeSheet({
  open = true,
  onOpenChange,
}: AddRequestTypeSheetProps) {
  const { addTypeToCache } = useRequestTypesActions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<RequestTypeCreate>({
    nameEn: '',
    nameAr: '',
    briefEn: null,
    briefAr: null,
    isActive: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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
      const newType = await createRequestType(formData);
      await addTypeToCache(newType);
      toast.success('Request type created successfully');
      setFormData({
        nameEn: '',
        nameAr: '',
        briefEn: null,
        briefAr: null,
        isActive: true,
      });
      onOpenChange?.(false);
    } catch (error) {
      toast.error('Failed to create request type');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Add Request Type</SheetTitle>
          <SheetDescription>Create a new request type</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-6 px-4">
          <div className="space-y-2">
            <Label htmlFor="nameEn">Name (English) *</Label>
            <Input
              id="nameEn"
              placeholder="e.g., Hardware Request"
              value={formData.nameEn}
              onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nameAr">Name (Arabic) *</Label>
            <Input
              id="nameAr"
              placeholder="e.g., طلب أجهزة"
              value={formData.nameAr}
              onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
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
              onChange={(e) => setFormData({ ...formData, briefEn: e.target.value || null })}
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
              onChange={(e) => setFormData({ ...formData, briefAr: e.target.value || null })}
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
