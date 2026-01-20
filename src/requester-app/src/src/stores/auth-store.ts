/**
 * Authentication Store - SolidJS store for auth state management
 *
 * This store manages:
 * - User authentication state (token, user info, session)
 * - Login/logout actions (AD and SSO)
 * - Token persistence in Tauri Storage (migrated from localStorage)
 * - Automatic SSO for Tauri desktop
 */

import { createRoot } from "solid-js";
import { createStore } from "solid-js/store";
import type { User, LoginResponse, VersionEnforcementError } from "@/types";
import { AuthStorage, AuthStorageSync, migrateFromLocalStorage } from "@/lib/storage";
import { performAutoSSO, getSystemUsername } from "@/api/auth";

interface AuthState {
  token: string | null;
  user: User | null;
  sessionId: string | null; // DesktopSession UUID from backend
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  systemUsername: string | null;
  isTauriEnv: boolean | null; // null = not checked, true = Tauri, false = browser
  autoLoginAttempted: boolean; // Whether auto-login has been attempted
  autoLoginInProgress: boolean; // Whether auto-login is currently in progress
  explicitLogout: boolean; // Whether user explicitly logged out (prevents auto-login)
  // Phase 8: Version enforcement / update required state
  updateRequired: boolean;
  enforcementData: VersionEnforcementError | null;
  // Auth rehydration state - prevents premature redirects on page refresh
  isRehydrating: boolean; // True while checking Tauri Storage for auth data
}

// NOTE: Old async storage functions removed - now using AuthStorageSync for instant startup
// See AuthStorageSync in lib/storage.ts for the sync cache layer

/**
 * Default timeout for storage operations (5 seconds)
 */
const STORAGE_TIMEOUT_MS = 5000;

/**
 * Wrap a promise with a timeout
 * @param promise - The promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param operationName - Name of the operation for error messages
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = STORAGE_TIMEOUT_MS,
  operationName: string = "Operation"
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${operationName} timed out after ${timeoutMs}ms`)), timeoutMs)
  );
  return Promise.race([promise, timeoutPromise]);
}

/**
 * Check if running in Tauri
 */
function checkIsTauri(): boolean {
  try {
    if (typeof window === "undefined") return false;

    // Check for Tauri v2 (preferred)
    if ("__TAURI_INTERNALS__" in window) return true;

    // Check for Tauri v1 (fallback)
    if ("__TAURI__" in window) return true;

    // Check for Tauri IPC
    if ("__TAURI_IPC__" in window) return true;

    return false;
  } catch {
    return false;
  }
}

/**
 * Create the auth store with SolidJS reactive primitives
 * Uses synchronous cache for instant initialization
 */
