'use client';

import useSWR from 'swr';

/**
 * Hook for fetching categories with subcategories
 * Used in the request details sidebar for category/subcategory selection
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

async function fetchCategories(): Promise<Category[]> {
  const response = await fetch('/api/categories?include_subcategories=true', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch categories');
  }

  const data: CategoriesResponse = await response.json();
  return data.categories || [];
}

/**
 * Hook to fetch all categories with subcategories
 *
 * @param initialData - Initial categories data from server (for SSR)
 * @returns SWR response with categories data
 */
export function useCategories(initialData?: Category[]) {
  const { data, error, isLoading, mutate } = useSWR<Category[]>(
    '/api/categories?include_subcategories=true',  // Cache key matches the actual request URL
    fetchCategories,
    {
      revalidateOnFocus: false,
      revalidateOnMount: true,
      revalidateIfStale: false,
      dedupingInterval: 300000, // 5 minutes - cache longer since categories rarely change
      fallbackData: initialData, // SSR data prevents loading state
    }
  );

  return {
    categories: data ?? initialData ?? [],
    isLoading: initialData ? false : isLoading, // No loading if we have SSR data
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
