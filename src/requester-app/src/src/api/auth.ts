/**
 * Authentication API - Login, logout, and token validation
 *
 * This module handles all authentication-related API calls.
 *
 * Endpoints used:
 * - POST /auth/ad-login - Active Directory login (username + password)
 * - POST /auth/sso-login - SSO login (username only, for domain users)
 * - POST /auth/logout - Logout and invalidate session
 * - POST /auth/validate - Validate current token
 * - GET /auth/me - Get current user info
 *
 * For Tauri desktop:
 * - SSO uses the Windows session username automatically
 * - Calls backend directly (no Next.js proxy needed)
 */

import apiClient, { getErrorMessage, isAPIError } from "./client";
import type {
  ADLoginRequest,
  SSOLoginRequest,
  LoginResponse,
  User,
  DeviceInfo,
  AuthResult,
  VersionEnforcementError,
} from "@/types";

/**
 * Extended auth result that includes version enforcement info
 */
export interface ExtendedAuthResult extends AuthResult {
  versionEnforced?: boolean;
  enforcementData?: VersionEnforcementError;
}

/**
 * Get device information for authentication
 * Used for session tracking and security auditing
 * @param appVersion - Optional application version string
 * @param localIp - Optional local IP address
 * @param computerName - Optional computer/hostname
 */