function createAuthStore() {
  // INSTANT STARTUP: Initialize from sync cache immediately
  // This runs synchronously before any component renders
  const cachedAuth = AuthStorageSync.getAllSync();
  const hasValidCache = cachedAuth.token !== null && cachedAuth.user !== null;

  console.log('[auth-store] Sync cache init:', {
    hasToken: cachedAuth.token !== null,
    hasUser: cachedAuth.user !== null,
    hasSession: cachedAuth.sessionId !== null,
  });

  // Single synchronous Tauri check (no retries needed)
  const initialTauriCheck = checkIsTauri();

  // Determine if we need to rehydrate from Tauri Storage
  // Only rehydrate if: in Tauri environment AND sync cache has no auth data
  // This prevents unnecessary delays when auth is already cached
  const needsRehydration = initialTauriCheck && !hasValidCache;

  const [state, setState] = createStore<AuthState>({
    // Initialize from sync cache - instant, no async wait
    token: cachedAuth.token,
    user: cachedAuth.user,
    sessionId: cachedAuth.sessionId || null, // UUID string from backend
    isAuthenticated: hasValidCache,
    isLoading: false, // Start as false since we have sync cache
    error: null,
    systemUsername: null,
    isTauriEnv: initialTauriCheck, // Single check, no retry
    autoLoginAttempted: false,
    autoLoginInProgress: false,
    explicitLogout: false, // Will be set to true on logout to prevent auto-login
    // Phase 8: Version enforcement / update required state
    updateRequired: false,
    enforcementData: null,
    // Auth rehydration: true only if we need to check Tauri Storage
    isRehydrating: needsRehydration,
  });

  /**
   * Handle successful login response
   * Updates sync cache immediately, persists async
   * Also enables auto-start on Windows if this is the first login
   */
  const handleLoginSuccess = (response: LoginResponse): void => {
    // Update sync cache immediately (sync, non-blocking)
    AuthStorageSync.set('access_token', response.accessToken);
    AuthStorageSync.set('user', response.user);
    AuthStorageSync.set('session_id', String(response.sessionId));

    // Update store state (sync)
    // Reset explicitLogout so future app launches will auto-login again
    setState({
      token: response.accessToken,
      user: response.user,
      sessionId: response.sessionId,
      isAuthenticated: true,
      isLoading: false,
      error: null,
      explicitLogout: false, // Reset on successful login
    });
  };

  /**
   * Login with SSO (uses Windows session username)
   * @param isAutoLogin - Whether this is an automatic login attempt (affects state tracking)
   */
  const loginSSO = async (isAutoLogin: boolean = false): Promise<boolean> => {
    console.log(`Starting SSO login... (auto: ${isAutoLogin})`);

    if (isAutoLogin) {
      setState({ autoLoginInProgress: true, error: null, updateRequired: false, enforcementData: null });
    } else {
      setState({ isLoading: true, error: null, updateRequired: false, enforcementData: null });
    }

    try {
      const result = await performAutoSSO();

      console.log("SSO result:", result);

      if (result.success && result.data) {
        console.log("SSO login successful");
        handleLoginSuccess(result.data); // Now sync
        if (isAutoLogin) {
          setState({ autoLoginAttempted: true, autoLoginInProgress: false });
        }
        return true;
      } else {
        console.log("SSO login failed:", result.error);

        // Check for version enforcement (Phase 8)
        if (result.versionEnforced && result.enforcementData) {
          console.log("[auth-store] Version enforcement triggered (SSO)");
          setState({
            token: null,
            user: null,
            sessionId: null,
            isAuthenticated: false,
            isLoading: false,
            error: result.error || "Update required",
            updateRequired: true,
            enforcementData: result.enforcementData,
            autoLoginAttempted: isAutoLogin,
            autoLoginInProgress: false,
          });
          return false;
        }

        setState({
          token: null,
          user: null,
          sessionId: null,
          isAuthenticated: false,
          isLoading: false,
          error: result.error || "SSO login failed",
          autoLoginAttempted: isAutoLogin,
          autoLoginInProgress: false,
        });
        return false;
      }
    } catch (e) {
      console.error("SSO login exception:", e);
      setState({
        isLoading: false,
        error: e instanceof Error ? e.message : "SSO login failed",
        autoLoginAttempted: isAutoLogin,
        autoLoginInProgress: false,
      });
      return false;
    }
  };

  /**
   * Attempt automatic SSO login (called once after Tauri detection and username fetch)
   * This provides a seamless login experience without user interaction
   */
  const attemptAutoLogin = async (): Promise<boolean> => {
    // Skip if user explicitly logged out - they must click manual login
    if (state.explicitLogout) {
      console.log("User explicitly logged out, skipping auto-login");
      return false;
    }

    // Only attempt once
    if (state.autoLoginAttempted || state.autoLoginInProgress) {
      console.log("Auto-login already attempted or in progress, skipping");
      return false;
    }

    // Must be in Tauri environment
    if (!state.isTauriEnv) {
      console.log("Not in Tauri environment, skipping auto-login");
      return false;
    }

    // Must have system username
    if (!state.systemUsername) {
      console.log("No system username available, skipping auto-login");
      return false;
    }

    // Don't attempt if already authenticated
    if (state.isAuthenticated) {
      console.log("Already authenticated, skipping auto-login");
      return false;
    }

    console.log("Attempting automatic SSO login...");
    return loginSSO(true);
  };

  /**
   * Detect Tauri environment and initiate auto-login if applicable
   * INSTANT: Single synchronous check, no retry loop
   * Called from SSO page to trigger username fetch and auto-login
   */
  const detectTauriEnvironment = (): void => {
    // Skip if already authenticated
    if (state.isAuthenticated) {
      console.log("[auth-store] Already authenticated, skipping Tauri flow");
      return;
    }

    // isTauriEnv is set at store creation time (sync)
    // If we're in Tauri, fetch username and auto-login (async, non-blocking)
    if (state.isTauriEnv) {
      console.log("[auth-store] In Tauri env, initiating auto-login flow");
      // Fire-and-forget: username fetch → auto-login
      fetchSystemUsername().catch((error) => {
        console.error("[auth-store] Auto-login flow failed:", error);
      });
    } else {
      console.log("[auth-store] Not in Tauri environment");
    }
  };

  /**
   * Fetch the Windows username for display on SSO page
   * After fetching, automatically attempts SSO login
   * Properly awaits all async operations to avoid fire-and-forget chains
   */
  const fetchSystemUsername = async (): Promise<string | null> => {
    console.log("Fetching system username...");

    if (!checkIsTauri()) {
      console.log("Not running in Tauri environment");
      return null;
    }

    console.log("Running in Tauri, fetching username...");

    try {
      const username = await getSystemUsername();
      console.log(`Got username: ${username}`);
      setState("systemUsername", username);

      // Automatically attempt SSO login after getting the username
      // Use queueMicrotask instead of setTimeout(0) for faster execution
      // while still allowing state update to propagate
      await new Promise<void>((resolve) => {
        queueMicrotask(async () => {
          try {
            await attemptAutoLogin();
          } catch (error) {
            console.error("Auto-login attempt failed:", error);
          }
          resolve();
        });
      });

      return username;
    } catch (error) {
      console.error("Internal Server Error username:", error);
      return null;
    }
  };

  /**
   * Refresh auth state from Tauri Storage (background operation)
   * CRITICAL: This sets isRehydrating to false when complete, enabling route guards
   * On page refresh, route guards wait for this to complete before redirecting
   */
  const refreshFromStorage = (): void => {
    console.log("[auth-store] refreshFromStorage() - background sync starting");

    // Run migration and cache refresh in background
    (async () => {
      try {
        // Step 1: Attempt one-time migration from localStorage
        await withTimeout(
          attemptLocalStorageMigration(),
          STORAGE_TIMEOUT_MS,
          "LocalStorage migration"
        ).catch((error) => {
          console.warn("[auth-store] Migration failed (non-fatal):", error.message);
        });

        // Step 2: Refresh sync cache from Tauri Storage
        await withTimeout(
          AuthStorageSync.refreshFromStorage(),
          STORAGE_TIMEOUT_MS,
          "Refresh from storage"
        ).catch((error) => {
          console.warn("[auth-store] Cache refresh failed (non-fatal):", error.message);
        });

        // Step 3: Update store state if cache has newer data
        const refreshedAuth = AuthStorageSync.getAllSync();
        const hasAuth = refreshedAuth.token !== null && refreshedAuth.user !== null;

        // Only update if we found auth data and current state doesn't have it
        // (Don't overwrite if user logged in during the refresh)
        if (hasAuth && !state.isAuthenticated) {
          console.log("[auth-store] Found auth in storage, updating state");
          setState({
            token: refreshedAuth.token,
            user: refreshedAuth.user,
            sessionId: refreshedAuth.sessionId || null, // UUID string from backend
            isAuthenticated: true,
            isRehydrating: false, // Rehydration complete with auth found
          });
        } else {
          // No auth found or already authenticated - just mark rehydration complete
          setState({ isRehydrating: false });
        }

        console.log("[auth-store] Background refresh complete, isRehydrating:", state.isRehydrating);
      } catch (e) {
        console.error("[auth-store] Background refresh error:", e);
        // Even on error, mark rehydration complete to unblock route guards
        setState({ isRehydrating: false });
      }
    })();
  };

  /**
   * Initialize auth state from Tauri Storage (LEGACY - kept for backwards compatibility)
   * NOTE: State is already initialized from sync cache, this just triggers background refresh
   * @deprecated Use refreshFromStorage() instead
   */
  const initialize = async (): Promise<void> => {
    console.log("[auth-store] initialize() called - triggering background refresh");
    refreshFromStorage();
  };

  /**
   * Attempt one-time migration from localStorage to Tauri Storage
   * This helps users transition from the old localStorage-based auth
   */
  const attemptLocalStorageMigration = async (): Promise<void> => {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    // Check if there's data in localStorage to migrate
    const hasLocalStorageData =
      localStorage.getItem("access_token") ||
      localStorage.getItem("user") ||
      localStorage.getItem("session_id");

    if (!hasLocalStorageData) {
      // No migration needed
      return;
    }

    console.log("[Auth] Migrating auth data from localStorage to Tauri Storage...");

    try {
      // Migrate auth keys
      await migrateFromLocalStorage(["access_token", "user", "session_id"]);
      console.log("[Auth] Migration completed successfully");
    } catch (error) {
      console.error("[Auth] Migration failed:", error);
      // Don't throw - allow app to continue even if migration fails
    }
  };

  /**
   * Clear error message
   */
  const clearError = (): void => {
    setState("error", null);
  };

  /**
   * Clear update required state (Phase 8)
   * Called when user wants to retry login after update failure
   */
  const clearUpdateRequired = (): void => {
    setState({
      updateRequired: false,
      enforcementData: null,
      error: null,
    });
  };

  return {
    // State (reactive)
    state,

    // Actions
    loginSSO,
    initialize,
    refreshFromStorage, // New: non-blocking background refresh
    detectTauriEnvironment,
    fetchSystemUsername,
    attemptAutoLogin,
    clearError,
    handleLoginSuccess,
    clearUpdateRequired,
  };
}

