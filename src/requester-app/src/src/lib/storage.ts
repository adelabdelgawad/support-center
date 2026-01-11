/**
 * Tauri Persistent Storage API
 *
 * Type-safe wrapper for tauri-plugin-store that provides:
 * - Persistent key-value storage (survives app restarts)
 * - Typed access to storage keys
 * - Automatic JSON serialization/deserialization
 * - Graceful fallback for dev mode (non-Tauri environment)
 * - Auth key protection (access_token, user, session_id are auth-store exclusive)
 *
 * Storage keys:
 * - Auth keys: access_token, user, session_id (use AuthStorage class)
 * - Config keys: theme_preference, window_position, feature_flags
 *
 * Usage:
 * ```ts
 * // Get a value
 * const serverAddress = await TauriStorage.get('server_address');
 *
 * // Set a value
 * await TauriStorage.set('theme_preference', 'dark');
 *
 * // Delete a value
 * await TauriStorage.delete('theme_preference');
 * ```
 */

import { invoke } from '@tauri-apps/api/core';
import type { User } from '../types';

// ============================================================================
// STORAGE KEY TYPES
// ============================================================================

/**
 * Window position configuration
 */
export interface WindowPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Feature flags configuration
 */
export type FeatureFlags = Record<string, boolean>;

/**
 * Theme preference options
 */
export type ThemePreference = 'light' | 'dark' | 'system';

/**
 * Typed storage keys (PUBLIC - accessible via TauriStorage)
 * Auth keys (access_token, user, session_id) are NOT included here
 */
export interface StorageKeys {
  theme_preference: ThemePreference;
  window_position: WindowPosition;
  feature_flags: FeatureFlags;
}

/**
 * Auth storage keys (PRIVATE - use AuthStorage class)
 */
export interface AuthStorageKeys {
  access_token: string;
  user: User; // Typed user object, not JSON string
  session_id: string;
}

// ============================================================================
// STORAGE API (Generic - excludes auth keys)
// ============================================================================

/**
 * Check if running in Tauri environment
 * Checks for Tauri v2 (__TAURI_INTERNALS__), v1 (__TAURI__), and IPC (__TAURI_IPC__)
 */
function isTauriEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  // Check for Tauri v2 (preferred)
  if ('__TAURI_INTERNALS__' in window) return true;
  // Check for Tauri v1 (fallback)
  if ('__TAURI__' in window) return true;
  // Check for Tauri IPC
  if ('__TAURI_IPC__' in window) return true;
  return false;
}

/**
 * In-memory fallback storage for dev mode (non-Tauri environment)
 */
const devModeStorage = new Map<string, any>();
let devModeWarningShown = false;

/**
 * Show warning when using dev mode fallback
 */
function warnDevMode() {
  if (!devModeWarningShown) {
    console.warn(
      '[TauriStorage] ⚠️ Running in dev mode without Tauri environment. ' +
      'Using in-memory storage fallback. Data will NOT persist across restarts.'
    );
    devModeWarningShown = true;
  }
}

/**
 * Tauri Storage API
 *
 * Type-safe wrapper for persistent storage
 * Excludes auth keys (use AuthStorage for those)
 */
export class TauriStorage {
  /**
   * Get a value from storage
   *
   * @param key - Storage key
   * @param defaultValue - Default value if key doesn't exist
   * @returns Value or default
   */
  static async get<K extends keyof StorageKeys>(
    key: K,
    defaultValue?: StorageKeys[K]
  ): Promise<StorageKeys[K] | null> {
    if (!isTauriEnvironment()) {
      warnDevMode();
      const value = devModeStorage.get(key);
      return value !== undefined ? value : (defaultValue ?? null);
    }

    try {
      const value = await invoke<StorageKeys[K] | null>('storage_get', { key });
      return value ?? (defaultValue ?? null);
    } catch (error) {
      console.error(`[TauriStorage] Failed to get '${key}':`, error);
      return defaultValue ?? null;
    }
  }

  /**
   * Set a value in storage
   *
   * @param key - Storage key
   * @param value - Value to store
   */
  static async set<K extends keyof StorageKeys>(
    key: K,
    value: StorageKeys[K]
  ): Promise<void> {
    if (!isTauriEnvironment()) {
      warnDevMode();
      devModeStorage.set(key, value);
      return;
    }

    try {
      await invoke('storage_set', { key, value });
    } catch (error) {
      console.error(`[TauriStorage] Failed to set '${key}':`, error);
      throw error;
    }
  }

