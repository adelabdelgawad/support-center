/**
 * Client-side auth API actions (Web-Only)
 * These call Next.js API routes (NOT backend directly)
 *
 * The it-app is a Next.js web application for IT agents/supervisors.
 * It uses standard username/password login - SSO is only in the requester-app.
 */

import type {
  ADLoginRequest,
  LoginResponseSnakeCase,
} from "@/lib/types/auth";
import { getDeviceInfo } from "@/lib/utils/auth-storage";

export interface AuthResult {
  success: boolean;
  data?: LoginResponseSnakeCase;
  error?: string;
}

/**
 * Perform AD (username/password) login via Next.js API route
 */
export async function adLogin(
  username: string,
  password: string
): Promise<AuthResult> {
  const deviceInfo = getDeviceInfo();

  const loginData: ADLoginRequest = {
    username,
    password,
    device_info: deviceInfo,
  };

  const response = await fetch("/api/auth/ad-login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(loginData),
  });

  if (!response.ok) {
    // Return user-friendly error messages
    if (response.status === 401 || response.status === 403) {
      return { success: false, error: "Invalid username or password" };
    } else if (response.status >= 500) {
      return { success: false, error: "Server error. Please try again later" };
    } else {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.detail || "Authentication failed. Please try again",
      };
    }
  }

  const data: LoginResponseSnakeCase = await response.json();
  return { success: true, data };
}

/**
 * Logout via Next.js API route
 */
export async function logout(): Promise<{ success: boolean; error?: string }> {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    return { success: false, error: "Logout failed" };
  }

  return { success: true };
}
