'use client';

import { z } from 'zod';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { EntityFormSheet } from '@/components/settings';
import { createSystemMessage } from '@/lib/api/system-messages';
import { useSystemMessagesActions } from '../../context/system-messages-actions-context';
import { MessageSquare } from 'lucide-react';
import type { SystemMessageCreate } from '@/types/system-messages';

const systemMessageSchema = z.object({
  messageType: z.string().min(1, 'Message type is required').max(100, 'Message type must be 100 characters or less')
    .regex(/^[a-z_]+$/, 'Message type must be lowercase with underscores only'),
  templateEn: z.string().min(1, 'English template is required').max(2000, 'Template must be 2000 characters or less'),
  templateAr: z.string().min(1, 'Arabic template is required').max(2000, 'Template must be 2000 characters or less'),
  isActive: z.boolean(),
});

type SystemMessageFormData = z.infer<typeof systemMessageSchema>;

interface AddSystemMessageSheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AddSystemMessageSheet({
  open = false,
  onOpenChange,
}: AddSystemMessageSheetProps) {
  const { addMessageToCache } = useSystemMessagesActions();

  const handleSubmit = async (data: SystemMessageFormData) => {
    const createData: SystemMessageCreate = {
      messageType: data.messageType,
      templateEn: data.templateEn,
      templateAr: data.templateAr,
      isActive: data.isActive,
    };

    const newMessage = await createSystemMessage(createData);
    await addMessageToCache(newMessage);
  };

  const defaultValues: SystemMessageFormData = {
    messageType: '',
    templateEn: '',
    templateAr: '',
    isActive: true,
  };

  return (
    <EntityFormSheet<SystemMessageFormData>
      open={open}
      onOpenChange={onOpenChange ?? (() => {})}
      mode="add"
      title="System Message"
      description="Create a new message template for system notifications."
      icon={MessageSquare}
      schema={systemMessageSchema}
      defaultValues={defaultValues}
      onSubmit={handleSubmit}
      size="lg"
    >
      {(form) => (
        <>
          <FormField
            control={form.control}
            name="messageType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Message Type <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Input {...field} placeholder="e.g., new_request, ticket_assigned" className="font-mono" />
                </FormControl>
                <FormDescription>
                  Unique identifier (lowercase, underscores only)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

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
                    placeholder="e.g., New request created: {request_title}"
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
                    placeholder="مثال: تم إنشاء طلب جديد: {request_title}"
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

export default AddSystemMessageSheet;
