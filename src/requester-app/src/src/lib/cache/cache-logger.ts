/**
 * Cache Operation Logger for Requester App
 *
 * Provides structured logging for cache operations with timestamps,
 * operation types, and performance metrics.
 *
 * @module cache-logger
 * @version 1.0.0
 */

export enum CacheOperationType {
  // Sync operations
  SYNC_START = 'sync_start',
  SYNC_COMPLETE = 'sync_complete',
  SYNC_ERROR = 'sync_error',
  FULL_RESYNC = 'full_resync',

  // Read operations
  CACHE_HIT = 'cache_hit',
  CACHE_MISS = 'cache_miss',
  GET_MESSAGES = 'get_messages',
  GET_MESSAGE_COUNT = 'get_message_count',

  // Write operations
  ADD_MESSAGE = 'add_message',
  ADD_BATCH = 'add_batch',
  UPDATE_MESSAGE = 'update_message',

  // Cleanup operations
  EVICT_CHAT = 'evict_chat',
  CLEAR_CHAT = 'clear_chat',
  CLEAR_ALL = 'clear_all',
  CLEANUP_EXPIRED = 'cleanup_expired',

  // Gap operations
  GAP_DETECTED = 'gap_detected',
  GAP_FILLED = 'gap_filled',
  GAP_FAILED = 'gap_failed',

  // Offline queue operations
  QUEUE_OPERATION = 'queue_operation',
  PROCESS_QUEUE = 'process_queue',
  QUEUE_ERROR = 'queue_error',
}

export interface CacheLogEntry {
  timestamp: number;
  operation: CacheOperationType;
  requestId?: string;
  duration?: number;
  messageCount?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

class CacheLogger {
  private logs: CacheLogEntry[] = [];
  private maxLogs = 1000; // Keep last 1000 logs in memory

  /**
   * Log a cache operation
   */
  log(entry: Omit<CacheLogEntry, 'timestamp'>): void {
    const logEntry: CacheLogEntry = {
      timestamp: Date.now(),
      ...entry,
    };

    this.logs.push(logEntry);

    // Keep only last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Console output with formatted timestamp
    const timestamp = new Date(logEntry.timestamp).toISOString();
    const duration = logEntry.duration ? ` (${logEntry.duration}ms)` : '';
    const requestId = logEntry.requestId ? ` [${logEntry.requestId}]` : '';
    const metadata = logEntry.metadata ? ` ${JSON.stringify(logEntry.metadata)}` : '';

    const message = `[Cache ${logEntry.operation}]${requestId}${duration}${metadata}`;

    if (logEntry.error) {
      console.error(message, logEntry.error);
    } else {
      console.log(message);
    }
  }

  /**
   * Log sync start
   */
  logSyncStart(requestId: string, options?: Record<string, unknown>): void {
    this.log({
      operation: CacheOperationType.SYNC_START,
      requestId,
      metadata: options,
    });
  }

  /**
   * Log sync complete
   */
  logSyncComplete(
    requestId: string,
    duration: number,
    messageCount: number,
    metadata?: Record<string, unknown>
  ): void {
    this.log({
      operation: CacheOperationType.SYNC_COMPLETE,
      requestId,
      duration,
      messageCount,
      metadata,
    });
  }

  /**
   * Log sync error
   */
  logSyncError(requestId: string, error: string, duration?: number): void {
    this.log({
      operation: CacheOperationType.SYNC_ERROR,
      requestId,
      duration,
      error,
    });
  }

  /**
   * Log cache hit
   */
  logCacheHit(requestId: string, messageCount: number, duration: number): void {
    this.log({
      operation: CacheOperationType.CACHE_HIT,
      requestId,
      duration,
      messageCount,
    });
  }

  /**
   * Log cache miss
   */
  logCacheMiss(requestId: string): void {
    this.log({
      operation: CacheOperationType.CACHE_MISS,
      requestId,
    });
  }

  /**
   * Log eviction
   */
  logEviction(requestId: string, bytesFreed: number, messageCount: number): void {
    this.log({
      operation: CacheOperationType.EVICT_CHAT,
      requestId,
      metadata: {
        bytesFreed,
        messageCount,
      },
    });
  }

  /**
   * Log gap detection
   */
  logGapDetected(requestId: string, gaps: number): void {
    this.log({
      operation: CacheOperationType.GAP_DETECTED,
      requestId,
      metadata: { gaps },
    });
  }

  /**
   * Log gap fill
   */
  logGapFilled(requestId: string, gapsFilled: number, duration: number): void {
    this.log({
      operation: CacheOperationType.GAP_FILLED,
      requestId,
      duration,
      metadata: { gapsFilled },
    });
  }

  /**
   * Get all logs
   */
  getLogs(): CacheLogEntry[] {
    return [...this.logs];
  }

  /**
   * Get logs for a specific request
   */
  getLogsForRequest(requestId: string): CacheLogEntry[] {
    return this.logs.filter((log) => log.requestId === requestId);
  }

  /**
   * Get logs by operation type
   */
  getLogsByOperation(operation: CacheOperationType): CacheLogEntry[] {
    return this.logs.filter((log) => log.operation === operation);
  }

  /**
   * Clear all logs
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    totalLogs: number;
    operationCounts: Record<string, number>;
    averageSyncDuration: number;
    cacheHitRate: number;
  } {
    const operationCounts: Record<string, number> = {};
    let totalSyncDuration = 0;
    let syncCount = 0;
    let cacheHits = 0;
    let cacheMisses = 0;

    for (const log of this.logs) {
      operationCounts[log.operation] = (operationCounts[log.operation] || 0) + 1;

      if (log.operation === CacheOperationType.SYNC_COMPLETE && log.duration) {
        totalSyncDuration += log.duration;
        syncCount++;
      }

      if (log.operation === CacheOperationType.CACHE_HIT) {
        cacheHits++;
      } else if (log.operation === CacheOperationType.CACHE_MISS) {
        cacheMisses++;
      }
    }

    const totalRequests = cacheHits + cacheMisses;
    const cacheHitRate = totalRequests > 0 ? (cacheHits / totalRequests) * 100 : 0;

    return {
      totalLogs: this.logs.length,
      operationCounts,
      averageSyncDuration: syncCount > 0 ? totalSyncDuration / syncCount : 0,
      cacheHitRate,
    };
  }
}

// Singleton instance
export const cacheLogger = new CacheLogger();

export default cacheLogger;
