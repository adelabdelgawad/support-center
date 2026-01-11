/**
 * Authentication types matching backend schemas
 * Backend schemas: backend/schemas/auth/
 *
 * IMPORTANT: Backend no longer uses UserRole enum
 * - Replaced with is_technician boolean field
 */

// ===== Login Schemas =====

export interface LoginRequest {
  username: string;
  device_info?: DeviceInfo;
  ip_address?: string;
}

export interface ADLoginRequest {
  username: string;
  password: string;
  device_info?: DeviceInfo;
  ip_address?: string;
}

export interface SSOLoginRequest {
  username: string;
  device_info?: DeviceInfo;
  ip_address?: string;
}

// Backend returns camelCase (from HTTPSchemaModel)
export interface TokenResponse {
  accessToken: string;
  tokenType: string; // "bearer"
  expiresIn: number; // seconds
}

export interface LoginResponse extends TokenResponse {
  sessionId: string;  // Changed from number to string (UUID)
  redirectTo: string; // Backend-determined redirect path (e.g., /ticket, /support-center/requests)
  user: UserInfo;
  refreshToken?: string; // Only present for technician users
}

// Legacy snake_case types (for internal use where we convert back)
export interface TokenResponseSnakeCase {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface LoginResponseSnakeCase extends TokenResponseSnakeCase {
  session_id: number;
  redirect_to: string; // Backend-determined redirect path (e.g., /ticket, /support-center/requests)
  user: UserInfo;
  refresh_token?: string; // Only present for technician users
}

// RefreshRequest and RefreshResponse removed - sessions are now permanent with long-lived access tokens (30 days)

export interface LogoutResponse {
  message: string;
  session_id?: number;
}

// ===== Token Schemas =====

export interface TokenData {
  sub: string;  // user ID (changed from number to string UUID)
  username: string;
  is_technician: boolean; // replaces role
  session_id?: string;  // Changed from number to string UUID
  device_id?: string;
  type: "access" | "refresh";
  iat: number; // issued at timestamp
  exp: number; // expiration timestamp
  jti: string; // JWT ID (UUID)
}

export interface TokenPayload {
  sub: string;  // user ID (changed from number to string UUID)
  username: string;
  is_technician: boolean; // replaces role
  session_id: string;  // Changed from number to string UUID
  device_id?: string;
  type: string;
  iat: number;
  exp: number;
  jti: string;
}

// TokenPair interface removed - only access tokens used now (30-day expiry)

export interface TokenValidationResponse {
  valid: boolean;
  user_id?: string;  // Changed from number to string UUID
  username?: string;
  session_id?: string;  // Changed from number to string UUID
  expires_at?: string; // ISO datetime string
}

// ===== Device & Session =====

export interface DeviceInfo {
  computer_name?: string;
  os?: string;
  browser?: string;
  user_agent?: string;
  device_fingerprint?: string;
}

export interface SessionInfo {
  session_id: string;  // Changed from number to string UUID
  session_type_id: number;
  ip_address: string;
  authenticated_at?: string; // ISO datetime string
  last_auth_refresh?: string; // ISO datetime string
  is_active: boolean;
  device_fingerprint?: string;
}

// ===== User Info =====

export interface UserInfo {
  id: string;  // Changed from number to string UUID
  username: string;
  email: string;
  fullName?: string;
  isActive: boolean;
  isTechnician?: boolean; // Whether user is a technician (from backend UserLoginInfo)
  isSuperAdmin?: boolean;
  isDomain?: boolean;
  isBlocked?: boolean;
  blockMessage?: string;
  phoneNumber?: string;
  managerId?: string;  // Changed from number to string UUID
  isOnline?: boolean;
  createdAat?: string; // ISO datetime string
  updatedAt?: string; // ISO datetime string
  lastSeen?: string; // ISO datetime string
}

export interface UserListItem {
  id: string;  // Changed from number to string UUID
  username: string;
  full_name?: string;
  is_online?: boolean;
  is_active: boolean;
  is_technician?: boolean;
  is_super_admin?: boolean;
  is_domain?: boolean;
  is_blocked?: boolean;
  block_message?: string;
  manager_id?: string;  // Changed from number to string UUID
}

// ===== Error Responses =====

export interface AuthError {
  error: string;
  detail: string;
  code?: number;
}

export interface APIError {
  detail: string;
  status_code?: number;
  error?: string;
}

// ===== Client-Side Auth State =====

export interface AuthState {
  user: UserInfo | null;
  session: SessionInfo | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface AuthTokens {
  accessToken: string;
  expiresIn: number;  // 30 days (2592000 seconds)
}
