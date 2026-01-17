'use client';

import dynamic from 'next/dynamic';
import { SheetSkeleton } from '@/components/ui/sheet-skeleton';

/**
 * Add Role Sheet - Lazy loaded
 */
export const AddRoleSheet = dynamic(
  () => import('./add-role-sheet'),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Add Role" description="Loading form..." />,
  }
);

/**
 * Edit Role Sheet - Lazy loaded
 */
export const EditRoleSheet = dynamic(
  () => import('./edit-role-sheet'),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Edit Role" description="Loading..." />,
  }
);

/**
 * Edit Role Pages Sheet - Lazy loaded
 */
export const EditRolePagesSheet = dynamic(
  () => import('./edit-role-pages-sheet'),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Edit Role Pages" description="Loading..." />,
  }
);

/**
 * Edit Role Users Sheet - Lazy loaded
 */
export const EditRoleUsersSheet = dynamic(
  () => import('./edit-role-users-sheet'),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Edit Role Users" description="Loading..." />,
  }
);
