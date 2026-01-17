'use client';

import dynamic from 'next/dynamic';
import { SheetSkeleton } from '@/components/ui/sheet-skeleton';

/**
 * Add System Event Sheet - Lazy loaded
 */
export const AddSystemEventSheet = dynamic(
  () => import('./add-system-event-sheet').then(mod => ({ default: mod.AddSystemEventSheet })),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Add System Event" description="Loading form..." />,
  }
);

/**
 * Edit System Event Sheet - Lazy loaded
 */
export const EditSystemEventSheet = dynamic(
  () => import('./edit-system-event-sheet').then(mod => ({ default: mod.EditSystemEventSheet })),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Edit System Event" description="Loading..." />,
  }
);

/**
 * View System Event Sheet - Lazy loaded
 */
export const ViewSystemEventSheet = dynamic(
  () => import('./view-system-event-sheet').then(mod => ({ default: mod.ViewSystemEventSheet })),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="System Event Details" description="Loading..." />,
  }
);
