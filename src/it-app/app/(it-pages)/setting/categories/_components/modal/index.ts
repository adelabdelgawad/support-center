'use client';

import dynamic from 'next/dynamic';
import { SheetSkeleton } from '@/components/ui/sheet-skeleton';

/**
 * Add Category Sheet - Lazy loaded
 */
export const AddCategorySheet = dynamic(
  () => import('./add-category-sheet'),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Add Category" description="Loading form..." />,
  }
);

/**
 * Edit Category Sheet - Lazy loaded
 */
export const EditCategorySheet = dynamic(
  () => import('./edit-category-sheet'),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Edit Category" description="Loading..." />,
  }
);

/**
 * Add Subcategory Sheet - Lazy loaded
 */
export const AddSubcategorySheet = dynamic(
  () => import('./add-subcategory-sheet'),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Add Subcategory" description="Loading form..." />,
  }
);

/**
 * Edit Subcategory Sheet - Lazy loaded
 */
export const EditSubcategorySheet = dynamic(
  () => import('./edit-subcategory-sheet'),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Edit Subcategory" description="Loading..." />,
  }
);
