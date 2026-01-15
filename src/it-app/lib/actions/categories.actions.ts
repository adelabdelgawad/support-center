"use server";

import { serverFetch, CACHE_PRESETS } from "@/lib/api/server-fetch";
import type {
  CategoryResponse,
  CategoryCreateRequest,
  CategoryUpdateRequest,
  SettingCategoriesResponse,
  SubcategoriesResponse,
  SubcategoryResponse,
} from "@/types/categories";

/**
 * Fetches subcategories for a specific category
 */
export async function getCategorySubcategories(
  categoryId: number
): Promise<SubcategoryResponse[]> {
  return serverFetch<SubcategoryResponse[]>(
    `/categories/subcategories?category_id=${categoryId}&active_only=false`,
    CACHE_PRESETS.NO_CACHE()
  );
}

/**
 * Fetches all categories with optional filtering and their subcategories
 *
 * Cache: NO_CACHE (dynamic filters require fresh data)
 */
export async function getCategories(params?: {
  activeOnly?: boolean;
  includeSubcategories?: boolean;
  filterCriteria?: {
    is_active?: string;
    name?: string;
    [key: string]: string | undefined;
  };
}): Promise<SettingCategoriesResponse & { subcategoriesMap?: Record<number, SubcategoryResponse[]> }> {
  const activeOnly = params?.filterCriteria?.is_active === "true"
    ? true
    : params?.filterCriteria?.is_active === "false"
    ? false
    : params?.activeOnly ?? false;

  const categories = await serverFetch<CategoryResponse[]>(
    `/categories/categories?active_only=${activeOnly}`,
    CACHE_PRESETS.NO_CACHE()
  );

  // Calculate counts
  const allCategories = activeOnly
    ? categories
    : await serverFetch<CategoryResponse[]>(
        `/categories/categories?active_only=false`,
        CACHE_PRESETS.NO_CACHE()
      );

  const activeCount = allCategories.filter((c) => c.isActive).length;
  const inactiveCount = allCategories.filter((c) => !c.isActive).length;

  // Filter by name if provided
  let filteredCategories = activeOnly ? categories : allCategories;
  if (params?.filterCriteria?.name) {
    const searchTerm = params.filterCriteria.name.toLowerCase();
    filteredCategories = filteredCategories.filter(
      (c) =>
        c.name.toLowerCase().includes(searchTerm) ||
        c.nameEn.toLowerCase().includes(searchTerm) ||
        c.nameAr.toLowerCase().includes(searchTerm)
    );
  }

  // Apply is_active filter
  if (params?.filterCriteria?.is_active === "true") {
    filteredCategories = filteredCategories.filter((c) => c.isActive);
  } else if (params?.filterCriteria?.is_active === "false") {
    filteredCategories = filteredCategories.filter((c) => !c.isActive);
  }

  // Fetch subcategories for all categories if requested
  let subcategoriesMap: Record<number, SubcategoryResponse[]> | undefined;
  if (params?.includeSubcategories) {
    subcategoriesMap = {};
    await Promise.all(
      filteredCategories.map(async (category) => {
        const subcategories = await getCategorySubcategories(category.id);
        subcategoriesMap![category.id] = subcategories;
      })
    );
  }

  return {
    categories: filteredCategories,
    total: filteredCategories.length,
    activeCount,
    inactiveCount,
    subcategoriesMap,
  };
}

/**
 * Create new category
 */
export async function createCategory(
  categoryData: CategoryCreateRequest
): Promise<CategoryResponse> {
  return serverFetch<CategoryResponse>("/categories/categories", {
    method: "POST",
    body: categoryData,
  });
}

/**
 * Update existing category
 */
export async function updateCategory(
  categoryId: number,
  categoryData: CategoryUpdateRequest
): Promise<CategoryResponse> {
  return serverFetch<CategoryResponse>(`/categories/categories/${categoryId}`, {
    method: "PUT",
    body: categoryData,
  });
}

/**
 * Toggle category status (active/inactive)
 */
export async function toggleCategoryStatus(
  categoryId: number,
  newStatus: boolean
): Promise<CategoryResponse> {
  return serverFetch<CategoryResponse>(`/categories/categories/${categoryId}`, {
    method: "PUT",
    body: { is_active: newStatus },
  });
}

/**
 * Fetches subcategories for a given category
 *
 * Cache: NO_CACHE (dynamic data requires fresh results)
 */
export async function getSubcategories(
  categoryId: number
): Promise<SubcategoriesResponse> {
  try {
    const subcategories = await serverFetch<SubcategoryResponse[]>(
      `/categories/subcategories?category_id=${categoryId}`,
      CACHE_PRESETS.NO_CACHE()
    );

    // Calculate counts
    const activeCount = subcategories.filter((s) => s.isActive).length;
    const inactiveCount = subcategories.filter((s) => !s.isActive).length;

    return {
      subcategories,
      total: subcategories.length,
      activeCount,
      inactiveCount,
    };
  } catch (error) {
    // If the category has no subcategories or there's an error, return empty result
    console.error(`Error fetching subcategories for category ${categoryId}:`, error);
    return {
      subcategories: [],
      total: 0,
      activeCount: 0,
      inactiveCount: 0,
    };
  }
}
