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
import { createSystemMessage } from '@/lib/api/system-messages';
import { useSystemMessagesActions } from '../../context/system-messages-actions-context';
import { toast } from 'sonner';
import type { SystemMessageCreate } from '@/types/system-messages';

interface AddSystemMessageSheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export default function AddSystemMessageSheet({
  open = true,
  onOpenChange,
}: AddSystemMessageSheetProps) {
  const { addMessageToCache } = useSystemMessagesActions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<SystemMessageCreate>({
    messageType: '',
    templateEn: '',
    templateAr: '',
    isActive: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.messageType.trim()) {
      toast.error('Message type is required');
      return;
    }
    if (!formData.templateEn.trim()) {
      toast.error('English template is required');
      return;
    }
    if (!formData.templateAr.trim()) {
      toast.error('Arabic template is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const newMessage = await createSystemMessage(formData);
      await addMessageToCache(newMessage);
      toast.success('System message created successfully');
      setFormData({
        messageType: '',
        templateEn: '',
        templateAr: '',
        isActive: true,
      });
      onOpenChange?.(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create system message';
      toast.error(errorMessage);
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add System Message</SheetTitle>
          <SheetDescription>Create a new system message template</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label htmlFor="messageType">Message Type *</Label>
            <Input
              id="messageType"
              placeholder="e.g., new_request, ticket_assigned, request_solved"
              value={formData.messageType}
              onChange={(e) => setFormData({ ...formData, messageType: e.target.value })}
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              Unique identifier for this message template (lowercase, underscores)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="templateEn">English Template *</Label>
            <Textarea
              id="templateEn"
              placeholder="e.g., New request created: {request_title}"
              value={formData.templateEn}
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
              placeholder="مثال: تم إنشاء طلب جديد: {request_title}"
              value={formData.templateAr}
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
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
