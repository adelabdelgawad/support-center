'use client';

import dynamic from 'next/dynamic';
import { SheetSkeleton } from '@/components/ui/sheet-skeleton';

/**
 * Add Region Sheet - Lazy loaded
 */
export const AddRegionSheet = dynamic(
  () => import('./add-region-sheet'),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Add Region" description="Loading form..." />,
  }
);

/**
 * Edit Region Sheet - Lazy loaded
 */
export const EditRegionSheet = dynamic(
  () => import('./edit-region-sheet'),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Edit Region" description="Loading..." />,
  }
);

/**
 * View Region Sheet - Lazy loaded
 */
export const ViewRegionSheet = dynamic(
  () => import('./view-region-sheet'),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Region Details" description="Loading..." />,
  }
);

/**
 * Manage Business Units Sheet - Lazy loaded
 */
export const ManageBusinessUnitsSheet = dynamic(
  () => import('./manage-business-units-sheet'),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Manage Business Units" description="Loading..." />,
  }
);
