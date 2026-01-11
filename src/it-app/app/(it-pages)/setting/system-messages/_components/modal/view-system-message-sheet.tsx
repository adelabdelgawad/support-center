'use client';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import type { SystemMessageResponse } from '@/types/system-messages';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';

interface ViewSystemMessageSheetProps {
  message: SystemMessageResponse;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Extract placeholders from template string
 */
function extractPlaceholders(template: string | null | undefined): string[] {
  if (!template) return [];
  const matches = template.match(/\{([^}]+)\}/g);
  return matches ? matches.map(m => m.slice(1, -1)) : [];
}

export default function ViewSystemMessageSheet({
  message,
  onOpenChange,
}: ViewSystemMessageSheetProps) {
  const placeholdersEn = extractPlaceholders(message.templateEn);
  const placeholdersAr = extractPlaceholders(message.templateAr);
  const allPlaceholders = [...new Set([...placeholdersEn, ...placeholdersAr])];

  return (
    <Sheet open={true} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>System Message Details</SheetTitle>
          <SheetDescription>View system message template information</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 pt-6">
          <div>
            <h3 className="text-sm font-medium text-gray-500">Message Type</h3>
            <p className="mt-1 text-base font-mono bg-muted px-2 py-1 rounded">
              {message.messageType}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500">English Template</h3>
            <div className="mt-1 text-base bg-muted px-3 py-2 rounded max-h-48 overflow-y-auto">
              <p className="whitespace-pre-wrap">{message.templateEn}</p>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500">Arabic Template</h3>
            <div className="mt-1 text-base bg-muted px-3 py-2 rounded max-h-48 overflow-y-auto" dir="rtl">
              <p className="whitespace-pre-wrap">{message.templateAr}</p>
            </div>
          </div>

          {allPlaceholders.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Placeholders</h3>
              <div className="flex flex-wrap gap-2">
                {allPlaceholders.map((placeholder, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs font-mono">
                    {placeholder}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                These placeholders can be used in the templates for dynamic values
              </p>
            </div>
          )}

          <div>
            <h3 className="text-sm font-medium text-gray-500">Status</h3>
            <div className="mt-1">
              <Badge
                variant={message.isActive ? 'default' : 'secondary'}
                className={
                  message.isActive
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                }
              >
                {message.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500">Created At</h3>
            <p className="mt-1 text-sm">
              {format(new Date(message.createdAt), 'MMM d, yyyy HH:mm')}
            </p>
          </div>

          <div className="flex gap-2 justify-end pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange?.(false)}
            >
              Close
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
