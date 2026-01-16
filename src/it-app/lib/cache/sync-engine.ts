/**
 * WhatsApp-Style Local Cache - Sync Engine
 *
 * Orchestrates delta synchronization, gap filling, and resync operations.
 * Acts as the coordinator between MessageCache and backend API.
 *
 * @module cache/sync-engine
 * @version 1.0.0
 */

import type {
  ChatSyncState,
  SyncResult,
  SyncOptions,
  CachedMessage,
  SequenceGap,
  OfflineOperation,
  OfflinePayload,
  SendMessagePayload,
  MarkReadPayload,
} from './schemas';
import { STORE_NAMES } from './schemas';
import { cacheLogger, CacheOperationType } from './cache-logger';
import { cacheStats } from './cache-stats';

const DEFAULT_SYNC_OPTIONS: Required<SyncOptions> = {
  forceFullSync: false,
  maxMessages: 100,
};

export interface MessageCacheInterface {
  getDB(): Promise<any>;
  getCachedMessages(requestId: string): Promise<CachedMessage[]>;
  addMessagesBatch(messages: CachedMessage[]): Promise<void>;
  getChatMeta(requestId: string): Promise<ChatSyncState | null>;
  updateSyncState(requestId: string, updates: Partial<ChatSyncState>): Promise<void>;
  detectGaps(requestId: string): Promise<SequenceGap[]>;
  recordGap(requestId: string, gap: SequenceGap): Promise<void>;
  clearGap(requestId: string, gap: SequenceGap): Promise<void>;
  clearChat(requestId: string): Promise<void>;
}

export interface FetchMessagesFunction {
  (requestId: string, params: {
    since_sequence?: number;
    start_sequence?: number;
    end_sequence?: number;
    limit?: number;
  }): Promise<CachedMessage[]>;
}

/**
 * SyncEngine orchestrates all synchronization operations for the message cache.
 *
 * Features:
 * - Delta sync: Only fetch new messages since last checkpoint
 * - Full resync: Clear and reload all messages
 * - Gap detection and filling: Automatically detect and fill sequence gaps
 * - Stale cache detection: Trigger resync for caches > 7 days old
 * - Too many gaps detection: Trigger resync when > 10 gaps accumulate
 * - Offline queue: Queue operations when offline and sync when online
 * - Network status monitoring: Automatically process offline queue when online
 */
export class SyncEngine {
  private queueSize: number = 0;
  private currentRequestId: string = '';
  private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private isRunning: boolean = true;

