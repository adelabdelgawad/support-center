'use client';

import dynamic from 'next/dynamic';
import { SheetSkeleton } from '@/components/ui/sheet-skeleton';

/**
 * Add User Sheet - Lazy loaded
 */
export const AddUserSheet = dynamic(
  () => import('./add-user-sheet'),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Add User" description="Loading form..." />,
  }
);

/**
 * Edit User Sheet - Lazy loaded
 */
export const EditUserSheet = dynamic(
  () => import('./edit-user-sheet'),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Edit User" description="Loading..." />,
  }
);

/**
 * View User Sheet - Lazy loaded
 */
export const ViewUserSheet = dynamic(
  () => import('./view-user-sheet'),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="User Details" description="Loading..." />,
  }
);

/**
 * Assign Business Units Sheet - Lazy loaded
 */
export const AssignBusinessUnitsSheet = dynamic(
  () => import('./assign-business-units-sheet'),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Assign Business Units" description="Loading..." />,
  }
);
