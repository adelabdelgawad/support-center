/**
 * Client-side authentication utilities (Web-Only)
 *
 * The it-app is a Next.js web application for IT agents/supervisors.
 * It runs in browsers only - Tauri desktop app is the separate requester-app.
 *
 * Storage Strategy:
 * - access_token: httpOnly cookie (managed by backend, 30-day expiry)
 * - session_id: httpOnly cookie (managed by backend)
 * - user_data: Regular cookie for client-side access
 * - Device info: For session tracking
 *
 * ============================================================================
 * SECURITY NOTICE (Findings #16, #31, #33, #34 - Auth Architecture)
 * ============================================================================
 *
 * ARCHITECTURAL CHANGE REQUIRED — DO NOT REFACTOR INLINE
 *
 * This file contains known security patterns that require architectural redesign:
 *
 * 1. Token Exposure (Finding #16):
 *    - Access tokens are fetched from server and stored in localStorage
 *    - Tokens are passed to SignalR via accessTokenFactory (visible in query string)
 *
 * 2. LocalStorage Usage (Finding #31):
 *    - setStoredAccessToken() stores tokens in localStorage
 *    - This is XSS-vulnerable; future: use httpOnly cookies exclusively
 *
 * 3. Client-Side Cookie Setting (Finding #33):
 *    - Non-httpOnly cookies set via document.cookie
 *    - Future: all auth cookies should be httpOnly, set by backend
 *
 * 4. Dual Storage Pattern (Finding #34):
 *    - Fallback from cookie to localStorage creates inconsistent state
 *    - Future: single source of truth (httpOnly cookies via backend)
 *
 * These patterns exist for backward compatibility with current SignalR
 * implementation. A coordinated refactor of auth flow is needed to address.
 * ============================================================================
 */
import type { DeviceInfo, UserInfo } from "../types/auth";

/**
 * Get cookie value by name (client-side)
 */
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;

  const cookies = document.cookie.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    if (key && value) {
      acc[key] = decodeURIComponent(value);
    }
    return acc;
  }, {} as Record<string, string>);

  return cookies[name] || null;
}

/**
 * Get user information from cookie
 */
export function getUserInfo(): UserInfo | null {
  const userData = getCookie('user_data');
  if (!userData) return null;

  try {
    return JSON.parse(userData) as UserInfo;
  } catch (error) {
    console.error('Error parsing user data:', error);
    return null;
  }
}

/**
 * Get session ID from cookie
 */
export function getSessionId(): number | null {
  const sessionId = getCookie('session_id');
  return sessionId ? parseInt(sessionId, 10) : null;
}

/**
 * Check if access token exists (in httpOnly cookie)
 * Note: We can't read the token value directly, but we can check if cookies exist
 */
export function hasAccessToken(): boolean {
  // Check if user_data exists as a proxy for authentication
  // The actual access_token is in httpOnly cookie and not accessible
  return !!getCookie('user_data');
}

/**
 * Clear all client-side cached auth data
 * Note: httpOnly cookies (access_token, session_id) can only be cleared by backend
 */
export function clearAllAuthData(): void {
  if (typeof window === 'undefined') return;

  try {
    // Clear sessionStorage
    sessionStorage.clear();

    // Clear localStorage user data
    localStorage.removeItem('user_data');
    localStorage.removeItem('session_id');
    localStorage.removeItem('device_fingerprint');
  } catch (error) {
    console.error('Error clearing auth data:', error);
  }
}

/**
 * Generate or retrieve device fingerprint
 */
export function getDeviceFingerprint(): string {
  if (typeof window === 'undefined') return "";

  try {
    let fingerprint = localStorage.getItem('device_fingerprint');

    if (!fingerprint) {
      // Generate a simple fingerprint based on browser characteristics
      const data = [
        navigator.userAgent,
        navigator.language,
        screen.width,
        screen.height,
        screen.colorDepth,
        new Date().getTimezoneOffset(),
      ].join("|");

      // Simple hash function
      fingerprint = btoa(data).substring(0, 32);
      localStorage.setItem('device_fingerprint', fingerprint);
    }

    return fingerprint;
  } catch (error) {
    console.error('Error generating device fingerprint:', error);
    return "";
  }
}

/**
 * Get device information for authentication
 */
export function getDeviceInfo(): DeviceInfo {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    // Parse user agent for OS and browser info
    const ua = navigator.userAgent;
    let os = "Unknown";
    let browser = "Unknown";

    // Detect OS
    if (ua.includes("Win")) os = "Windows";
    else if (ua.includes("Mac")) os = "macOS";
    else if (ua.includes("Linux")) os = "Linux";
    else if (ua.includes("Android")) os = "Android";
    else if (ua.includes("iOS")) os = "iOS";

    // Detect browser
    if (ua.includes("Chrome") && !ua.includes("Edg")) browser = "Chrome";
    else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
    else if (ua.includes("Firefox")) browser = "Firefox";
    else if (ua.includes("Edg")) browser = "Edge";

    return {
      os,
      browser,
      user_agent: ua,
      device_fingerprint: getDeviceFingerprint(),
    };
  } catch (error) {
    console.error("Error getting device info:", error);
    return {};
  }
}

/**
 * Session information
 */
export interface SessionInfo {
  isAuthenticated: boolean;
  user: UserInfo | null;
  sessionId: number | null;
  accessToken: string | null; // For WebSocket connections (from httpOnly cookie)
}

/**
 * Get access token from httpOnly cookie
 * Note: We can't read the actual token value, but we need to check if it exists
 * For WebSocket, we'll get it from a different source
 */
