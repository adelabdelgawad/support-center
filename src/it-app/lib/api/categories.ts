'use client';

/**
 * Client-side API for categories
 * All calls go through Next.js API routes (/api/setting/categories/*)
 * which then proxy to the backend.
 */

import { apiClient, getClientErrorMessage as getErrorMessage } from '../fetch/client';
import type {
  CategoryResponse,
  CategoryCreateRequest,
  CategoryUpdateRequest,
  SettingCategoriesResponse,
} from "@/types/categories";

const API_BASE = "/api/setting/categories";

/**
 * Fetches all categories
 */
export async function getCategories(params?: {
  activeOnly?: boolean;
}): Promise<CategoryResponse[]> {
  try {
    const queryParams = new URLSearchParams();
    if (params?.activeOnly !== undefined) {
      queryParams.append("active_only", String(params.activeOnly));
    }

    return await apiClient.get<CategoryResponse[]>(`${API_BASE}?${queryParams}`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Creates a new category
 */
export async function createCategory(
  categoryData: CategoryCreateRequest
): Promise<CategoryResponse> {
  try {
    return await apiClient.post<CategoryResponse>(API_BASE, categoryData);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Updates an existing category
 */
export async function updateCategory(
  categoryId: number,
  categoryData: CategoryUpdateRequest
): Promise<CategoryResponse> {
  try {
    return await apiClient.put<CategoryResponse>(
      `${API_BASE}/${categoryId}`,
      categoryData
    );
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Toggles category status (active/inactive)
 */
export async function toggleCategoryStatus(
  categoryId: number,
  newStatus: boolean
): Promise<CategoryResponse> {
  try {
    return await apiClient.put<CategoryResponse>(
      `${API_BASE}/${categoryId}/status?is_active=${newStatus}`
    );
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Fetches category count statistics
 */
export async function getCategoryCounts(): Promise<{
  total: number;
  activeCount: number;
  inactiveCount: number;
}> {
  try {
    const categories = await getCategories({ activeOnly: false });
    const activeCount = categories.filter((c) => c.isActive).length;
    const inactiveCount = categories.filter((c) => !c.isActive).length;

    return {
      total: categories.length,
      activeCount,
      inactiveCount,
    };
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}
