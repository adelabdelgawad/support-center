'use client';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import type { RequestType } from '@/types/request-types';
import { formatDate } from '@/lib/utils/date-formatting';
import { Badge } from '@/components/ui/badge';

interface ViewRequestTypeSheetProps {
  type: RequestType;
  onOpenChange?: (open: boolean) => void;
}

export default function ViewRequestTypeSheet({
  type,
  onOpenChange,
}: ViewRequestTypeSheetProps) {
  return (
    <Sheet open={true} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Request Type Details</SheetTitle>
          <SheetDescription>View request type information</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 pt-6 px-4">
          <div>
            <h3 className="text-sm font-medium text-gray-500">Name</h3>
            <p className="mt-1 text-base font-medium">{type.nameEn}</p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500">Description</h3>
            <p className="mt-1 text-base text-gray-900">
              {type.briefEn || '—'}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500">Status</h3>
            <div className="mt-1">
              <Badge
                variant={type.isActive ? 'default' : 'secondary'}
                className={
                  type.isActive
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                }
              >
                {type.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium text-gray-500">Created At</h3>
              <p className="mt-1 text-sm">
                {formatDate(type.createdAt)}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">Updated At</h3>
              <p className="mt-1 text-sm">
                {formatDate(type.updatedAt)}
              </p>
            </div>
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
