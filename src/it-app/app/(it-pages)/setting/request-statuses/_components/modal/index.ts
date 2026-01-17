'use client';

import dynamic from 'next/dynamic';
import { SheetSkeleton } from '@/components/ui/sheet-skeleton';

/**
 * Add Request Status Sheet - Lazy loaded
 */
export const AddRequestStatusSheet = dynamic(
  () => import('./add-request-status-sheet'),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Add Request Status" description="Loading form..." />,
  }
);

/**
 * Edit Request Status Sheet - Lazy loaded
 */
export const EditRequestStatusSheet = dynamic(
  () => import('./edit-request-status-sheet'),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Edit Request Status" description="Loading..." />,
  }
);

/**
 * View Request Status Sheet - Lazy loaded
 */
export const ViewRequestStatusSheet = dynamic(
  () => import('./view-request-status-sheet'),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Request Status Details" description="Loading..." />,
  }
);
