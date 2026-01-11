/**
 * Session Logging Module
 *
 * Provides persistent, structured logging for debugging long-running sessions.
 *
 * Features:
 * - Writes to user's app data directory (%APPDATA%/com.itsupport.requester.solidjs/logs/)
 * - Automatic file rotation (5MB max per file, 10 files max)
 * - Structured JSON format with timestamps
 * - Completely fail-safe (never crashes the app)
 * - Batched writes for performance
 *
 * Usage:
 *   import { logger } from './logging';
 *
 *   // Initialize at app startup
 *   await logger.init();
 *
 *   // Log events
 *   logger.info('signalr', 'Connected to hub');
 *   logger.warn('network', 'High latency detected', { latency: 500 });
 *   logger.error('app', 'Failed to load data', { error: err.message });
 *
 * What to log:
 * - App startup/shutdown
 * - SignalR connect/reconnect/disconnect
 * - Remote support session lifecycle
 * - Network errors and retries
 * - Unhandled exceptions
 * - Critical warnings
 *
 * What NOT to log:
 * - Sensitive data (tokens, passwords, PII)
 * - High-frequency events (mouse movements, every keypress)
 * - Raw request/response payloads
 *
 * @module logging
 */

// Export logger singleton
export { logger, SessionLogger } from './logger';

// Export types
export type { LogLevel, LogSubsystem, LogEntry, LogFileInfo, LoggerOptions } from './types';
