/**
 * Request schema for creating a new role
 * Maps to backend RoleCreate schema
 */
export interface RoleCreateRequest {
  name: string;
  description?: string | null;
  isActive?: boolean;
}

/**
 * Request schema for updating a role
 * Maps to backend RoleUpdate schema
 */
export interface RoleUpdateRequest {
  name?: string | null;
  description?: string | null;
  isActive?: boolean | null;
}

/**
 * Role response from backend
 * Maps to backend RoleWithPagesAndUsers schema (camelCase via HTTPSchemaModel)
 */
export interface RoleResponse {
  id: string; // UUID
  name: string;
  description?: string | null;
  isActive: boolean;
  pagePaths: string[];
  totalUsers: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: number | null;
  updatedBy?: number | null;
}

/**
 * Response for listing roles with statistics
 * Maps to backend RoleListResponse schema
 */
export interface SettingRolesResponse {
  roles: RoleResponse[];
  total: number;
  activeCount: number;
  inactiveCount: number;
}

export interface RolesListResponse {
  roles: RoleResponse[];
  total: number;
}

/**
 * Request for updating role's page assignments
 * Maps to backend RolePagesUpdateRequest schema
 */
export interface RolePagesUpdateRequest {
  originalPageIds: number[];
  updatedPageIds: number[];
}

/**
 * Request for updating role's user assignments
 * Maps to backend RoleUsersUpdateRequest schema
 */
export interface RoleUsersUpdateRequest {
  originalUserIds: number[];
  updatedUserIds: number[];
}

/**
 * Page in role pages response
 * Maps to backend PageRead schema
 */
export interface PageRoleResponse {
  id: number;
  path: string | null;
  title: string;
  description?: string | null;
  icon?: string | null;
  parentId?: number | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: number | null;
  updatedBy?: number | null;
}

/**
 * Response for role pages
 * Maps to backend RolePagesResponse schema
 */
export interface RolePagesResponse {
  roleId: string; // UUID
  roleName: string;
  pages: PageRoleResponse[];
  totalPages: number;
}