  /**
   * Delete a value from storage
   *
   * @param key - Storage key to delete
   */
  static async remove<K extends keyof StorageKeys>(key: K): Promise<void> {
    if (!isTauriEnvironment()) {
      warnDevMode();
      devModeStorage.delete(key);
      return;
    }

    try {
      await invoke('storage_delete', { key });
    } catch (error) {
      console.error(`[TauriStorage] Failed to delete '${key}':`, error);
      throw error;
    }
  }

  /**
   * Check if a key exists in storage
   *
   * @param key - Storage key to check
   * @returns True if key exists
   */
  static async has<K extends keyof StorageKeys>(key: K): Promise<boolean> {
    if (!isTauriEnvironment()) {
      warnDevMode();
      return devModeStorage.has(key);
    }

    try {
      return await invoke<boolean>('storage_has', { key });
    } catch (error) {
      console.error(`[TauriStorage] Failed to check '${key}':`, error);
      return false;
    }
  }
}

// ============================================================================
// AUTH STORAGE SYNC CACHE (Instant startup support)
// ============================================================================

/**
 * In-memory cache for auth data to enable synchronous access
 * This cache is populated from Tauri Storage on startup and kept in sync
 */
const authMemoryCache = new Map<keyof AuthStorageKeys, AuthStorageKeys[keyof AuthStorageKeys] | null>();

/**
 * Flag indicating if the cache has been populated from persistent storage
 */
let authCachePopulated = false;

/**
 * AuthStorageSync - Synchronous access to cached auth data
 *
 * This class provides instant (synchronous) access to auth data for
 * eliminating startup latency. The cache is populated:
 * 1. On module load from localStorage (legacy migration fallback)
 * 2. Asynchronously from Tauri Storage (primary source)
 *
 * Usage pattern:
 * - Use `getSync()` for instant reads (returns cached value)
 * - Use `refreshFromStorage()` to update cache from Tauri Storage (background)
 * - Use `set()` to update both cache and persistent storage
 */
export class AuthStorageSync {
  /**
   * Get auth value synchronously from memory cache
   * Returns null if value is not cached (before async populate completes)
   *
   * @param key - Auth storage key
   * @returns Cached value or null
   */
  static getSync<K extends keyof AuthStorageKeys>(key: K): AuthStorageKeys[K] | null {
    const value = authMemoryCache.get(key);
    return (value ?? null) as AuthStorageKeys[K] | null;
  }

  /**
   * Set auth value in both memory cache and persistent storage
   * Updates cache immediately, persists async (fire-and-forget safe)
   *
   * @param key - Auth storage key
   * @param value - Value to store
   */
  static set<K extends keyof AuthStorageKeys>(key: K, value: AuthStorageKeys[K]): void {
    // Update memory cache immediately (sync)
    authMemoryCache.set(key, value);

    // Persist to Tauri Storage (async, fire-and-forget)
    AuthStorage.set(key, value).catch((error) => {
      console.error(`[AuthStorageSync] Failed to persist '${key}':`, error);
    });
  }

  /**
   * Delete auth value from both memory cache and persistent storage
   *
   * @param key - Auth storage key to delete
   */
  static delete<K extends keyof AuthStorageKeys>(key: K): void {
    // Update memory cache immediately (sync)
    authMemoryCache.delete(key);

    // Persist deletion to Tauri Storage (async, fire-and-forget)
    AuthStorage.delete(key).catch((error) => {
      console.error(`[AuthStorageSync] Failed to delete '${key}':`, error);
    });
  }

  /**
   * Clear all auth data from both memory cache and persistent storage
   */
  static clearAll(): void {
    // Clear memory cache immediately (sync)
    authMemoryCache.clear();

    // Clear persistent storage (async, fire-and-forget)
    AuthStorage.clearAll().catch((error) => {
      console.error('[AuthStorageSync] Failed to clear persistent storage:', error);
    });
  }

  /**
   * Check if cache has been populated from persistent storage
   */
  static isCachePopulated(): boolean {
    return authCachePopulated;
  }

