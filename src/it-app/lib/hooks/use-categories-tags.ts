'use client';

import useSWR from 'swr';
import { cacheKeys } from '@/lib/swr/cache-keys';

/**
 * Hook for fetching categories with subcategories using SWR
 * Used in the request details sidebar for category/subcategory selection
 *
 * SWR provides:
 * - Automatic caching and deduplication
 * - Background revalidation
 * - Optimistic UI updates via mutate()
 */

interface Subcategory {
  id: number;
  categoryId: number;
  name: string;
  nameEn?: string;
  nameAr?: string;
  description: string | null;
  isActive: boolean;
}

interface Category {
  id: number;
  name: string;
  nameEn?: string;
  nameAr?: string;
  description: string | null;
  isActive: boolean;
  subcategories?: Subcategory[];
}

interface CategoriesResponse {
  categories: Category[];
  total: number;
}

const fetcher = async (url: string): Promise<Category[]> => {
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch categories');
  }

  const data: CategoriesResponse = await response.json();
  return data.categories || [];
};

/**
 * Hook to fetch all categories with subcategories using SWR
 *
 * @param initialData - Initial categories data from server (for SSR)
 * @returns Categories data and loading state
 */
export function useCategories(initialData?: Category[]) {
  const { data, error, isLoading, mutate } = useSWR<Category[]>(
    cacheKeys.globalCategories,
    fetcher,
    {
      fallbackData: initialData,
      revalidateOnMount: !initialData,
      revalidateOnFocus: false,
      dedupingInterval: 5000, // Deduplicate requests within 5 seconds
    }
  );

  return {
    categories: data ?? [],
    isLoading,
    error,
    mutate,
  };
}

/**
 * Function to update request subcategory
 */
export async function updateRequestSubcategory(requestId: string, subcategoryId: number): Promise<void> {
  const response = await fetch(`/api/requests-details/${requestId}/category`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ subcategoryId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to update subcategory');
  }
}

export type { Category, Subcategory };
