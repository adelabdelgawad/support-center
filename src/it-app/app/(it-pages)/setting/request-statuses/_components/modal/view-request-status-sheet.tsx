'use client';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import type { RequestStatusResponse } from '@/types/request-statuses';
import { formatDate } from '@/lib/utils/date-formatting';
import { Badge } from '@/components/ui/badge';
import { Lock } from 'lucide-react';

interface ViewRequestStatusSheetProps {
  status: RequestStatusResponse;
  onOpenChange?: (open: boolean) => void;
}

export default function ViewRequestStatusSheet({
  status,
  onOpenChange,
}: ViewRequestStatusSheetProps) {
  return (
    <Sheet open={true} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Request Status Details</SheetTitle>
          <SheetDescription>View request status information</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 pt-6 px-4">
          <div>
            <h3 className="text-sm font-medium text-gray-500">Name</h3>
            <p className="mt-1 text-base font-medium flex items-center gap-2">
              {status.name}
              {status.readonly && (
                <Badge variant="outline" className="gap-1">
                  <Lock className="h-3 w-3" />
                  Readonly
                </Badge>
              )}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500">Color</h3>
            <div className="mt-1 flex items-center gap-2">
              {status.color ? (
                <>
                  <div
                    className="w-8 h-8 rounded border border-gray-300"
                    style={{ backgroundColor: status.color }}
                  />
                  <span className="text-sm">{status.color}</span>
                </>
              ) : (
                <span className="text-gray-400">—</span>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500">Description</h3>
            <p className="mt-1 text-base text-gray-900">
              {status.description || '—'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium text-gray-500">Status</h3>
              <div className="mt-1">
                <Badge
                  variant={status.isActive ? 'default' : 'secondary'}
                  className={
                    status.isActive
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }
                >
                  {status.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">Count as Solved</h3>
              <div className="mt-1">
                <Badge
                  variant={status.countAsSolved ? 'default' : 'secondary'}
                  className={
                    status.countAsSolved
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-gray-100 text-gray-800'
                  }
                >
                  {status.countAsSolved ? 'Yes' : 'No'}
                </Badge>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">Visible to Requester</h3>
              <div className="mt-1">
                <Badge
                  variant={status.visibleOnRequesterPage ? 'default' : 'secondary'}
                  className={
                    status.visibleOnRequesterPage
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }
                >
                  {status.visibleOnRequesterPage ? 'Yes' : 'No'}
                </Badge>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium text-gray-500">Created At</h3>
              <p className="mt-1 text-sm">
                {formatDate(status.createdAt)}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">Updated At</h3>
              <p className="mt-1 text-sm">
                {formatDate(status.updatedAt)}
              </p>
            </div>
          </div>

          {status.createdBy && (
            <div>
              <h3 className="text-sm font-medium text-gray-500">Created By</h3>
              <p className="mt-1 text-sm">{status.createdBy}</p>
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
