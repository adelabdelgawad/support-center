// lib/auth/auth-service.ts - Simplified Authentication Service (Aligned with Backend)
"use client";

import { generateDeviceFingerprint } from "@/lib/device-fingerprint";
import { AppUser, BackendLoginResponse } from "@/types/auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * AUTHENTICATION SYSTEM:
 * - Uses long-lived access tokens (30 days expiry)
 * - NO refresh tokens (backend removed refresh mechanism)
 * - Tokens stored in cookies for security
 * - User data stored separately for UI access
 */

/**
 * Get cookie value by name
 */
function getCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const cookies = document.cookie.split(";").reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split("=");
    if (key && value) {
      acc[key] = value;
    }
    return acc;
  }, {} as Record<string, string>);

  return cookies[name] || null;
}

/**
 * Set cookie with options
 */
function setCookie(name: string, value: string, maxAge: number) {
  if (typeof document === "undefined") {
    return;
  }

  const isProduction = process.env.NODE_ENV === "production";
  document.cookie = `${name}=${value}; path=/; max-age=${maxAge}; SameSite=Strict${
    isProduction ? "; Secure" : ""
  }`;
}

/**
 * Delete cookie
 */
function deleteCookie(name: string) {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${name}=; path=/; max-age=0`;
}

export class AuthService {
  /**
   * Login with username and password (Active Directory authentication)
   * Backend returns long-lived access token (30 days)
   */
  static async login(
    username: string,
    password: string
  ): Promise<{ success: boolean; error?: string; user?: AppUser }> {
    try {
      const deviceFingerprint = await generateDeviceFingerprint();

      // Call backend AD login endpoint
      const response = await fetch(`${API_URL}/api/v1/auth/ad-login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          password,
          device_info: {
            device_fingerprint: deviceFingerprint,
          },
        }),
        credentials: "include",
      });

      if (!response.ok) {
        // Show user-friendly error messages instead of technical details
        if (response.status === 401 || response.status === 403) {
          return { success: false, error: "Invalid username or password" };
        } else if (response.status >= 500) {
          return {
            success: false,
            error: "Internal server error. Please try again later",
          };
        } else {
          return {
            success: false,
            error: "Authentication failed. Please try again",
          };
        }
      }

      const data: BackendLoginResponse = await response.json();

      // Store access token and user data in cookies
      // Token expires in 30 days (expiresIn is in seconds)
      const expiresInSeconds = data.expiresIn;
      const expiresAt = Date.now() + expiresInSeconds * 1000;

      // Store access token
      setCookie("access_token", data.accessToken, expiresInSeconds);

      // Store session ID
      setCookie("session_id", data.sessionId.toString(), expiresInSeconds);

      // Store expiration time
      setCookie("access_token_expires", expiresAt.toString(), expiresInSeconds);

      // Store user data
      setCookie("user_data", JSON.stringify(data.user), expiresInSeconds);

      return { success: true, user: data.user };
    } catch (_error) {
      console.error("Login error:", _error);
      return { success: false, error: "Network error. Please try again." };
    }
  }

  /**
   * Logout - clear all auth data and terminate session
   */
  static async logout(): Promise<void> {
    if (typeof window === "undefined") {
      return;
    }

    try {
      // Call Next.js API route to logout (which calls backend)
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
        });
      } catch (_error) {
        // Continue with client-side cleanup even if backend logout fails
        console.error("Backend logout failed:", _error);
      }

      // Clear all auth cookies
      const cookiesToClear = [
        "access_token",
        "session_id",
        "access_token_expires",
        "user_data",
      ];

      cookiesToClear.forEach((cookie) => {
        deleteCookie(cookie);
      });

      // Clear localStorage (legacy cleanup)
      try {
        localStorage.removeItem("access_token");
        localStorage.removeItem("session_id");
        localStorage.removeItem("access_token_expires");
        localStorage.removeItem("user_data");
      } catch (_error) {
        // Ignore localStorage errors
      }

      // Clear sessionStorage
      try {
        sessionStorage.clear();
      } catch (_error) {
        // Ignore sessionStorage errors
      }
    } catch (_error) {
      console.error("Logout error:", _error);
    } finally {
      // Force full page reload to clear all state
      window.location.href = "/login";
    }
  }

  /**
   * Get current access token from cookies
   */
  static getAccessToken(): string | null {
    return getCookie("access_token");
  }

  /**
   * Get current user data from cookies
   */
  static getUserData(): AppUser | null {
    const userData = getCookie("user_data");
    if (!userData) {
      return null;
    }

    try {
      return JSON.parse(userData);
    } catch {
      return null;
    }
  }

  /**
   * Get session ID
   */
  static getSessionId(): number | null {
    const sessionId = getCookie("session_id");
    return sessionId ? parseInt(sessionId, 10) : null;
  }

  /**
   * Check if user is authenticated
   * Token has 30 days expiry - check with 5 minute buffer
   */
  static isAuthenticated(): boolean {
    const accessToken = this.getAccessToken();
    const expiresAtStr = getCookie("access_token_expires");

    if (!accessToken || !expiresAtStr) {
      return false;
    }

    const expiresAt = parseInt(expiresAtStr, 10);
    const now = Date.now();
    const bufferTime = 5 * 60 * 1000; // 5 minutes buffer

    return expiresAt > now + bufferTime;
  }

  /**
   * Check if token is expired
   */
  static isTokenExpired(): boolean {
    return !this.isAuthenticated();
  }
}
