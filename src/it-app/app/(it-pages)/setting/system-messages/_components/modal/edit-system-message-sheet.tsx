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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { updateSystemMessage } from '@/lib/api/system-messages';
import { useSystemMessagesActions } from '../../context/system-messages-actions-context';
import { toast } from 'sonner';
import { UnsavedChangesWarning } from '@/components/ui/unsaved-changes-warning';
import type { SystemMessageResponse, SystemMessageUpdate } from '@/types/system-messages';

interface EditSystemMessageSheetProps {
  message: SystemMessageResponse;
  onOpenChange?: (open: boolean) => void;
}

export default function EditSystemMessageSheet({
  message,
  onOpenChange,
}: EditSystemMessageSheetProps) {
  const { updateMessagesOptimistic } = useSystemMessagesActions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<SystemMessageUpdate>({
    templateEn: message.templateEn,
    templateAr: message.templateAr,
    isActive: message.isActive,
  });

  const hasChanges =
    formData.templateEn !== message.templateEn ||
    formData.templateAr !== message.templateAr ||
    formData.isActive !== message.isActive;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.templateEn?.trim()) {
      toast.error('English template is required');
      return;
    }
    if (!formData.templateAr?.trim()) {
      toast.error('Arabic template is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const updatedMessage = await updateSystemMessage(String(message.id), formData);
      await updateMessagesOptimistic([updatedMessage]);
      toast.success('System message updated successfully');
      onOpenChange?.(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update system message';
      toast.error(errorMessage);
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={true} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit System Message</SheetTitle>
          <SheetDescription>Update the system message template</SheetDescription>
        </SheetHeader>

        <UnsavedChangesWarning show={hasChanges} className="mt-4" />

        <form onSubmit={handleSubmit} className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-500">Message Type</Label>
            <p className="text-sm text-muted-foreground bg-muted p-2 rounded font-mono">
              {message.messageType}
            </p>
            <p className="text-xs text-muted-foreground">
              Message type cannot be changed after creation
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="templateEn">English Template *</Label>
            <Textarea
              id="templateEn"
              placeholder="e.g., Status changed from {old_status} to {new_status}"
              value={formData.templateEn || ''}
              onChange={(e) => setFormData({ ...formData, templateEn: e.target.value })}
              disabled={isSubmitting}
              rows={6}
            />
            <p className="text-xs text-muted-foreground">
              Use placeholders like {'{'}placeholder{'}'} for dynamic values
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="templateAr">Arabic Template *</Label>
            <Textarea
              id="templateAr"
              placeholder="مثال: تم تغيير الحالة من {old_status} إلى {new_status}"
              value={formData.templateAr || ''}
              onChange={(e) => setFormData({ ...formData, templateAr: e.target.value })}
              disabled={isSubmitting}
              dir="rtl"
              rows={6}
            />
            <p className="text-xs text-muted-foreground" dir="rtl">
              استخدم متغيرات مثل {'{'}placeholder{'}'} للقيم الديناميكية
            </p>
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
