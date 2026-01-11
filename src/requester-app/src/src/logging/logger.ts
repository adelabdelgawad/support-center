/**
 * Session Logger
 *
 * A robust, fail-safe logging system for the Requester App.
 *
 * Features:
 * - Writes structured JSON logs to the user's app data directory
 * - Automatic file rotation (5MB max per file, 10 files max)
 * - Batched writes for performance
 * - Completely fail-safe (never throws)
 * - Non-blocking (async operations)
 *
 * Usage:
 *   logger.info('signalr', 'Connected to hub');
 *   logger.warn('network', 'Connection unstable', { latency: 500 });
 *   logger.error('app', 'Unhandled error', { error: err.message });
 */

import { invoke } from '@tauri-apps/api/core';
import type { LogLevel, LogSubsystem, LogEntry, LoggerOptions, LogFileInfo } from './types';

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_BATCH_TIMEOUT = 5000; // 5 seconds

// ============================================================================
// ENVIRONMENT DETECTION
// ============================================================================

function isTauriEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  if ('__TAURI_INTERNALS__' in window) return true;
  if ('__TAURI__' in window) return true;
  if ('__TAURI_IPC__' in window) return true;
  return false;
}

// ============================================================================
// LOGGER CLASS
// ============================================================================

class SessionLogger {
  private initialized = false;
  private batch: LogEntry[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private options: Required<LoggerOptions>;
  private flushPromise: Promise<void> | null = null;

  constructor(options: LoggerOptions = {}) {
    this.options = {
      consoleOutput: options.consoleOutput ?? (import.meta.env?.DEV ?? false),
      batchSize: options.batchSize ?? DEFAULT_BATCH_SIZE,
      batchTimeout: options.batchTimeout ?? DEFAULT_BATCH_TIMEOUT,
    };
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Log an INFO level message
   */
  info(subsystem: LogSubsystem, message: string, context?: Record<string, unknown>): void {
    this.log('INFO', subsystem, message, context);
  }

  /**
   * Log a WARN level message
   */
  warn(subsystem: LogSubsystem, message: string, context?: Record<string, unknown>): void {
    this.log('WARN', subsystem, message, context);
  }

  /**
   * Log an ERROR level message
   */
  error(subsystem: LogSubsystem, message: string, context?: Record<string, unknown>): void {
    this.log('ERROR', subsystem, message, context);
  }

  /**
   * Initialize the logging system
   * Should be called once at app startup
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    if (!isTauriEnvironment()) {
      console.warn('[Logger] Not in Tauri environment, file logging disabled');
      this.initialized = true;
      return;
    }

    try {
      // Get app version and OS info for session header
      const [appVersion, osInfo] = await Promise.all([
        this.safeInvoke<string>('get_app_version', {}),
        this.safeInvoke<string>('get_os_info', {}),
      ]);

      await invoke('log_init', {
        appVersion: appVersion ?? 'unknown',
        osInfo: osInfo ?? 'unknown',
      });

      this.initialized = true;
      if (this.options.consoleOutput) {
        console.log('[Logger] Session logging initialized');
      }
    } catch (err) {
      // Fail silently - logging should never crash the app
      console.warn('[Logger] Failed to initialize:', err);
      this.initialized = true; // Mark as initialized to prevent retry loops
    }
  }

  /**
   * Flush any pending log entries to disk
   */
  async flush(): Promise<void> {
    // If there's already a flush in progress, wait for it
    if (this.flushPromise) {
      await this.flushPromise;
      return;
    }

    if (this.batch.length === 0) return;

    this.flushPromise = this.doFlush();
    await this.flushPromise;
    this.flushPromise = null;
  }

  /**
   * Get the logs directory path
   */
  async getLogsDirectory(): Promise<string | null> {
    if (!isTauriEnvironment()) return null;
    return this.safeInvoke<string>('log_get_directory', {});
  }

  /**
   * List all log files
   */
  async listLogFiles(): Promise<LogFileInfo[]> {
    if (!isTauriEnvironment()) return [];
    const files = await this.safeInvoke<LogFileInfo[]>('log_list_files', {});
    return files ?? [];
  }

  /**
   * Read the contents of a log file
   */
  async readLogFile(filename: string): Promise<string | null> {
    if (!isTauriEnvironment()) return null;
    return this.safeInvoke<string>('log_read_file', { filename });
  }

  /**
   * Get total size of all log files in bytes
   */
  async getTotalSize(): Promise<number> {
    if (!isTauriEnvironment()) return 0;
    const size = await this.safeInvoke<number>('log_get_total_size', {});
    return size ?? 0;
  }

  /**
   * Force rotation of the current log file
   */
  async forceRotate(): Promise<void> {
    if (!isTauriEnvironment()) return;
    await this.safeInvoke('log_force_rotate', {});
  }

  /**
   * Clear all log files
   */
  async clearAll(): Promise<void> {
    if (!isTauriEnvironment()) return;
    await this.safeInvoke('log_clear_all', {});
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  /**
   * Core logging method
   */
  private log(
    level: LogLevel,
    subsystem: LogSubsystem,
    message: string,
    context?: Record<string, unknown>
  ): void {
    // Sanitize context to remove any potentially sensitive data
    const safeContext = context ? this.sanitizeContext(context) : undefined;

    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      subsystem,
      message,
      context: safeContext,
    };

    // Console output if enabled
    if (this.options.consoleOutput) {
      this.logToConsole(entry);
    }

    // Add to batch for file logging
    if (isTauriEnvironment()) {
      this.addToBatch(entry);
    }
  }

  /**
   * Add entry to batch and schedule flush if needed
   */
  private addToBatch(entry: LogEntry): void {
    this.batch.push(entry);

    // Flush immediately if batch is full
    if (this.batch.length >= this.options.batchSize) {
      this.flush().catch(() => {
        // Silently ignore flush errors
      });
      return;
    }

    // Schedule flush if not already scheduled
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.batchTimer = null;
        this.flush().catch(() => {
          // Silently ignore flush errors
        });
      }, this.options.batchTimeout);
    }
  }

  /**
   * Actually flush the batch to disk
   */
  private async doFlush(): Promise<void> {
    if (this.batch.length === 0) return;

    // Clear timer if pending
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // Take current batch and clear it
    const entries = [...this.batch];
    this.batch = [];

    try {
      if (entries.length === 1) {
        // Single entry - use direct write
        const entry = entries[0];
        await invoke('log_write', {
          level: entry.level,
          subsystem: entry.subsystem,
          message: entry.message,
          context: entry.context ?? null,
        });
      } else {
        // Multiple entries - use batch write
        await invoke('log_write_batch', { entries });
      }
    } catch (err) {
      // Fail silently - we already logged to console if enabled
      if (this.options.consoleOutput) {
        console.warn('[Logger] Failed to write to file:', err);
      }
    }
  }

  /**
   * Sanitize context to remove sensitive data
   */
  private sanitizeContext(context: Record<string, unknown>): Record<string, unknown> {
    const sensitiveKeys = [
      'password',
      'token',
      'accessToken',
      'refreshToken',
      'access_token',
      'refresh_token',
      'secret',
      'apiKey',
      'api_key',
      'authorization',
      'cookie',
      'credentials',
      'ssn',
      'creditCard',
      'credit_card',
    ];

    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(context)) {
      // Check if key contains sensitive data
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some((sk) => lowerKey.includes(sk.toLowerCase()))) {
        sanitized[key] = '[REDACTED]';
        continue;
      }

      // Recursively sanitize nested objects
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeContext(value as Record<string, unknown>);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Log to console with appropriate styling
   */
  private logToConsole(entry: LogEntry): void {
    const prefix = `[${entry.subsystem}]`;
    const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : '';

    switch (entry.level) {
      case 'ERROR':
        console.error(`${prefix} ${entry.message}${contextStr}`);
        break;
      case 'WARN':
        console.warn(`${prefix} ${entry.message}${contextStr}`);
        break;
      case 'INFO':
      default:
        console.log(`${prefix} ${entry.message}${contextStr}`);
        break;
    }
  }

  /**
   * Safe invoke wrapper that never throws
   */
  private async safeInvoke<T>(command: string, args: Record<string, unknown>): Promise<T | null> {
    try {
      return await invoke<T>(command, args);
    } catch (err) {
      if (this.options.consoleOutput) {
        console.warn(`[Logger] Command '${command}' failed:`, err);
      }
      return null;
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

/**
 * Global logger instance
 *
 * Usage:
 *   import { logger } from './logging';
 *   logger.info('app', 'Application started');
 */
export const logger = new SessionLogger();

// Also export the class for testing or custom instances
export { SessionLogger };