// Create singleton store using createRoot for proper disposal
export const authStore = createRoot(createAuthStore);

// Accessor helpers that return getter functions for reactive tracking
// Pattern: const value = useHelper(); then call value() in reactive contexts
// This ensures the store property is read inside the reactive context, not when creating the accessor
export const useIsAuthenticated = () => () => authStore.state.isAuthenticated;
export const useUser = () => () => authStore.state.user;
export const useToken = () => () => authStore.state.token;
export const useAuthLoading = () => () => authStore.state.isLoading;
export const useAuthError = () => () => authStore.state.error;
export const useSystemUsername = () => () => authStore.state.systemUsername;
export const useIsTauriEnv = () => () => authStore.state.isTauriEnv;
export const useAutoLoginAttempted = () => () => authStore.state.autoLoginAttempted;
export const useAutoLoginInProgress = () => () => authStore.state.autoLoginInProgress;
export const useExplicitLogout = () => () => authStore.state.explicitLogout;
// Phase 8: Update required state accessors
export const useUpdateRequired = () => () => authStore.state.updateRequired;
export const useEnforcementData = () => () => authStore.state.enforcementData;
// Auth rehydration state - blocks redirects until Tauri Storage is checked
export const useIsRehydrating = () => () => authStore.state.isRehydrating;
