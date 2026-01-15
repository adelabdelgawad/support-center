/**
 * Category types for the settings/categories page
 * Matches backend schemas with camelCase for frontend
 */

/**
 * Category response from the backend
 */
export interface CategoryResponse {
  id: number;
  name: string;
  nameEn: string;
  nameAr: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Request payload for creating a new category
 */
export interface CategoryCreateRequest {
  name: string;
  nameEn: string;
  nameAr: string;
  description?: string | null;
  isActive?: boolean;
}

/**
 * Request payload for updating a category
 */
export interface CategoryUpdateRequest {
  name?: string | null;
  nameEn?: string | null;
  nameAr?: string | null;
  description?: string | null;
  isActive?: boolean | null;
}

/**
 * Response from the settings categories list endpoint
 */
export interface SettingCategoriesResponse {
  categories: CategoryResponse[];
  total: number;
  activeCount: number;
  inactiveCount: number;
}

/**
 * Subcategory response from the backend
 */
export interface SubcategoryResponse {
  id: number;
  categoryId: number;
  name: string;
  nameEn: string;
  nameAr: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Request payload for creating a new subcategory
 */
export interface SubcategoryCreateRequest {
  categoryId: number;
  name: string;
  nameEn: string;
  nameAr: string;
  description?: string | null;
  isActive?: boolean;
}

/**
 * Request payload for updating a subcategory
 */
export interface SubcategoryUpdateRequest {
  categoryId?: number | null;
  name?: string | null;
  nameEn?: string | null;
  nameAr?: string | null;
  description?: string | null;
  isActive?: boolean | null;
}

/**
 * Category with its subcategories
 */
export interface CategoryWithSubcategoriesResponse extends CategoryResponse {
  subcategories?: SubcategoryResponse[];
}

/**
 * Response from the subcategories list endpoint
 */
export interface SubcategoriesResponse {
  subcategories: SubcategoryResponse[];
  total: number;
  activeCount: number;
  inactiveCount: number;
}
