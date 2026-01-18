'use client';

import dynamic from 'next/dynamic';
import { SheetSkeleton } from '@/components/ui/sheet-skeleton';

// Lazy-loaded modal components for better performance
// These are loaded on-demand only when the modal is opened

/**
 * Add Business Unit Sheet - Lazy loaded
 * Opens when user clicks "Add Business Unit" button
 */
export const AddBusinessUnitSheet = dynamic(
  () => import('./add-business-unit-sheet').then(mod => ({ default: mod.AddBusinessUnitSheet })),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Add Business Unit" description="Loading form..." />,
  }
);

/**
 * Edit Business Unit Sheet - Lazy loaded
 * Opens when user clicks "Edit" on a business unit
 */
export const EditBusinessUnitSheet = dynamic(
  () => import('./edit-business-unit-sheet').then(mod => ({ default: mod.EditBusinessUnitSheet })),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Edit Business Unit" description="Loading..." />,
  }
);

/**
 * View Business Unit Sheet - Lazy loaded
 * Opens when user views a business unit details
 */
export const ViewBusinessUnitSheet = dynamic(
  () => import('./view-business-unit-sheet').then(mod => ({ default: mod.ViewBusinessUnitSheet })),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Business Unit Details" description="Loading..." />,
  }
);

/**
 * Working Hours Sheet - Lazy loaded
 * Opens when user manages working hours
 */
export const WorkingHoursSheet = dynamic(
  () => import('./working-hours-sheet').then(mod => ({ default: mod.WorkingHoursSheet })),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Working Hours" description="Loading..." />,
  }
);

/**
 * Manage Users Sheet - Lazy loaded
 * Opens when user manages business unit users
 */
export const ManageUsersSheet = dynamic(
  () => import('./manage-users-sheet').then(mod => ({ default: mod.ManageUsersSheet })),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Manage Users" description="Loading..." />,
  }
);
