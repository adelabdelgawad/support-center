"use server";

import { serverGet, serverPost, serverPut } from "@/lib/fetch";
import type {
  CategoryResponse,
  CategoryCreateRequest,
  CategoryUpdateRequest,
  SettingCategoriesResponse,
  SubcategoriesResponse,
  SubcategoryResponse,
  CategoryWithSubcategoriesResponse,
} from "@/types/categories";

/**
 * Fetches subcategories for a specific category
 */
export async function getCategorySubcategories(
  categoryId: number
): Promise<SubcategoryResponse[]> {
  return serverGet<SubcategoryResponse[]>(
    `/categories/subcategories?category_id=${categoryId}&active_only=false`,
    { revalidate: 0 }
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

  // Fetch categories with subcategories in a single request if needed
  const includeSubcategories = params?.includeSubcategories ?? false;

  const categories = await serverGet<CategoryWithSubcategoriesResponse[]>(
    `/categories/categories?active_only=${activeOnly}&include_subcategories=${includeSubcategories}`,
    { revalidate: 0 }
  );

  // Calculate counts - fix inverted ternary
  // When activeOnly=false, categories already has all categories (active_only=false in the fetch)
  // When activeOnly=true, we need to fetch again with active_only=false to get counts
  const allCategories = activeOnly
    ? await serverGet<CategoryWithSubcategoriesResponse[]>(
        `/categories/categories?active_only=false&include_subcategories=${includeSubcategories}`,
        { revalidate: 0 }
      )
    : categories;

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

  // Build subcategoriesMap from response instead of N fetches
  let subcategoriesMap: Record<number, SubcategoryResponse[]> | undefined;
  if (includeSubcategories) {
    subcategoriesMap = {};
    for (const category of filteredCategories) {
      subcategoriesMap[category.id] = category.subcategories ?? [];
    }
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
  return serverPost<CategoryResponse>("/categories/categories", categoryData);
}

/**
 * Update existing category
 */
export async function updateCategory(
  categoryId: number,
  categoryData: CategoryUpdateRequest
): Promise<CategoryResponse> {
  return serverPut<CategoryResponse>(`/categories/categories/${categoryId}`, categoryData);
}

/**
 * Toggle category status (active/inactive)
 */
export async function toggleCategoryStatus(
  categoryId: number,
  newStatus: boolean
): Promise<CategoryResponse> {
  return serverPut<CategoryResponse>(`/categories/categories/${categoryId}`, { is_active: newStatus });
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
    const subcategories = await serverGet<SubcategoryResponse[]>(
      `/categories/subcategories?category_id=${categoryId}`,
      { revalidate: 0 }
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
