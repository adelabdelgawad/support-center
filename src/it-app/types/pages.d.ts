// Page and navigation-related type definitions
// Based on backend schemas: schemas/page/*
// NOTE: Backend removed ar_title/en_title - now uses single 'title' field

/**
 * Page entity representing a navigable page in the application
 * Based on backend PageRead schema
 * Note: Backend sends camelCase via HTTPSchemaModel
 */
interface Page {
  id: number;
  title: string;
  createdAt?: string;
  updatedAt?: string;
  isActive?: boolean;
  path: string | null;
  description?: string;
  icon: string | null;
  parentId?: number | null;
  createdBy?: number;
  updatedBy?: number;
  isDeleted?: boolean;
  // Legacy snake_case support
  created_at?: string;
  updated_at?: string;
  is_active?: boolean;
  parent_id?: number | null;
  created_by?: number;
  updated_by?: number;
  is_deleted?: boolean;
}

/**
 * Page response from API
 * Based on backend PageRead and PageWithRolesName schemas
 */
export interface PageResponse {
  id: number;
  _id?: number; // Alias for id (for compatibility)
  path?: string | null;
  title: string;
  // Legacy bilingual fields - DEPRECATED but still used in some components
  enTitle?: string | null;
  arTitle?: string | null;
  description?: string | null;
  enDescription?: string | null;
  arDescription?: string | null;
  icon?: string | null;
  parentId?: number | null;
  _isActive: boolean;
  isActive?: boolean; // Alias
  roleNames?: string[];
  totalRoles?: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Navigation item structure for UI
 */
export interface NavItem {
  _id: string;
  title: string;
  path: string | null;
  icon: string | null;
  children: NavItem[];
  isParent: boolean;
  isActive?: boolean;
  isOpen?: boolean;
}

/**
 * Page-Role permission
 * Based on backend PageRoleRead schema
 */
export interface PageRoleResponse {
  id: number;
  roleId: number;
  pageId: number;
  isActive: boolean;
  roleName?: string | null;
  pageTitle?: string | null;
  createdAt: string;
  updatedAt: string;
}
