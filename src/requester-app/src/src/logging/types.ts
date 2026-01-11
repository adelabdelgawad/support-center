/**
 * Session Logging Types
 *
 * Defines the types used throughout the logging system.
 */

/** Log severity levels */
export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

/** Subsystem identifiers for categorizing logs */
export type LogSubsystem =
  | 'app' // App lifecycle events
  | 'signalr' // SignalR connection events
  | 'remote-support' // Remote support session events
  | 'network' // Network status changes
  | 'auth' // Authentication events
  | 'storage' // Storage operations
  | 'ui'; // Critical UI events

/** A structured log entry */
export interface LogEntry {
  /** ISO 8601 timestamp */
  ts: string;
  /** Log severity level */
  level: LogLevel;
  /** Subsystem that generated the log */
  subsystem: LogSubsystem;
  /** Human-readable message */
  message: string;
  /** Optional structured context (MUST NOT contain sensitive data) */
  context?: Record<string, unknown>;
}

/** Info about a log file from the backend */
export interface LogFileInfo {
  /** File name (e.g., "session-2025-01-01T12-00-00.log") */
  name: string;
  /** File size in bytes */
  size: number;
  /** Last modified timestamp (Unix seconds) */
  modified: number;
}

/** Options for the logger */
export interface LoggerOptions {
  /** Enable console output in addition to file logging (default: false in production) */
  consoleOutput?: boolean;
  /** Batch size before flushing to disk (default: 10) */
  batchSize?: number;
  /** Maximum time to wait before flushing batch (ms, default: 5000) */
  batchTimeout?: number;
}
