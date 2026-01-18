'use client';

import dynamic from 'next/dynamic';
import { SheetSkeleton } from '@/components/ui/sheet-skeleton';

/**
 * Add User Sheet - Lazy loaded
 */
export const AddUserSheet = dynamic(
  () => import('./add-user-sheet').then(mod => ({ default: mod.AddUserSheet })),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Add User" description="Loading form..." />,
  }
);

/**
 * Edit User Sheet - Lazy loaded
 */
export const EditUserSheet = dynamic(
  () => import('./edit-user-sheet').then(mod => ({ default: mod.EditUserSheet })),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Edit User" description="Loading..." />,
  }
);

/**
 * View User Sheet - Lazy loaded
 */
export const ViewUserSheet = dynamic(
  () => import('./view-user-sheet').then(mod => ({ default: mod.ViewUserSheet })),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="User Details" description="Loading..." />,
  }
);

/**
 * Assign Business Units Sheet - Lazy loaded
 */
export const AssignBusinessUnitsSheet = dynamic(
  () => import('./assign-business-units-sheet').then(mod => ({ default: mod.AssignBusinessUnitsSheet })),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Assign Business Units" description="Loading..." />,
  }
);