  /**
   * Populate cache from persistent Tauri Storage
   * Call this on startup to sync cache with persisted data
   * Returns a promise that resolves when cache is populated
   *
   * IMPORTANT: sessionId is validated as UUID to reject legacy numeric values
   */
  static async refreshFromStorage(): Promise<void> {
    // UUID v4 pattern for validation
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    try {
      const [token, user, rawSessionId] = await Promise.all([
        AuthStorage.get('access_token'),
        AuthStorage.get('user'),
        AuthStorage.get('session_id'),
      ]);

      // Only update cache with non-null values to avoid overwriting
      // values that were set synchronously before async completed
      if (token !== null) authMemoryCache.set('access_token', token);
      if (user !== null) authMemoryCache.set('user', user);

      // Validate sessionId is a proper UUID before caching
      let validSessionId: string | null = null;
      if (rawSessionId !== null) {
        const sessionIdStr = String(rawSessionId);
        if (UUID_REGEX.test(sessionIdStr)) {
          authMemoryCache.set('session_id', sessionIdStr);
          validSessionId = sessionIdStr;
        } else {
          console.warn('[AuthStorageSync] Rejected non-UUID sessionId from Tauri Storage:', rawSessionId);
          // Clear invalid value from persistent storage
          await AuthStorage.remove('session_id');
        }
      }

      authCachePopulated = true;
      console.log('[AuthStorageSync] Cache populated from Tauri Storage:', {
        hasToken: token !== null,
        hasUser: user !== null,
        hasSession: validSessionId !== null,
      });
    } catch (error) {
      console.error('[AuthStorageSync] Failed to populate cache:', error);
      authCachePopulated = true; // Mark as populated even on error to prevent retry loops
    }
  }

  /**
   * Get all cached auth data as a bundle
   * Useful for initializing auth store
   *
   * IMPORTANT: sessionId is validated as UUID to reject legacy numeric values
   */
  static getAllSync(): {
    token: string | null;
    user: User | null;
    sessionId: string | null;
  } {
    const rawSessionId = this.getSync('session_id');

    // Validate sessionId is a proper UUID (reject legacy numeric values)
    let sessionId: string | null = null;
    if (rawSessionId !== null) {
      const sessionIdStr = String(rawSessionId);
      // UUID v4 pattern check
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionIdStr);
      if (isUUID) {
        sessionId = sessionIdStr;
      } else {
        console.warn('[AuthStorageSync] Rejected non-UUID sessionId from cache:', rawSessionId);
        // Clear the invalid value from cache
        this.remove('session_id');
      }
    }

    return {
      token: this.getSync('access_token'),
      user: this.getSync('user'),
      sessionId,
    };
  }
}

/**
 * Bootstrap auth cache from localStorage on module load
 * This provides instant access to auth data even before Tauri IPC is ready
 * Falls back to any existing localStorage data (legacy migration path)
 *
 * IMPORTANT: sessionId is validated as UUID to reject legacy numeric values
 */
function bootstrapAuthCacheFromLocalStorage(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;

  // UUID v4 pattern for validation
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  try {
    // Check localStorage for any auth data (legacy or fallback)
    const token = localStorage.getItem('access_token');
    const userStr = localStorage.getItem('user');
    const rawSessionId = localStorage.getItem('session_id');

    if (token) {
      authMemoryCache.set('access_token', token);
    }
    if (userStr) {
      try {
        const user = JSON.parse(userStr) as User;
        authMemoryCache.set('user', user);
      } catch {
        // Invalid JSON, skip
      }
    }
    // Only accept UUID sessionIds, reject legacy numeric values
    if (rawSessionId && UUID_REGEX.test(rawSessionId)) {
      authMemoryCache.set('session_id', rawSessionId);
    } else if (rawSessionId) {
      console.warn('[AuthStorageSync] Rejected non-UUID sessionId from localStorage:', rawSessionId);
      // Clear invalid legacy value
      localStorage.removeItem('session_id');
    }

    if (token || userStr || rawSessionId) {
      console.log('[AuthStorageSync] Bootstrapped from localStorage (legacy)');
    }
  } catch (error) {
    // Silent fail - localStorage might not be accessible
  }
}

// Bootstrap cache immediately on module load
bootstrapAuthCacheFromLocalStorage();

// ============================================================================
// AUTH STORAGE API (Auth-exclusive keys)
// ============================================================================

/**
 * Auth Storage API
 *
 * Provides access to auth-related storage keys (access_token, user, session_id)
 * These keys are protected from generic storage access
 *
 * ⚠️ Only use this from auth-store.ts
 * ⚠️ Prefer AuthStorageSync for sync access to cached values
 */
