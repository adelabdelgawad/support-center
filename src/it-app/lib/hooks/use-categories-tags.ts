'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * Hook for fetching categories with subcategories
 * SIMPLIFIED: No SWR - uses simple state with initial data support
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
 * @returns Categories data and loading state
 */
export function useCategories(initialData?: Category[]) {
  const [categories, setCategories] = useState<Category[]>(initialData ?? []);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [error, setError] = useState<Error | undefined>(undefined);

  useEffect(() => {
    // Skip fetch if we have initial data
    if (initialData?.length) {
      setIsLoading(false);
      return;
    }

    const doFetch = async () => {
      try {
        const data = await fetchCategories();
        setCategories(data);
        setError(undefined);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch categories'));
      } finally {
        setIsLoading(false);
      }
    };

    doFetch();
  }, [initialData]);

  const mutate = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchCategories();
      setCategories(data);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch categories'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    categories,
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