export function getAccessToken(): string | null {
  // Try to get from cookie (if not httpOnly)
  const token = getCookie('access_token');

  if (token) {
    return token;
  }

  // Try localStorage as fallback (for backward compatibility)
  if (typeof window !== 'undefined') {
    const localToken = localStorage.getItem('access_token');
    if (localToken) {
      return localToken;
    }
  }

  return null;
}

/**
 * Get current session information
 * Checks cookies for authentication status
 */
export function getSession(): SessionInfo {
  if (typeof window === "undefined") {
    return {
      isAuthenticated: false,
      user: null,
      sessionId: null,
      accessToken: null,
    };
  }

  const user = getUserInfo();
  const sessionId = getSessionId();
  const accessToken = getAccessToken();

  // User is authenticated if user_data cookie exists
  const isAuthenticated = !!user;

  return {
    isAuthenticated,
    user,
    sessionId,
    accessToken,
  };
}

/**
 * Check if user is authenticated (simple boolean check)
 */
export function isAuthenticated(): boolean {
  return getSession().isAuthenticated;
}

// Legacy function exports for backward compatibility
// These now use cookies instead of sessionStorage
export function getStoredAccessToken(): string | null {
  // Can't access httpOnly cookie from client
  // Return null and let fetch use credentials: 'include' instead
  return null;
}

export function setStoredAccessToken(accessToken: string, _expiresIn: number): void {
  // Store token in localStorage for WebSocket authentication
  // Note: httpOnly cookie is also set by backend for API requests
  if (typeof window !== 'undefined') {
    localStorage.setItem('access_token', accessToken);
  }
}

export function clearStoredAccessToken(): void {
  // No-op: httpOnly cookies cleared by backend on logout
  // This function kept for backward compatibility only
}

export function isAccessTokenExpired(): boolean {
  // If user data exists, consider session valid
  // Backend handles token expiry
  return !hasAccessToken();
}

export function setUserInfo(user: UserInfo): void {
  // User data is stored in cookie by backend
  // This is a no-op for backward compatibility
  console.warn('setUserInfo is deprecated - user data stored in cookies by backend');
}

export function clearUserInfo(): void {
  // Clear only client-side cached data
  clearAllAuthData();
}

export function setSessionId(_sessionId: number): void {
  // Session ID is stored in httpOnly cookie by backend
  // This is a no-op for backward compatibility
  console.warn('setSessionId is deprecated - session ID stored in httpOnly cookie');
}

// ============================================================================
// UNIFIED AUTH FUNCTIONS (Web-Only)
// ============================================================================

/**
 * Unified session info (web-only)
 */
export interface UnifiedSessionInfo {
  isAuthenticated: boolean;
  user: UserInfo | null;
  sessionId: number | null;
  accessToken: string | null;
  platform: 'web';
}

/**
 * Get session info (web-only)
 */
export function getUnifiedSession(): UnifiedSessionInfo {
  const webSession = getSession();

  return {
    ...webSession,
    platform: 'web',
  };
}

/**
 * Get session info asynchronously (web-only)
 */
export async function getUnifiedSessionAsync(): Promise<UnifiedSessionInfo> {
  return {
    ...getSession(),
    platform: 'web',
  };
}

/**
 * Check authentication status (web-only)
 */
export async function isUnifiedAuthenticated(): Promise<boolean> {
  return isAuthenticated();
}

/**
 * Fetch access token from server API
 * Used as fallback when localStorage is empty (e.g., on mobile after browser clears storage)
 */
async function fetchAccessTokenFromServer(): Promise<string | null> {
  try {
    const response = await fetch('/api/auth/signalr-token', {
      method: 'GET',
      credentials: 'include', // Include httpOnly cookies
    });

    if (!response.ok) {
      console.warn('[AuthStorage] Failed to fetch signalr-token:', response.status);
      return null;
    }

    const data = await response.json();
    const token = data.access_token;

    if (token) {
      // Store in localStorage for future use
      try {
        localStorage.setItem('access_token', token);
        console.log('[AuthStorage] Token restored from server to localStorage');
      } catch {
        // localStorage might be disabled
      }
      return token;
    }

    return null;
  } catch (error) {
    console.error('[AuthStorage] Error fetching signalr-token:', error);
    return null;
  }
}

/**
 * Get access token (web-only)
 * Falls back to fetching from server if localStorage is empty (mobile browser fix)
 */
export async function getUnifiedAccessToken(): Promise<string | null> {
  // Try local sources first (fast path)
  const localToken = getAccessToken();
  if (localToken) {
    return localToken;
  }

  // Fallback: Fetch from server API (handles mobile browsers where localStorage is cleared)
  console.log('[AuthStorage] No local token found, fetching from server...');
  return fetchAccessTokenFromServer();
}

/**
 * Clear all auth data (web-only)
 */
export async function clearUnifiedAuthData(): Promise<void> {
  clearAllAuthData();
}

/**
 * Store auth response after login/SSO (web-only)
 * For Web, this is a no-op as backend sets httpOnly cookies
 */
export async function storeUnifiedAuthResponse(response: {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  user: UserInfo & { isTechnician?: boolean; role?: string };
  sessionId: number;
}): Promise<void> {
  // For Web, store token in localStorage for WebSocket
  setStoredAccessToken(response.accessToken, response.expiresIn);
}

/**
 * Get device info for authentication (web-only)
 */
export async function getUnifiedDeviceInfo(): Promise<DeviceInfo & { hostname?: string }> {
  return getDeviceInfo();
}
