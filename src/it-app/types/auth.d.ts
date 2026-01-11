// Authentication-related type definitions
// Based on backend schemas: schemas/auth/*, schemas/user/*

/**
 * Application user type for authenticated sessions
 * Based on backend UserRead/UserListItem schemas
 *
 * NOTE: User IDs are now UUID strings (consolidated from separate uuid column)
 */
export interface AppUser {
  id: string;  // UUID primary key (changed from number to string)
  username: string;
  email: string;
  fullName?: string | null;
  title?: string | null;
  phoneNumber?: string | null;
  isTechnician: boolean;
  isActive: boolean;
  isOnline: boolean;
  isSuperAdmin: boolean;
  isDomain: boolean;
  isBlocked: boolean;
  blockMessage?: string | null;
  managerId?: string | null;  // Also UUID string (changed from number to string)
  createdAt?: string;
  updatedAt?: string;
  lastSeen?: string | null;
}

/**
 * Backend login response from API
 * Based on backend LoginResponse schema
 */
export interface BackendLoginResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  sessionId: number;
  user: AppUser;
}

/**
 * Token payload (JWT decoded)
 * Based on backend TokenPayload schema
 */
export interface TokenPayload {
  sub: string;  // User ID (now UUID string, changed from number)
  username: string;
  role: string;
  sessionId: string;  // Also changed to string for consistency with UUID
  deviceId?: string;
  type: string;
  iat: number;
  exp: number;
  jti: string; // UUID as string
}

/**
 * Login request payload
 */
export interface LoginRequest {
  username: string;
  password?: string;
  deviceFingerprint?: string;
}

/**
 * API error response structure
 */
export interface APIError {
  detail?: string;
  error?: string;
  message?: string;
}

/**
 * Session information
 */
export interface SessionInfo {
  isAuthenticated: boolean;
  user: AppUser | null;
  sessionId: string | null;
  accessToken: string | null;
}
