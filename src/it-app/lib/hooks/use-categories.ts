'use client';

import { useAsyncData } from '@/lib/hooks/use-async-data';
import { useCallback } from 'react';

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
 * Hook to fetch all categories with subcategories using useAsyncData
 *
 * @param initialData - Initial categories data from server (for SSR)
 * @returns Categories data and loading state
 */
export function useCategories(initialData?: Category[]) {
  const fetchCategories = useCallback(async () => {
    return await fetcher('/api/categories?include_subcategories=true');
  }, []);

  const { data, error, isLoading, mutate } = useAsyncData<Category[]>(
    fetchCategories,
    [],
    initialData
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
