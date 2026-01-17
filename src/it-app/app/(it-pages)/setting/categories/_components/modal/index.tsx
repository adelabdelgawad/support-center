'use client';

import dynamic from 'next/dynamic';
import { SheetSkeleton } from '@/components/ui/sheet-skeleton';

/**
 * Add Category Sheet - Lazy loaded
 */
export const AddCategorySheet = dynamic(
  () => import('./add-category-sheet').then(mod => ({ default: mod.AddCategorySheet })),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Add Category" description="Loading form..." />,
  }
);

/**
 * Edit Category Sheet - Lazy loaded
 */
export const EditCategorySheet = dynamic(
  () => import('./edit-category-sheet').then(mod => ({ default: mod.EditCategorySheet })),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Edit Category" description="Loading..." />,
  }
);

/**
 * Add Subcategory Sheet - Lazy loaded
 */
export const AddSubcategorySheet = dynamic(
  () => import('./add-subcategory-sheet').then(mod => ({ default: mod.AddSubcategorySheet })),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Add Subcategory" description="Loading form..." />,
  }
);

/**
 * Edit Subcategory Sheet - Lazy loaded
 */
export const EditSubcategorySheet = dynamic(
  () => import('./edit-subcategory-sheet').then(mod => ({ default: mod.EditSubcategorySheet })),
  {
    ssr: false,
    loading: () => <SheetSkeleton title="Edit Subcategory" description="Loading..." />,
  }
);
