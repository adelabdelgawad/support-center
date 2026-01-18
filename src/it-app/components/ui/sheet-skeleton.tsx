'use client';

import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

interface SheetSkeletonProps {
  open?: boolean;
  title?: string;
  description?: string;
}

/**
 * Skeleton loader for modal sheets during lazy loading
 */
export function SheetSkeleton({
  open = true,
  title = 'Loading...',
  description = 'Please wait',
}: SheetSkeletonProps) {
  return (
    <Sheet open={open}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[90%]" />
            <Skeleton className="h-4 w-[80%]" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