export function getDeviceInfo(
  appVersion?: string,
  localIp?: string,
  computerName?: string
): DeviceInfo {
  const ua = navigator.userAgent;
  let os = "Unknown";
  let browser = "Tauri"; // Tauri desktop app

  // Detect OS from user agent
  if (ua.includes("Win")) os = "Windows";
  else if (ua.includes("Mac")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";

  // Generate a simple device fingerprint
  const fingerprint = btoa(
    `${navigator.userAgent}|${screen.width}x${screen.height}|${new Date().getTimezoneOffset()}`
  ).slice(0, 32);

  return {
    os,
    browser,
    user_agent: ua,
    device_fingerprint: fingerprint,
    app_version: appVersion,
    ip_address: localIp, // Include local IP address if available
    computer_name: computerName, // Include computer hostname if available
  };
}

/**
 * Extract version enforcement data from API error
 */
function extractEnforcementFromError(error: unknown): VersionEnforcementError | null {
  if (!isAPIError(error)) return null;
  if (error.status !== 426) return null;

  const data = error.data;
  if (!data || typeof data !== "object") return null;
  if (data.reason !== "version_enforced") return null;

  return {
    reason: "version_enforced",
    targetVersion: data.target_version || data.targetVersion || "",
    message: data.message || "Update required",
    versionStatus: (data.version_status || data.versionStatus || "outdated_enforced") as "outdated_enforced" | "unknown",
    currentVersion: data.current_version || data.currentVersion || "",
    installerUrl: data.installer_url || data.installerUrl || undefined,
    silentInstallArgs: data.silent_install_args || data.silentInstallArgs || "/qn /norestart",
  };
}

/**
 * Login with Active Directory credentials
 * @param username - AD username
 * @param password - AD password
 * @returns Auth result with login response or error (includes version enforcement info)
 */
export async function loginWithAD(
  username: string,
  password: string
): Promise<ExtendedAuthResult> {
  try {
    // Get app version, local IP, and computer name from Tauri if available
    let appVersion = "1.0.0"; // Fallback version
    let localIp: string | undefined;
    let computerName: string | undefined;

    try {
      if (isTauri()) {
        const { getVersion } = await import("@tauri-apps/api/app");
        const { invoke } = await import("@tauri-apps/api/core");

        appVersion = await getVersion();

        // Get local IP address
        try {
          localIp = await invoke<string>("get_local_ip");
        } catch (err) {
          console.warn("Failed to get local IP:", err);
        }

        // Get computer name
        try {
          computerName = await invoke<string>("get_computer_name");
        } catch (err) {
          console.warn("Failed to get computer name:", err);
        }
      }
    } catch (err) {
      console.warn("Failed to get app version:", err);
    }

    const deviceInfo = getDeviceInfo(appVersion, localIp, computerName);

    const loginData: ADLoginRequest = {
      username,
      password,
      device_info: deviceInfo,
    };

    const response = await apiClient.post<LoginResponse>(
      "/auth/ad-login",
      loginData
    );

    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    // Check for version enforcement (HTTP 426)
    const enforcementData = extractEnforcementFromError(error);
    if (enforcementData) {
      console.log("[auth] Version enforcement detected:", enforcementData);
      return {
        success: false,
        error: enforcementData.message,
        versionEnforced: true,
        enforcementData,
      };
    }

    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
}

/**
 * Login with SSO (Single Sign-On)
 * Uses the Windows session username for automatic authentication
 *
 * @param username - Windows session username (from Tauri command)
 * @returns Auth result with login response or error (includes version enforcement info)
 */
export async function loginWithSSO(username: string): Promise<ExtendedAuthResult> {
  try {
    // Get app version, local IP, and computer name from Tauri if available
    let appVersion = "1.0.0"; // Fallback version
    let localIp: string | undefined;
    let computerName: string | undefined;

    try {
      if (isTauri()) {
        const { getVersion } = await import("@tauri-apps/api/app");
        const { invoke } = await import("@tauri-apps/api/core");

        appVersion = await getVersion();

        // Get local IP address
        try {
          localIp = await invoke<string>("get_local_ip");
        } catch (err) {
          console.warn("Failed to get local IP:", err);
        }

        // Get computer name
        try {
          computerName = await invoke<string>("get_computer_name");
        } catch (err) {
          console.warn("Failed to get computer name:", err);
        }
      }
    } catch (err) {
      console.warn("Failed to get app version:", err);
    }

    const deviceInfo = getDeviceInfo(appVersion, localIp, computerName);

    const loginData: SSOLoginRequest = {
      username,
      device_info: deviceInfo,
    };

    const response = await apiClient.post<LoginResponse>(
      "/auth/sso-login",
      loginData
    );

    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    // Check for version enforcement (HTTP 426)
    const enforcementData = extractEnforcementFromError(error);
    if (enforcementData) {
      console.log("[auth] Version enforcement detected:", enforcementData);
      return {
        success: false,
        error: enforcementData.message,
        versionEnforced: true,
        enforcementData,
      };
    }

    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
}

/**
 * Logout and invalidate current session
 */
export async function logout(): Promise<void> {
  try {
    await apiClient.post("/auth/logout");
  } catch (error) {
    // Even if logout fails on server, clear local state
    console.error("Logout error:", getErrorMessage(error));
  } finally {
    // Always clear local storage
    localStorage.removeItem("access_token");
    localStorage.removeItem("user");
    localStorage.removeItem("session_id");
  }
}

/**
 * Validate the current access token
 * @returns True if token is valid, false otherwise
 */
export async function validateToken(): Promise<boolean> {
  try {
    await apiClient.post("/auth/validate");
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current user information
 * @returns Current user object
 */
export async function getCurrentUser(): Promise<User> {
  try {
    const response = await apiClient.get<User>("/auth/me");
    return response.data;
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }
}

// ============================================================================
// Tauri-specific functions
// ============================================================================

/**
 * Check if running in Tauri environment
 * Tauri v2 uses __TAURI_INTERNALS__ instead of __TAURI__
 */
export function isTauri(): boolean {
  if (typeof window === "undefined") return false;

  // Check for Tauri v2
  if ("__TAURI_INTERNALS__" in window) return true;

  // Check for Tauri v1 (fallback)
  if ("__TAURI__" in window) return true;

  // Check if @tauri-apps/api is available by checking the IPC
  if ("__TAURI_IPC__" in window) return true;

  return false;
}

/**
 * Get Windows username via Tauri command
 * This calls the Rust backend to get the system username
 *
 * @returns The Windows/system username
 * @throws Error if not in Tauri or if command fails
 */
export async function getSystemUsername(): Promise<string> {
  if (!isTauri()) {
    throw new Error("Not running in Tauri environment");
  }

  const { invoke } = await import("@tauri-apps/api/core");
  const username = await invoke<string>("get_system_username");

  return username;
}

/**
 * Get computer name via Tauri command
 *
 * @returns The computer name
 * @throws Error if not in Tauri or if command fails
 */
export async function getComputerName(): Promise<string> {
  if (!isTauri()) {
    throw new Error("Not running in Tauri environment");
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("get_computer_name");
}

/**
 * Get OS info via Tauri command
 *
 * @returns OS and architecture string
 */
export async function getOsInfo(): Promise<string> {
  if (!isTauri()) {
    return "Browser";
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("get_os_info");
}

/**
 * Perform automatic SSO login using Windows session
 * This is the main entry point for SSO in Tauri
 *
 * 1. Gets the Windows username from the system
 * 2. Calls the SSO login endpoint
 * 3. Returns the auth result (includes version enforcement info)
 *
 * @returns Auth result with login response or error
 */
export async function performAutoSSO(): Promise<ExtendedAuthResult> {
  try {
    // Get Windows username from Tauri
    const username = await getSystemUsername();

    if (!username) {
      return {
        success: false,
        error: "Could not determine Windows username",
      };
    }

    // Perform SSO login with the username
    const result = await loginWithSSO(username);
    return result;
  } catch (error) {
    console.error("SSO error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "SSO authentication failed",
    };
  }
}
