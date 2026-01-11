// Import RoleResponse from central roles types
export type { RoleResponse } from './roles';

/**
 * Role info embedded in user responses
 * Maps to backend UserRoleInfo schema
 */
export interface UserRoleInfo {
  id: string;  // UUID string
  name: string;
}

/**
 * Business unit info embedded in user responses
 * Maps to backend UserBusinessUnitInfo schema
 */
export interface UserBusinessUnitInfo {
  id: number;
  name: string;
  isActive: boolean;
}

/**
 * User with roles response from backend
 * Maps to backend UserWithRolesListItem schema (camelCase via HTTPSchemaModel)
 */
export interface UserWithRolesResponse {
  id: string;  // Changed from number to string UUID
  username: string;
  fullName?: string | null;
  title?: string | null;
  email?: string | null;
  isActive: boolean;
  isTechnician: boolean;
  isOnline: boolean;
  isSuperAdmin: boolean;
  isDomain: boolean;
  isBlocked: boolean;
  blockMessage?: string | null;
  managerId?: string | null;  // Changed from number to string UUID
  roles: UserRoleInfo[];
  roleIds: string[]; // UUID[]
  businessUnits: UserBusinessUnitInfo[];
}

/**
 * Response for listing users with statistics
 * Maps to backend UserListResponse schema
 *
 * Count types:
 * 1. Global User Type counts (always reflect database totals):
 *    - globalTotal: Total users in database
 *    - technicianCount: Total technicians in database
 *    - userCount: Total non-technicians in database
 *
 * 2. Scoped Status counts (filtered by selected User Type):
 *    - activeCount: Active users within selected User Type
 *    - inactiveCount: Inactive users within selected User Type
 *    - total: Total users matching current filters (for pagination)
 *
 * 3. Scoped Role counts (filtered by User Type AND Status):
 *    - roleCounts: Dict mapping roleId to user count within current filters
 */
export interface SettingUsersResponse {
  users: UserWithRolesResponse[];
  // Filtered total (for pagination)
  total: number;
  // Scoped Status counts (within selected User Type)
  activeCount: number;
  inactiveCount: number;
  // Global User Type counts (always database totals)
  globalTotal: number;
  technicianCount: number;
  userCount: number;
  // Scoped Role counts (within selected User Type AND Status)
  // Maps role_id (string UUID) to user count
  roleCounts: Record<string, number>;
}

/**
 * Request for creating a new user with roles
 * Maps to backend UserCreateWithRoles schema
 */
export interface UserCreate {
  username: string;
  fullName?: string | null;
  title?: string | null;
  email?: string | null;
  isTechnician?: boolean; // Defaults to true on backend
  roleIds: string[]; // UUID[]
}

/**
 * User list item response from API.
 * Maps to backend UserListItem schema (camelCase via HTTPSchemaModel)
 *
 * Note: For actual domain users from Active Directory, use the DomainUser
 * interface from lib/api/domain-users.ts
 */
export interface AuthUserResponse {
  id: string;  // Changed from number to string UUID
  username: string;
  fullName?: string | null;
  title?: string | null;
  email?: string | null;
  isTechnician: boolean;
  isOnline: boolean;
  isActive: boolean;
  isSuperAdmin: boolean;
  isDomain: boolean;
  isBlocked?: boolean;
}

/**
 * Request for updating user's role assignments
 * Maps to backend UserRolesUpdate schema
 */
export interface UserUpdateRolesRequest {
  userId: string;  // Changed from number to string UUID
  originalRoleIds: string[]; // UUID[]
  updatedRoleIds: string[]; // UUID[]
}
