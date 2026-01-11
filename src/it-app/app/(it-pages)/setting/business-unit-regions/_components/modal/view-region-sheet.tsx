'use client';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import type { BusinessUnitRegionResponse } from '@/types/business-unit-regions';
import { formatDate } from '@/lib/utils/date-formatting';
import { Badge } from '@/components/ui/badge';

interface ViewRegionSheetProps {
  region: BusinessUnitRegionResponse;
  onOpenChange?: (open: boolean) => void;
}

export default function ViewRegionSheet({ region, onOpenChange }: ViewRegionSheetProps) {
  return (
    <Sheet open={true} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Region Details</SheetTitle>
          <SheetDescription>View business unit region information</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 pt-6">
          <div>
            <h3 className="text-sm font-medium text-gray-500">Name</h3>
            <p className="mt-1 text-base font-medium">{region.name}</p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500">Description</h3>
            <p className="mt-1 text-base text-gray-900">
              {region.description || '—'}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-500">Status</h3>
            <div className="mt-1 flex items-center gap-2">
              <Badge
                variant={region.isActive ? 'default' : 'secondary'}
                className={region.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}
              >
                {region.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium text-gray-500">Created At</h3>
              <p className="mt-1 text-sm">
                {formatDate(region.createdAt)}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500">Updated At</h3>
              <p className="mt-1 text-sm">
                {formatDate(region.updatedAt)}
              </p>
            </div>
          </div>

          {region.createdBy && (
            <div>
              <h3 className="text-sm font-medium text-gray-500">Created By</h3>
              <p className="mt-1 text-sm">{region.createdBy}</p>
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
