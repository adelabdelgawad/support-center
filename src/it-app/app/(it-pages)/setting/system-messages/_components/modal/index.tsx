'use client';

import dynamic from 'next/dynamic';
import { SheetSkeleton } from '@/components/ui/sheet-skeleton';

/**
 * Add System Message Sheet - Lazy loaded
 */
export const AddSystemMessageSheet = dynamic(
  () => import('./add-system-message-sheet').then(mod => ({ default: mod.AddSystemMessageSheet })),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Add System Message" description="Loading form..." />,
  }
);

/**
 * Edit System Message Sheet - Lazy loaded
 */
export const EditSystemMessageSheet = dynamic(
  () => import('./edit-system-message-sheet').then(mod => ({ default: mod.EditSystemMessageSheet })),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Edit System Message" description="Loading..." />,
  }
);

/**
 * View System Message Sheet - Lazy loaded
 */
export const ViewSystemMessageSheet = dynamic(
  () => import('./view-system-message-sheet').then(mod => ({ default: mod.ViewSystemMessageSheet })),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="System Message Details" description="Loading..." />,
  }
);
