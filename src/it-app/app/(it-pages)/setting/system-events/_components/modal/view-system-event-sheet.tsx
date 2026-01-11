'use client';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import type { SystemEventResponse } from '@/types/system-events';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';

interface ViewSystemEventSheetProps {
  event: SystemEventResponse;
  onOpenChange?: (open: boolean) => void;
}

export default function ViewSystemEventSheet({
  event,
  onOpenChange,
}: ViewSystemEventSheetProps) {
  return (
    <Sheet open={true} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>System Event Details</SheetTitle>
          <SheetDescription>View system event information</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 pt-6">
          <div>
            <h3 className="text-sm font-medium text-gray-500">Event Key</h3>
            <p className="mt-1 text-base font-mono bg-muted px-2 py-1 rounded">
              {event.eventKey}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500">Event Name (English)</h3>
            <p className="mt-1 text-base font-medium">
              {event.eventNameEn}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500">Event Name (Arabic)</h3>
            <p className="mt-1 text-base font-medium" dir="rtl">
              {event.eventNameAr}
            </p>
          </div>

          {(event.descriptionEn || event.descriptionAr) && (
            <>
              {event.descriptionEn && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Description (English)</h3>
                  <p className="mt-1 text-base text-gray-900">
                    {event.descriptionEn}
                  </p>
                </div>
              )}

              {event.descriptionAr && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Description (Arabic)</h3>
                  <p className="mt-1 text-base text-gray-900" dir="rtl">
                    {event.descriptionAr}
                  </p>
                </div>
              )}
            </>
          )}

          <div>
            <h3 className="text-sm font-medium text-gray-500">Trigger Timing</h3>
            <div className="mt-1">
              <Badge variant={event.triggerTiming === 'immediate' ? 'default' : 'secondary'}>
                {event.triggerTiming}
              </Badge>
            </div>
          </div>

          {event.systemMessage && (
            <div>
              <h3 className="text-sm font-medium text-gray-500">Linked System Message</h3>
              <div className="mt-1 space-y-2 bg-muted p-3 rounded">
                <div>
                  <span className="text-xs text-muted-foreground">ID: </span>
                  <span className="text-sm font-medium">{event.systemMessage.id}</span>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Type: </span>
                  <Badge variant="outline">{event.systemMessage.messageType}</Badge>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Template (EN): </span>
                  <p className="text-sm mt-1">{event.systemMessage.templateEn}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Template (AR): </span>
                  <p className="text-sm mt-1" dir="rtl">{event.systemMessage.templateAr}</p>
                </div>
              </div>
            </div>
          )}

          {!event.systemMessage && event.systemMessageId && (
            <div>
              <h3 className="text-sm font-medium text-gray-500">System Message ID</h3>
              <p className="mt-1 text-sm text-gray-900">
                {event.systemMessageId}
              </p>
            </div>
          )}

          <div>
            <h3 className="text-sm font-medium text-gray-500">Status</h3>
            <div className="mt-1">
              <Badge
                variant={event.isActive ? 'default' : 'secondary'}
                className={
                  event.isActive
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                }
              >
                {event.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium text-gray-500">Created At</h3>
              <p className="mt-1 text-sm">
                {format(new Date(event.createdAt), 'MMM d, yyyy HH:mm')}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">Updated At</h3>
              <p className="mt-1 text-sm">
                {format(new Date(event.updatedAt), 'MMM d, yyyy HH:mm')}
              </p>
            </div>
          </div>

          {event.createdBy && (
            <div>
              <h3 className="text-sm font-medium text-gray-500">Created By</h3>
              <p className="mt-1 text-sm">{event.createdBy}</p>
            </div>
          )}

          {event.updatedBy && (
            <div>
              <h3 className="text-sm font-medium text-gray-500">Updated By</h3>
              <p className="mt-1 text-sm">{event.updatedBy}</p>
            </div>
          )}

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
