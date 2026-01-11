/**
 * Windows Auto-Start API
 *
 * TypeScript bindings for the Tauri auto-start commands.
 * Provides functions to enable/disable auto-start on Windows user login.
 *
 * Auto-start is enabled automatically after profile setup completion.
 * The implementation uses Windows Registry for per-user auto-start
 * (HKCU\Software\Microsoft\Windows\CurrentVersion\Run).
 *
 * Features:
 * - Idempotent: Safe to call multiple times
 * - Non-blocking: Silent failure, app continues normally
 * - Per-user: No admin privileges required
 *
 * Usage:
 * ```ts
 * // Enable auto-start after profile setup
 * const result = await AutoStart.markProfileSetupComplete();
 *
 * // Check status
 * const status = await AutoStart.checkStatus();
 *
 * // Manually enable/disable
 * await AutoStart.enable();
 * await AutoStart.disable();
 * ```
 */

import { invoke } from '@tauri-apps/api/core';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Status information for auto-start configuration
 */
export interface AutostartStatus {
  /** Whether auto-start is currently enabled (entry exists with correct path) */
  enabled: boolean;
  /** Whether the registry entry exists at all */
  entry_exists: boolean;
  /** The current value in registry (if exists) */
  current_value: string | null;
  /** The expected value (quoted executable path) */
  expected_value: string;
  /** Whether there's a mismatch (entry exists but wrong value) */
  has_mismatch: boolean;
  /** Human-readable status message */
  message: string;
}

/**
 * Result of an auto-start enable/disable operation
 */
export interface AutostartEnableResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Whether auto-start is now enabled */
  enabled: boolean;
  /** Human-readable result message */
  message: string;
  /** Whether this was a new entry (vs already existed) */
  was_created: boolean;
}

// ============================================================================
// ENVIRONMENT DETECTION
// ============================================================================

/**
 * Check if running in Tauri environment
 */
function isTauriEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  if ('__TAURI_INTERNALS__' in window) return true;
  if ('__TAURI__' in window) return true;
  if ('__TAURI_IPC__' in window) return true;
  return false;
}

// ============================================================================
// AUTO-START API
// ============================================================================

/**
 * Auto-Start API
 *
 * Provides functions to manage auto-start on Windows login.
 * All operations are:
 * - Safe to call multiple times (idempotent)
 * - Non-blocking on failure (won't crash the app)
 * - Windows-only (stubs on other platforms)
 */
export class AutoStart {
  /**
   * Check current auto-start status
   *
   * Returns detailed status including:
   * - Whether enabled
   * - Whether entry exists
   * - Any path mismatches
   *
   * @returns AutostartStatus or null if not in Tauri
   */
  static async checkStatus(): Promise<AutostartStatus | null> {
    if (!isTauriEnvironment()) {
      console.log('[AutoStart] Not in Tauri environment, skipping status check');
      return null;
    }

    try {
      return await invoke<AutostartStatus>('check_autostart_status');
    } catch (error) {
      console.error('[AutoStart] Failed to check status:', error);
      return null;
    }
  }

  /**
   * Enable auto-start on Windows login
   *
   * Follows strict idempotency rules:
   * - If entry exists with correct value: do nothing, return success
   * - If entry missing: create it
   * - If entry exists with different value: log warning, do NOT overwrite
   *
   * @returns AutostartEnableResult or null if not in Tauri
   */
  static async enable(): Promise<AutostartEnableResult | null> {
    if (!isTauriEnvironment()) {
      console.log('[AutoStart] Not in Tauri environment, skipping enable');
      return null;
    }

    try {
      return await invoke<AutostartEnableResult>('enable_autostart');
    } catch (error) {
      console.error('[AutoStart] Failed to enable:', error);
      return null;
    }
  }

  /**
   * Disable auto-start (remove registry entry)
   *
   * @returns AutostartEnableResult or null if not in Tauri
   */
  static async disable(): Promise<AutostartEnableResult | null> {
    if (!isTauriEnvironment()) {
      console.log('[AutoStart] Not in Tauri environment, skipping disable');
      return null;
    }

    try {
      return await invoke<AutostartEnableResult>('disable_autostart');
    } catch (error) {
      console.error('[AutoStart] Failed to disable:', error);
      return null;
    }
  }

  /**
   * Mark profile setup as complete and enable auto-start
   *
   * This is the primary entry point for enabling auto-start.
   * Call this after the user completes initial setup/authentication.
   *
   * The function:
   * 1. Persists profile_setup_completed flag
   * 2. Enables auto-start if not already configured
   * 3. Persists autostart_configured flag on success
   *
   * Safe to call multiple times (idempotent).
   *
   * @returns AutostartEnableResult or null if not in Tauri
   */
  static async markProfileSetupComplete(): Promise<AutostartEnableResult | null> {
    if (!isTauriEnvironment()) {
      console.log('[AutoStart] Not in Tauri environment, skipping profile setup');
      return null;
    }

    try {
      console.log('[AutoStart] Marking profile setup complete...');
      const result = await invoke<AutostartEnableResult>('mark_profile_setup_complete');
      console.log('[AutoStart] Profile setup result:', result);
      return result;
    } catch (error) {
      console.error('[AutoStart] Failed to mark profile setup complete:', error);
      return null;
    }
  }

  /**
   * Check if profile setup has been completed
   *
   * @returns boolean indicating if profile setup was previously completed
   */
  static async isProfileSetupComplete(): Promise<boolean> {
    if (!isTauriEnvironment()) {
      return false;
    }

    try {
      return await invoke<boolean>('is_profile_setup_complete');
    } catch (error) {
      console.error('[AutoStart] Failed to check profile setup status:', error);
      return false;
    }
  }
}
