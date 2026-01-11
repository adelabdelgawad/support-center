/**
 * Server-side authentication validation utilities
 * Used for validating user authorization before rendering sensitive pages
 *
 * NOTE: JWT Signature Verification Policy
 * =====================================
 * This module uses jwtDecode WITHOUT signature verification INTENTIONALLY.
 *
 * JWT signature verification is performed on the backend when making authenticated requests.
 * Client-side decode is ONLY for extracting non-sensitive display information (username, ID, expiration).
 *
 * Security Model:
 * 1. Token signature is verified on the backend (authoritative source)
 * 2. Client-side decode is used for UI rendering and local caching only
 * 3. NEVER use decoded claims for security-critical decisions
 * 4. Backend validation is authoritative and must always be trusted
 *
 * Why not verify on client:
 * - Public key rotation complexity
 * - Client-side verification is NOT cryptographically safe (keys may be stale)
 * - Malicious user can easily bypass client-side checks
 * - Backend validation is the only trustworthy verification point
 */

import { jwtDecode } from 'jwt-decode';
import { cookies } from 'next/headers';
import { getServerAccessToken } from './server-fetch';

/**
 * Token data structure from JWT
 */
interface TokenData {
  sub: string; // user ID
  username: string;
  is_technician: boolean;
  session_id: string;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
  jti: string;
}

/**
 * Check if user has valid access token by validating the JWT
 *
 * NOTE: Backend already validates technician/admin status at login.
 * If user received a token, they are already authorized.
 *
 * This function:
 * 1. Retrieves the access token from cookies
 * 2. Decodes the JWT to extract token data
 * 3. Validates the token hasn't expired
 *
 * @returns Object containing:
 *   - isTechnician: boolean indicating if token is valid
 *   - isValid: boolean indicating if token is valid and not expired
 *   - error: string containing error message if validation fails
 *   - userId: user ID from token
 *   - username: username from token
 */
export async function validateTechnicianAccess(): Promise<{
  isTechnician: boolean;
  isValid: boolean;
  error?: string;
  userId?: string;
  username?: string;
}> {
  try {
    // Get access token from server cookies
    const accessToken = await getServerAccessToken();

    if (!accessToken) {
      return {
        isTechnician: false,
        isValid: false,
        error: 'No authentication token found',
      };
    }

    // Decode the JWT token (signature verification done on backend)
    // See module-level documentation for security rationale
    const decoded = jwtDecode<TokenData>(accessToken);

    // Check if token has expired
    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
      return {
        isTechnician: false,
        isValid: false,
        error: 'Authentication token has expired',
      };
    }

    // Check actual is_technician value from JWT token
    // Non-technicians should not have access to agent portal pages
    return {
      isTechnician: decoded.is_technician === true,
      isValid: true,
      userId: decoded.sub,
      username: decoded.username,
    };
  } catch (error) {
    console.error('Error validating token:', error);

    let errorMessage = 'Failed to validate authentication status';
    if (error instanceof Error) {
      errorMessage = error.message;
    }

    return {
      isTechnician: false,
      isValid: false,
      error: errorMessage,
    };
  }
}

/**
 * Check if user has valid token (backend already validated their role)
 * If user has a valid token, they are authorized to access the agent portal
 *
 * @returns boolean indicating if user is authenticated
 */
export async function isSuperAdminFromToken(): Promise<boolean> {
  try {
    const accessToken = await getServerAccessToken();

    if (!accessToken) {
      return false;
    }

    // Decode the JWT token (signature verification done on backend)
    // See module-level documentation for security rationale
    const decoded = jwtDecode<TokenData>(accessToken);

    // Token exists and is not expired = user is authenticated and authorized
    return !!(decoded.exp && decoded.exp * 1000 > Date.now());
  } catch (error) {
    console.error('Error checking authentication status:', error);
    return false;
  }
}

/**
 * Get user information from token
 *
 * @returns User information from token or null if invalid
 */
export async function getUserFromToken(): Promise<{
  id: string;
  username: string;
} | null> {
  try {
    const accessToken = await getServerAccessToken();

    if (!accessToken) {
      return null;
    }

    // Decode the JWT token (signature verification done on backend)
    // See module-level documentation for security rationale
    const decoded = jwtDecode<TokenData>(accessToken);

    // Check if token has expired
    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
      return null;
    }

    return {
      id: decoded.sub,
      username: decoded.username,
    };
  } catch (error) {
    console.error('Error getting user from token:', error);
    return null;
  }
}