  constructor(
    private cache: MessageCacheInterface,
    private fetchMessages: FetchMessagesFunction
  ) {
    // Initialize network status listeners
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
    }
  }

  /**
   * Handle online event - process offline queue automatically
   */
  private handleOnline = () => {
    console.log('[SyncEngine] Network connection restored');
    this.isOnline = true;

    // Process offline queue automatically
    this.processOfflineQueue().catch(err => {
      console.error('[SyncEngine] Failed to process offline queue:', err);
    });
  };

  /**
   * Handle offline event - update state
   */
  private handleOffline = () => {
    console.log('[SyncEngine] Network connection lost');
    this.isOnline = false;
  };

  /**
   * Process the offline queue (send messages, mark read, etc.)
   * Called automatically when network comes online
   */
  async processOfflineQueue(): Promise<void> {
    const db = await this.cache.getDB();

    // Get all pending operations
    const pending = await db.getAllFromIndex(
      STORE_NAMES.OFFLINE_QUEUE,
      'by_status',
      'pending'
    );

    if (pending.length === 0) {
      console.log('[SyncEngine] No pending offline operations');
      return;
    }

    console.log(`[SyncEngine] Processing ${pending.length} offline operations`);

    for (const op of pending as OfflineOperation[]) {
      // Check if it's time to retry
      if (op.nextRetryAt && op.nextRetryAt > Date.now()) {
        continue;
      }

      try {
        op.status = 'syncing';
        op.attemptedAt = Date.now();
        await db.put(STORE_NAMES.OFFLINE_QUEUE, op);

        // Execute the operation
        if (op.type === 'send_message') {
          await this._executeSendMessage(op.payload as SendMessagePayload);
        } else if (op.type === 'mark_read') {
          await this._executeMarkRead(op.payload as MarkReadPayload);
        }

        // Success - remove from queue
        await db.delete(STORE_NAMES.OFFLINE_QUEUE, op.id);
        this.queueSize--;
        console.log(`[SyncEngine] Offline operation ${op.id} completed`);
      } catch (error) {
        // Failure - update retry info
        op.retryCount++;
        op.lastError = error instanceof Error ? error.message : String(error);

        if (op.retryCount >= op.maxRetries) {
          op.status = 'failed';
          console.error(
            `[SyncEngine] Offline operation ${op.id} failed permanently:`,
            op.lastError
          );
        } else {
          op.status = 'pending';
          // Exponential backoff: 2^retry_count seconds, max 60 seconds
          const backoffMs = Math.min(Math.pow(2, op.retryCount) * 1000, 60000);
          op.nextRetryAt = Date.now() + backoffMs;
          console.log(
            `[SyncEngine] Offline operation ${op.id} failed, retrying in ${backoffMs}ms`
          );
        }

        await db.put(STORE_NAMES.OFFLINE_QUEUE, op);
      }
    }
  }

  /**
   * Queue an operation for offline processing
   *
   * @param operation - Operation to queue (without id, createdAt, status, retryCount)
   */
  async queueOperation(
    operation: Omit<OfflineOperation, 'id' | 'createdAt' | 'status' | 'retryCount'>
  ): Promise<void> {
    const db = await this.cache.getDB();

    const offlineOp: OfflineOperation = {
      id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...operation,
      status: 'pending',
      createdAt: Date.now(),
      attemptedAt: null,
      retryCount: 0,
      nextRetryAt: null,
      lastError: null,
    };

    await db.put(STORE_NAMES.OFFLINE_QUEUE, offlineOp);
    this.queueSize++;
    this.currentRequestId = operation.requestId;
  }

  /**
   * Get the number of pending offline operations
   */
  getQueueSize(): number {
    return this.queueSize;
  }

  /**
   * Execute a send_message operation
   */
  private async _executeSendMessage(payload: SendMessagePayload): Promise<void> {
    const response = await fetch('/api/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        request_id: this.currentRequestId,
        content: payload.content,
        is_screenshot: payload.isScreenshot,
        screenshot_file_name: payload.screenshotFileName,
        client_temp_id: payload.tempId,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to send message');
    }
  }

  /**
   * Execute a mark_read operation
   */
  private async _executeMarkRead(payload: MarkReadPayload): Promise<void> {
    const response = await fetch(
      `/api/chat/messages/request/${this.currentRequestId}/read-all`,
      {
        method: 'POST',
        credentials: 'include',
      }
    );

    if (!response.ok) {
      throw new Error('Failed to mark messages as read');
    }
  }

  /**
   * Stop the sync engine and cleanup event listeners
   */
  async stop(): Promise<void> {
    // Remove event listeners
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }

    this.isRunning = false;
    console.log('[SyncEngine] Sync engine stopped');
  }

  /**
   * Sync a chat using delta sync (only fetch new messages)
   *
   * @param requestId - The service request ID to sync
   * @param options - Sync options (forceFullSync, maxMessages)
   * @returns SyncResult with statistics about the sync operation
   */
  async syncChat(requestId: string, options: SyncOptions = {}): Promise<SyncResult> {
    const opts = { ...DEFAULT_SYNC_OPTIONS, ...options };
    const startTime = Date.now();

    cacheLogger.logSyncStart(requestId, opts);

    try {
      // Get current sync state
      let meta = await this.cache.getChatMeta(requestId);

      // Check if we need full resync
      if (opts.forceFullSync || !meta) {
        return await this.fullResync(requestId);
      }

      // Check for stale cache (> 7 days)
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      if (meta.lastSyncedAt < sevenDaysAgo) {
        console.warn('[SyncEngine] Cache stale, triggering full resync');
        return await this.fullResync(requestId);
      }

      // Check for too many gaps (> 10 gaps)
      if (meta.knownGaps.length > 10) {
        console.warn('[SyncEngine] Too many gaps, triggering full resync');
        return await this.fullResync(requestId);
      }

      // Delta sync: fetch messages since last checkpoint
      const sinceSequence = meta.lastSyncedSequence;
      const newMessages = await this.fetchMessages(requestId, {
        since_sequence: sinceSequence,
        limit: opts.maxMessages,
      });

      if (newMessages.length === 0) {
        const duration = Date.now() - startTime;
        cacheLogger.logSyncComplete(requestId, duration, 0, { type: 'delta', noNewMessages: true });
        cacheStats.recordSync(0, duration);
        return {
          success: true,
          requestId,
          messagesAdded: 0,
          messagesUpdated: 0,
          gapsDetected: 0,
          gapsFilled: 0,
          syncDuration: duration,
        };
      }

      // Add new messages to cache
      await this.cache.addMessagesBatch(newMessages);

      // Update sync state
      const newestSequence = Math.max(...newMessages.map((m) => m.sequenceNumber));
      await this.cache.updateSyncState(requestId, {
        lastSyncedSequence: newestSequence,
        lastSyncedAt: Date.now(),
        messageCount: (await this.cache.getCachedMessages(requestId)).length,
      });

      // Detect gaps
      const gaps = await this.cache.detectGaps(requestId);
      for (const gap of gaps) {
        await this.cache.recordGap(requestId, gap);
        cacheLogger.logGapDetected(requestId, gaps.length);
      }

      const duration = Date.now() - startTime;
      cacheLogger.logSyncComplete(requestId, duration, newMessages.length, { type: 'delta' });
      cacheStats.recordSync(newMessages.length, duration);

      return {
        success: true,
        requestId,
        messagesAdded: newMessages.length,
        messagesUpdated: 0,
        gapsDetected: gaps.length,
        gapsFilled: 0,
        syncDuration: duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      cacheLogger.logSyncError(requestId, errorMsg, duration);
      cacheStats.recordSyncError();
      return {
        success: false,
        requestId,
        messagesAdded: 0,
        messagesUpdated: 0,
        gapsDetected: 0,
        gapsFilled: 0,
        syncDuration: duration,
        error: errorMsg,
      };
    }
  }

  /**
   * Full resync: clear cache and reload all messages
   *
   * Use this when:
   * - Cache is stale (> 7 days)
   * - Too many gaps detected (> 10 gaps)
   * - User explicitly requests refresh
   * - Sync state is corrupted
   *
   * @param requestId - The service request ID to resync
   * @returns SyncResult with statistics about the resync operation
   */
  async fullResync(requestId: string): Promise<SyncResult> {
    const startTime = Date.now();

    try {
      // Clear existing cache for this chat
      await this.cache.clearChat(requestId);

      // Fetch initial batch (latest 100 messages)
      const messages = await this.fetchMessages(requestId, {
        limit: 100,
      });

      if (messages.length === 0) {
        // Chat has no messages yet
        await this.cache.updateSyncState(requestId, {
          requestId,
          lastSyncedSequence: 0,
          lastSyncedAt: Date.now(),
          totalMessageCount: 0,
          messageCount: 0,
          mediaSize: 0,
          knownGaps: [],
          unreadCount: 0,
          lastReadSequence: 0,
          lastReadAt: null,
          lastAccessedAt: Date.now(),
          serverRevision: null,
        });

        return {
          success: true,
          requestId,
          messagesAdded: 0,
          messagesUpdated: 0,
          gapsDetected: 0,
          gapsFilled: 0,
          syncDuration: Date.now() - startTime,
        };
      }

      // Add messages to cache
      await this.cache.addMessagesBatch(messages);

      // Get newest and oldest sequences
      const newestSequence = Math.max(...messages.map((m) => m.sequenceNumber));
      const oldestSequence = Math.min(...messages.map((m) => m.sequenceNumber));

      // Initialize sync state
      await this.cache.updateSyncState(requestId, {
        requestId,
        lastSyncedSequence: newestSequence,
        lastSyncedAt: Date.now(),
        totalMessageCount: messages.length, // Will be updated from headers
        messageCount: messages.length,
        mediaSize: 0,
        knownGaps:
          oldestSequence > 1
            ? [{ startSeq: 1, endSeq: oldestSequence - 1, detectedAt: Date.now() }]
            : [],
        unreadCount: 0,
        lastReadSequence: 0,
        lastReadAt: null,
        lastAccessedAt: Date.now(),
        serverRevision: null,
      });

      return {
        success: true,
        requestId,
        messagesAdded: messages.length,
        messagesUpdated: 0,
        gapsDetected: 0,
        gapsFilled: 0,
        syncDuration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        requestId,
        messagesAdded: 0,
        messagesUpdated: 0,
        gapsDetected: 0,
        gapsFilled: 0,
        syncDuration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Detect and fill sequence gaps
   *
   * Gaps can occur when:
   * - WebSocket messages arrive out of order
   * - Network issues cause message delivery failures
   * - Backend has sequence number gaps (deleted messages)
   *
   * @param requestId - The service request ID to fill gaps for
   */
  async fillGaps(requestId: string): Promise<void> {
    const meta = await this.cache.getChatMeta(requestId);
    if (!meta || meta.knownGaps.length === 0) {
      return;
    }

    // Fill each gap
    for (const gap of meta.knownGaps) {
      try {
        const messages = await this.fetchMessages(requestId, {
          start_sequence: gap.startSeq,
          end_sequence: gap.endSeq,
        });

        if (messages.length > 0) {
          await this.cache.addMessagesBatch(messages);
          await this.cache.clearGap(requestId, gap);
        }
      } catch (error) {
        console.error(
          `[SyncEngine] Failed to fill gap ${gap.startSeq}-${gap.endSeq}:`,
          error
        );
      }
    }
  }
}
