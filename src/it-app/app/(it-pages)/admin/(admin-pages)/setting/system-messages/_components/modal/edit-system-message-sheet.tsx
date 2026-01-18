'use client';

import { useMemo } from 'react';
import { z } from 'zod';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { EntityFormSheet } from '@/components/settings';
import { updateSystemMessage } from '@/lib/api/system-messages';
import { useSystemMessagesActions } from '../../context/system-messages-actions-context';
import { MessageSquare } from 'lucide-react';
import type { SystemMessageResponse, SystemMessageUpdate } from '@/types/system-messages';

const systemMessageSchema = z.object({
  templateEn: z.string().min(1, 'English template is required').max(2000, 'Template must be 2000 characters or less'),
  templateAr: z.string().min(1, 'Arabic template is required').max(2000, 'Template must be 2000 characters or less'),
  isActive: z.boolean(),
});

type SystemMessageFormData = z.infer<typeof systemMessageSchema>;

interface EditSystemMessageSheetProps {
  message: SystemMessageResponse;
  onOpenChange?: (open: boolean) => void;
}

export function EditSystemMessageSheet({
  message,
  onOpenChange,
}: EditSystemMessageSheetProps) {
  const { updateMessagesOptimistic } = useSystemMessagesActions();

  const handleSubmit = async (data: SystemMessageFormData) => {
    const updateData: SystemMessageUpdate = {
      templateEn: data.templateEn !== message.templateEn ? data.templateEn : null,
      templateAr: data.templateAr !== message.templateAr ? data.templateAr : null,
      isActive: data.isActive !== message.isActive ? data.isActive : null,
    };

    const updatedMessage = await updateSystemMessage(String(message.id), updateData);
    await updateMessagesOptimistic([updatedMessage]);
  };

  const defaultValues: SystemMessageFormData = useMemo(() => ({
    templateEn: message.templateEn,
    templateAr: message.templateAr,
    isActive: message.isActive,
  }), [message]);

  return (
    <EntityFormSheet<SystemMessageFormData>
      open={true}
      onOpenChange={onOpenChange ?? (() => {})}
      mode="edit"
      title="System Message"
      description={`Update template for "${message.messageType}".`}
      icon={MessageSquare}
      schema={systemMessageSchema}
      defaultValues={defaultValues}
      onSubmit={handleSubmit}
      size="lg"
    >
      {(form) => (
        <>
          {/* Message Type - Read Only */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Message Type</Label>
            <div className="text-sm bg-muted px-3 py-2 rounded border font-mono">
              {message.messageType}
            </div>
            <p className="text-xs text-muted-foreground">
              Message type cannot be changed after creation
            </p>
          </div>

          <FormField
            control={form.control}
            name="templateEn"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  English Template <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    placeholder="e.g., Status changed from {old_status} to {new_status}"
                    rows={6}
                  />
                </FormControl>
                <FormDescription>
                  Use placeholders like {'{placeholder}'} for dynamic values
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="templateAr"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Arabic Template <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    placeholder="مثال: تم تغيير الحالة من {old_status} إلى {new_status}"
                    rows={6}
                    dir="rtl"
                  />
                </FormControl>
                <FormDescription dir="rtl">
                  استخدم متغيرات مثل {'{placeholder}'} للقيم الديناميكية
                </FormDescription>
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

export default EditSystemMessageSheet;
