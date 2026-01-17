'use client';

import dynamic from 'next/dynamic';
import { SheetSkeleton } from '@/components/ui/sheet-skeleton';

/**
 * Add Request Type Sheet - Lazy loaded
 */
export const AddRequestTypeSheet = dynamic(
  () => import('./add-request-type-sheet'),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Add Request Type" description="Loading form..." />,
  }
);

/**
 * Edit Request Type Sheet - Lazy loaded
 */
export const EditRequestTypeSheet = dynamic(
  () => import('./edit-request-type-sheet'),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Edit Request Type" description="Loading..." />,
  }
);

/**
 * View Request Type Sheet - Lazy loaded
 */
export const ViewRequestTypeSheet = dynamic(
  () => import('./view-request-type-sheet'),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Request Type Details" description="Loading..." />,
  }
);
