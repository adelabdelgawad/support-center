'use client';

/**
 * Client-side API for subcategories
 * All calls go through Next.js API routes (/api/setting/categories/subcategories/*)
 * which then proxy to the backend.
 */

import { apiClient, getClientErrorMessage as getErrorMessage } from '../fetch/client';
import type {
  SubcategoryResponse,
  SubcategoryCreateRequest,
  SubcategoryUpdateRequest,
  SubcategoriesResponse,
} from "@/types/categories";

const API_BASE = "/api/setting/categories/subcategories";

/**
 * Fetches all subcategories for a specific category
 */
export async function getSubcategories(
  categoryId: number,
  params?: {
    activeOnly?: boolean;
  }
): Promise<SubcategoryResponse[]> {
  try {
    const queryParams = new URLSearchParams();
    queryParams.append("category_id", String(categoryId));
    if (params?.activeOnly !== undefined) {
      queryParams.append("active_only", String(params.activeOnly));
    }

    return await apiClient.get<SubcategoryResponse[]>(`${API_BASE}?${queryParams}`);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Creates a new subcategory
 */
export async function createSubcategory(
  subcategoryData: SubcategoryCreateRequest
): Promise<SubcategoryResponse> {
  try {
    return await apiClient.post<SubcategoryResponse>(API_BASE, subcategoryData);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Updates an existing subcategory
 */
export async function updateSubcategory(
  subcategoryId: number,
  subcategoryData: SubcategoryUpdateRequest
): Promise<SubcategoryResponse> {
  try {
    return await apiClient.put<SubcategoryResponse>(
      `${API_BASE}/${subcategoryId}`,
      subcategoryData
    );
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Toggles subcategory status (active/inactive)
 */
export async function toggleSubcategoryStatus(
  subcategoryId: number,
  newStatus: boolean
): Promise<SubcategoryResponse> {
  try {
    return await apiClient.put<SubcategoryResponse>(
      `${API_BASE}/${subcategoryId}/status?is_active=${newStatus}`
    );
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Fetches subcategory count statistics for a specific category
 */
export async function getSubcategoryCounts(categoryId: number): Promise<{
  total: number;
  activeCount: number;
  inactiveCount: number;
}> {
  try {
    const subcategories = await getSubcategories(categoryId, { activeOnly: false });
    const activeCount = subcategories.filter((s) => s.isActive).length;
    const inactiveCount = subcategories.filter((s) => !s.isActive).length;

    return {
      total: subcategories.length,
      activeCount,
      inactiveCount,
    };
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}