export class AuthStorage {
  /**
   * Get an auth value from storage
   *
   * @param key - Auth storage key
   * @returns Value or null
   */
  static async get<K extends keyof AuthStorageKeys>(
    key: K
  ): Promise<AuthStorageKeys[K] | null> {
    if (!isTauriEnvironment()) {
      warnDevMode();
      const value = devModeStorage.get(key);
      return value ?? null;
    }

    try {
      const value = await invoke<AuthStorageKeys[K] | null>('auth_storage_get', { key });
      return value ?? null;
    } catch (error) {
      console.error(`[AuthStorage] Failed to get '${key}':`, error);
      return null;
    }
  }

  /**
   * Set an auth value in storage
   *
   * @param key - Auth storage key
   * @param value - Value to store
   */
  static async set<K extends keyof AuthStorageKeys>(
    key: K,
    value: AuthStorageKeys[K]
  ): Promise<void> {
    if (!isTauriEnvironment()) {
      warnDevMode();
      devModeStorage.set(key, value);
      return;
    }

    try {
      await invoke('auth_storage_set', { key, value });
    } catch (error) {
      console.error(`[AuthStorage] Failed to set '${key}':`, error);
      throw error;
    }
  }

  /**
   * Delete an auth value from storage
   *
   * @param key - Auth storage key to delete
   */
  static async delete<K extends keyof AuthStorageKeys>(key: K): Promise<void> {
    if (!isTauriEnvironment()) {
      warnDevMode();
      devModeStorage.delete(key);
      return;
    }

    try {
      await invoke('auth_storage_delete', { key });
    } catch (error) {
      console.error(`[AuthStorage] Failed to delete '${key}':`, error);
      throw error;
    }
  }

  /**
   * Clear all auth data from storage (logout)
   */
  static async clearAll(): Promise<void> {
    await Promise.all([
      this.delete('access_token'),
      this.delete('user'),
      this.delete('session_id'),
    ]);
  }
}

// ============================================================================
// MIGRATION UTILITIES
// ============================================================================

/**
 * Default timeout for migration operations (5 seconds)
 */
const MIGRATION_TIMEOUT_MS = 5000;

/**
 * Wrap a promise with a timeout for migration operations
 * @param promise - The promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 */
async function withMigrationTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = MIGRATION_TIMEOUT_MS
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Migration timed out after ${timeoutMs}ms`)), timeoutMs)
  );
  return Promise.race([promise, timeoutPromise]);
}

/**
 * Migrate data from localStorage to Tauri Store
 * This is a one-time operation for users upgrading from localStorage
 * Uses timeout protection to prevent indefinite hangs on IPC calls
 *
 * @param keys - Array of localStorage keys to migrate
 */
export async function migrateFromLocalStorage(keys: string[]): Promise<void> {
  if (!isTauriEnvironment()) {
    console.warn('[TauriStorage] Cannot migrate - not in Tauri environment');
    return;
  }

  if (typeof window === 'undefined' || !window.localStorage) {
    console.warn('[TauriStorage] localStorage not available');
    return;
  }

  try {
    const data: Record<string, any> = {};
    let migratedCount = 0;

    for (const key of keys) {
      const value = localStorage.getItem(key);
      if (value !== null) {
        // Try to parse JSON, fallback to string
        try {
          data[key] = JSON.parse(value);
        } catch {
          data[key] = value;
        }
        migratedCount++;
      }
    }

    if (migratedCount > 0) {
      // Use timeout to prevent hanging if Tauri IPC fails
      await withMigrationTimeout(
        invoke('storage_migrate_from_local', { data }),
        MIGRATION_TIMEOUT_MS
      );
      console.log(`[TauriStorage] Migrated ${migratedCount} keys from localStorage`);

      // Clear migrated keys from localStorage
      for (const key of keys) {
        localStorage.removeItem(key);
      }
    }
  } catch (error) {
    // Log specific timeout message for debugging
    if (error instanceof Error && error.message.includes('timed out')) {
      console.warn('[TauriStorage] Migration timed out - storage IPC may be unresponsive');
    } else {
      console.error('[TauriStorage] Migration failed:', error);
    }
    // Don't throw - allow app to continue even if migration fails
  }
}
