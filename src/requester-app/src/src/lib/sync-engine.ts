/**
 * SyncEngine - Delta Synchronization Orchestrator for Requester App
 *
 * Implements WhatsApp-style delta synchronization:
 * - Loads cached messages instantly (<100ms)
 * - Syncs only new messages in background
 * - Detects and fills sequence gaps
 * - Integrates with offline queue
 *
 * Based on cache-schema.ts interface ISyncEngine
 *
 * @module sync-engine
 */

import { messageCache } from './message-cache';
import { getMessagesCursor, sendMessage, markMessagesAsRead } from '@/api/messages';
import type { ChatMessage } from '@/types';
import { signalRNotification } from '@/signalr/signalr-manager';
import type { OfflineOperation, ChatSyncState } from './cache/schemas';
import { DB_VERSION, CACHE_LIMITS } from './cache/schemas';
import { cacheLogger } from './cache/cache-logger';
import { cacheStats } from './cache/cache-stats';

// ============================================================================
// Types
// ============================================================================

export interface SyncOptions {
  forceFullSync?: boolean;
  maxMessages?: number;
}

export interface SyncResult {
  success: boolean;
  requestId: string;
  messagesAdded: number;
  messagesUpdated: number;
  gapsDetected: number;
  gapsFilled: number;
  syncDuration: number;
  error?: string;
}

export interface SequenceGap {
  startSeq: number;
  endSeq: number;
  detectedAt: number;
}

// ============================================================================
// SyncEngine Implementation
// ============================================================================

class SyncEngine {
  private isRunningFlag = false;
  private activeSyncs = new Set<string>();
  private queueSize = 0; // Track offline queue size

  // Event callbacks
  private onSyncStartCallbacks: Array<(requestId: string) => void> = [];
  private onSyncCompleteCallbacks: Array<(requestId: string, result: SyncResult) => void> = [];
  private onSyncErrorCallbacks: Array<(requestId: string, error: Error) => void> = [];

  // SignalR reconnection handler cleanup function
  private removeReconnectionHandler: (() => void) | null = null;

  /**
   * Start the sync engine
   */
  async start(): Promise<void> {
    if (this.isRunningFlag) {
      console.log('[SyncEngine] Already running');
      return;
    }

    console.log('[SyncEngine] Starting...');
    this.isRunningFlag = true;

    // Set up SignalR reconnection handler to process offline queue
    this.setupSignalRReconnectionHandler();

    // Process offline queue on startup (in case any failed messages from previous session)
    await this.processOfflineQueue();
  }

  /**
   * Stop the sync engine
   */
  async stop(): Promise<void> {
    if (!this.isRunningFlag) {
      console.log('[SyncEngine] Already stopped');
      return;
    }

    console.log('[SyncEngine] Stopping...');
    this.isRunningFlag = false;

    // Remove SignalR reconnection handler
    if (this.removeReconnectionHandler) {
      this.removeReconnectionHandler();
      this.removeReconnectionHandler = null;
    }

    // Wait for active syncs to complete (max 5 seconds)
    const maxWait = 5000;
    const start = Date.now();

    while (this.activeSyncs.size > 0 && Date.now() - start < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (this.activeSyncs.size > 0) {
      console.warn(`[SyncEngine] ${this.activeSyncs.size} syncs still active`);
    }
  }

  /**
   * Check if sync engine is running
   */
  isRunning(): boolean {
    return this.isRunningFlag;
  }

  /**
   * Check if device is online using SignalR connection state
   *
   * Uses SignalR connection state as a proxy for network connectivity.
   * This is more reliable than window.online/offline events in desktop apps.
   *
   * @returns true if SignalR is connected (device is online)
   */
  isOnline(): boolean {
    return signalRNotification.isConnected();
  }

  /**
   * Synchronize a chat with the server (delta sync)
   *
   * Flow:
   * 1. Get cached metadata (latestSequence)
   * 2. Fetch new messages since that sequence
   * 3. Merge with cache
   * 4. Detect gaps
   * 5. Fill gaps if found
   *
   * @param requestId - Request ID to sync
   * @param options - Sync options
   * @returns Sync result with statistics
   */
  async syncChat(requestId: string, options?: SyncOptions): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      success: false,
      requestId,
      messagesAdded: 0,
      messagesUpdated: 0,
      gapsDetected: 0,
      gapsFilled: 0,
      syncDuration: 0,
    };

    cacheLogger.logSyncStart(requestId, options);

    // Prevent concurrent syncs for same chat
    if (this.activeSyncs.has(requestId)) {
      console.log(`[SyncEngine] Sync already in progress for ${requestId}`);
      return result;
    }

    this.activeSyncs.add(requestId);
    this.notifySyncStart(requestId);

    try {
      // Get cached metadata
      const meta = await messageCache.getChatMeta(requestId);

      // If force full sync or no cache, do full resync
      if (options?.forceFullSync || !meta) {
        return await this.fullResync(requestId);
      }

      // T054: Check cache expiry - trigger full resync if cache is too old
      const cacheAgeMs = Date.now() - meta.lastSyncedAt;
      const maxCacheAgeMs = CACHE_LIMITS.MESSAGE_TTL_DAYS * 24 * 60 * 60 * 1000;

      if (cacheAgeMs > maxCacheAgeMs) {
        console.log(
          `[SyncEngine] Cache expired for ${requestId} ` +
          `(age: ${Math.round(cacheAgeMs / (60 * 60 * 1000))}h, max: ${CACHE_LIMITS.MESSAGE_TTL_DAYS}d) ` +
          `- triggering full resync`
        );
        return await this.fullResync(requestId);
      }

      // T056: Check gap threshold - trigger full resync if too many gaps
      if (meta.knownGaps && meta.knownGaps.length > CACHE_LIMITS.MAX_GAPS_BEFORE_RESYNC) {
        console.log(
          `[SyncEngine] Gap threshold exceeded for ${requestId} ` +
          `(${meta.knownGaps.length} gaps > ${CACHE_LIMITS.MAX_GAPS_BEFORE_RESYNC}) ` +
          `- triggering full resync`
        );
        return await this.fullResync(requestId);
      }

      const latestSequence = meta.latestSequence || 0;

      // Fetch delta messages
      console.log(`[SyncEngine] Syncing ${requestId} from sequence ${latestSequence}`);

      const deltaResponse = await getMessagesCursor({
        requestId,
        limit: options?.maxMessages || 100,
        beforeSequence: latestSequence,
      });

      // Add new messages to cache
      if (deltaResponse.messages.length > 0) {
        await messageCache.cacheMessages(requestId, deltaResponse.messages);
        result.messagesAdded = deltaResponse.messages.length;
      }

      // Detect and fill gaps
      const gaps = await this.detectGaps(requestId);
      result.gapsDetected = gaps.length;

      if (gaps.length > 0) {
        console.log(`[SyncEngine] Detected ${gaps.length} gaps in ${requestId}`);
        cacheLogger.logGapDetected(requestId, gaps.length);
        await this.fillGaps(requestId);
        result.gapsFilled = gaps.length;
      }

      result.success = true;
      result.syncDuration = Date.now() - startTime;

      console.log(
        `[SyncEngine] Sync complete for ${requestId}: ` +
        `+${result.messagesAdded} msgs, ${result.gapsFilled} gaps filled ` +
        `(${result.syncDuration}ms)`
      );

      cacheLogger.logSyncComplete(requestId, result.syncDuration, result.messagesAdded, { type: 'delta' });
      cacheStats.recordSync(result.messagesAdded, result.syncDuration);

      this.notifySyncComplete(requestId, result);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      result.error = err.message;
      result.syncDuration = Date.now() - startTime;

      console.error(`[SyncEngine] Sync failed for ${requestId}:`, err);
      cacheLogger.logSyncError(requestId, err.message, result.syncDuration);
      cacheStats.recordSyncError();
      this.notifySyncError(requestId, err);

      return result;
    } finally {
      this.activeSyncs.delete(requestId);
    }
  }

  /**
   * Perform a full resync (clear cache and reload all messages)
   *
   * @param requestId - Request ID to resync
   * @returns Sync result
   */
  async fullResync(requestId: string): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      success: false,
      requestId,
      messagesAdded: 0,
      messagesUpdated: 0,
      gapsDetected: 0,
      gapsFilled: 0,
      syncDuration: 0,
    };

    console.log(`[SyncEngine] Full resync for ${requestId}`);
    cacheLogger.log({
      operation: 'full_resync' as any,
      requestId,
    });

    try {
      // Clear existing cache
      await messageCache.clearChat(requestId);

      // Fetch latest 100 messages
      const response = await getMessagesCursor({
        requestId,
        limit: 100,
      });

      // Cache messages
      if (response.messages.length > 0) {
        await messageCache.cacheMessages(requestId, response.messages);
        result.messagesAdded = response.messages.length;
      }

      result.success = true;
      result.syncDuration = Date.now() - startTime;

      console.log(
        `[SyncEngine] Full resync complete for ${requestId}: ` +
        `${result.messagesAdded} messages loaded (${result.syncDuration}ms)`
      );

      cacheLogger.logSyncComplete(requestId, result.syncDuration, result.messagesAdded, { type: 'full_resync' });
      cacheStats.recordSync(result.messagesAdded, result.syncDuration);

      this.notifySyncComplete(requestId, result);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      result.error = err.message;
      result.syncDuration = Date.now() - startTime;

      console.error(`[SyncEngine] Full resync failed for ${requestId}:`, err);
      cacheLogger.logSyncError(requestId, err.message, result.syncDuration);
      cacheStats.recordSyncError();
      this.notifySyncError(requestId, err);

      return result;
    }
  }

  /**
   * Detect missing sequence numbers in cached messages
   *
   * @param requestId - Request ID to check
   * @returns Array of detected gaps
   */
  async detectGaps(requestId: string): Promise<SequenceGap[]> {
    try {
      const cachedMessages = await messageCache.getCachedMessages(requestId);

      if (cachedMessages.length < 2) {
        return [];
      }

      const gaps: SequenceGap[] = [];
      const sortedMessages = cachedMessages.sort((a, b) =>
        (a.sequenceNumber || 0) - (b.sequenceNumber || 0)
      );

      // Find gaps in sequence numbers
      for (let i = 1; i < sortedMessages.length; i++) {
        const prevSeq = sortedMessages[i - 1].sequenceNumber || 0;
        const currSeq = sortedMessages[i].sequenceNumber || 0;

        // Gap detected (sequences should be consecutive)
        if (currSeq > prevSeq + 1) {
          gaps.push({
            startSeq: prevSeq + 1,
            endSeq: currSeq - 1,
            detectedAt: Date.now(),
          });
        }
      }

      return gaps;
    } catch (error) {
      console.error(`[SyncEngine] Gap detection failed for ${requestId}:`, error);
      return [];
    }
  }

  /**
   * Fill detected gaps by fetching missing ranges
   *
   * @param requestId - Request ID to fill gaps for
   */
  async fillGaps(requestId: string): Promise<void> {
    try {
      const gaps = await this.detectGaps(requestId);

      if (gaps.length === 0) {
        return;
      }

      console.log(`[SyncEngine] Filling ${gaps.length} gaps for ${requestId}`);

      // Fetch and cache each gap range
      // Note: This will use the range query API once implemented
      // For now, we'll do a full resync if gaps are detected
      await this.fullResync(requestId);

      console.log(`[SyncEngine] Gaps filled for ${requestId}`);
    } catch (error) {
      console.error(`[SyncEngine] Gap filling failed for ${requestId}:`, error);
      throw error;
    }
  }

  // ============================================================================
  // Network Status Handling
  // ============================================================================

  /**
   * Set up SignalR reconnection handler to process offline queue
   *
   * When SignalR reconnects after being offline, automatically process
   * any queued offline operations.
   */
  private setupSignalRReconnectionHandler(): void {
    console.log('[SyncEngine] Setting up SignalR reconnection handler');

    // Register handler for SignalR reconnection
    signalRNotification.setGlobalHandlers({
      onReconnected: async () => {
        console.log('[SyncEngine] SignalR reconnected, processing offline queue');
        await this.processOfflineQueue();
      },
    });

    // Store cleanup function (setGlobalHandlers doesn't return a cleanup function,
    // so we'll just set it to null when stopping)
    this.removeReconnectionHandler = () => {
      console.log('[SyncEngine] Removing SignalR reconnection handler');
      signalRNotification.setGlobalHandlers({});
    };
  }

  // ============================================================================
  // Offline Queue
  // ============================================================================

  /**
   * Queue an offline operation for later processing
   *
   * Stores the operation in IndexedDB and updates the queue size counter.
   * Operations are automatically processed when the device comes back online.
   *
   * @param operation - Operation to queue (without id, createdAt, status, retryCount)
   */
  async queueOperation(
    operation: Omit<OfflineOperation, 'id' | 'createdAt' | 'status' | 'retryCount'>
  ): Promise<void> {
    try {
      const db = await messageCache.getDB();
      const offlineQueueStore = 'offline_queue';

      // Check if offline_queue store exists
      if (!db.objectStoreNames.contains(offlineQueueStore)) {
        console.warn('[SyncEngine] offline_queue store not found, skipping queue operation');
        return;
      }

      const offlineOperation: OfflineOperation = {
        ...operation,
        id: `${operation.type}-${operation.requestId}-${Date.now()}`,
        createdAt: Date.now(),
        status: 'pending',
        retryCount: 0,
        attemptedAt: null,
        nextRetryAt: null,
        lastError: null,
      };

      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([offlineQueueStore], 'readwrite');
        const store = transaction.objectStore(offlineQueueStore);

        const request = store.add(offlineOperation);

        request.onsuccess = () => {
          console.log(`[SyncEngine] Queued operation: ${offlineOperation.id}`);
          this.queueSize++;
          resolve();
        };

        request.onerror = () => {
          console.error('[SyncEngine] Failed to queue operation:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('[SyncEngine] queueOperation error:', error);
      throw error;
    }
  }

  /**
   * Process all pending offline operations
   *
   * Attempts to send all queued operations to the server.
   * Implements exponential backoff retry logic for failed operations.
   * Automatically called on SignalR reconnection.
   */
  async processOfflineQueue(): Promise<void> {
    try {
      const db = await messageCache.getDB();
      const offlineQueueStore = 'offline_queue';

      // Check if offline_queue store exists
      if (!db.objectStoreNames.contains(offlineQueueStore)) {
        console.log('[SyncEngine] offline_queue store not found, nothing to process');
        return;
      }

      // Get all pending operations
      const pendingOperations = await this.getPendingOperations(db, offlineQueueStore);

      if (pendingOperations.length === 0) {
        console.log('[SyncEngine] No pending operations to process');
        return;
      }

      console.log(`[SyncEngine] Processing ${pendingOperations.length} pending operations`);

      let processed = 0;
      let failed = 0;

      for (const operation of pendingOperations) {
        try {
          // Check if operation is ready for retry (respect nextRetryAt)
          if (operation.nextRetryAt && operation.nextRetryAt > Date.now()) {
            console.log(`[SyncEngine] Operation ${operation.id} not ready for retry yet`);
            continue;
          }

          // Update operation status to syncing
          await this.updateOperationStatus(db, offlineQueueStore, operation.id, 'syncing');

          // Execute the operation
          const success = await this.executeOperation(operation);

          if (success) {
            // Remove successful operation from queue
            await this.removeOperation(db, offlineQueueStore, operation.id);
            this.queueSize--;
            processed++;
            console.log(`[SyncEngine] Operation ${operation.id} completed successfully`);
          } else {
            // Increment retry count and calculate next retry time
            operation.retryCount++;
            operation.attemptedAt = Date.now();

            if (operation.retryCount >= operation.maxRetries) {
              // Mark as permanently failed
              await this.updateOperationStatus(db, offlineQueueStore, operation.id, 'failed');
              failed++;
              console.error(`[SyncEngine] Operation ${operation.id} failed permanently`);
            } else {
              // Calculate exponential backoff: 2^retryCount seconds, max 5 minutes
              const backoffMs = Math.min(Math.pow(2, operation.retryCount) * 1000, 5 * 60 * 1000);
              operation.nextRetryAt = Date.now() + backoffMs;
              operation.lastError = 'Request failed';

              await this.updateOperation(db, offlineQueueStore, operation);
              console.log(
                `[SyncEngine] Operation ${operation.id} failed, retry ${operation.retryCount}/${operation.maxRetries} in ${backoffMs}ms`
              );
            }
          }
        } catch (error) {
          console.error(`[SyncEngine] Error processing operation ${operation.id}:`, error);

          // Update operation with error
          operation.retryCount++;
          operation.attemptedAt = Date.now();
          operation.lastError = error instanceof Error ? error.message : String(error);

          if (operation.retryCount >= operation.maxRetries) {
            await this.updateOperationStatus(db, offlineQueueStore, operation.id, 'failed');
            failed++;
          } else {
            const backoffMs = Math.min(Math.pow(2, operation.retryCount) * 1000, 5 * 60 * 1000);
            operation.nextRetryAt = Date.now() + backoffMs;
            await this.updateOperation(db, offlineQueueStore, operation);
          }
        }
      }

      console.log(
        `[SyncEngine] Queue processing complete: ${processed} succeeded, ${failed} failed`
      );
    } catch (error) {
      console.error('[SyncEngine] processOfflineQueue error:', error);
      throw error;
    }
  }

  /**
   * Get the current size of the offline queue
   *
   * @returns Number of pending operations in the queue
   */
  getQueueSize(): number {
    return this.queueSize;
  }

  /**
   * Get all pending operations from the queue
   */
  private async getPendingOperations(
    db: IDBDatabase,
    storeName: string
  ): Promise<OfflineOperation[]> {
    return new Promise<OfflineOperation[]>((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index('by_status');
      const request = index.getAll('pending');

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Execute a single offline operation
   */
  private async executeOperation(operation: OfflineOperation): Promise<boolean> {
    try {
      switch (operation.type) {
        case 'send_message':
          return await this.executeSendMessage(operation);
        case 'mark_read':
          return await this.executeMarkRead(operation);
        default:
          console.warn(`[SyncEngine] Unknown operation type: ${operation.type}`);
          return false;
      }
    } catch (error) {
      console.error(`[SyncEngine] executeOperation error:`, error);
      return false;
    }
  }

  /**
   * Execute a send_message operation
   */
  private async executeSendMessage(operation: OfflineOperation): Promise<boolean> {
    const payload = operation.payload;

    if (payload.type !== 'send_message') {
      return false;
    }

    try {
      await sendMessage({
        requestId: operation.requestId,
        content: payload.content,
        tempId: payload.tempId,
        isScreenshot: payload.isScreenshot,
        screenshotFileName: payload.screenshotFileName,
      });

      return true;
    } catch (error) {
      console.error(`[SyncEngine] Failed to send message:`, error);
      return false;
    }
  }

  /**
   * Execute a mark_read operation
   */
  private async executeMarkRead(operation: OfflineOperation): Promise<boolean> {
    const payload = operation.payload;

    if (payload.type !== 'mark_read') {
      return false;
    }

    try {
      await markMessagesAsRead(operation.requestId);
      return true;
    } catch (error) {
      console.error(`[SyncEngine] Failed to mark as read:`, error);
      return false;
    }
  }

  /**
   * Update operation status
   */
  private async updateOperationStatus(
    db: IDBDatabase,
    storeName: string,
    operationId: string,
    status: 'pending' | 'syncing' | 'completed' | 'failed'
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const getRequest = store.get(operationId);

      getRequest.onsuccess = () => {
        const operation = getRequest.result;
        if (operation) {
          operation.status = status;
          const putRequest = store.put(operation);

          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve();
        }
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  /**
   * Update operation with new data
   */
  private async updateOperation(
    db: IDBDatabase,
    storeName: string,
    operation: OfflineOperation
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(operation);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Remove operation from queue
   */
  private async removeOperation(
    db: IDBDatabase,
    storeName: string,
    operationId: string
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(operationId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // ============================================================================
  // Full Download All Chats (T070, T071)
  // ============================================================================

  /**
   * Download all chats for offline access (T070)
   *
   * Iterates through all cached chats and syncs them sequentially.
   * Respects 500MB storage limit - stops if limit reached.
   *
   * @param onProgress - Callback for progress updates (current, total, chatId)
   * @param onCancelled - Check if operation should be cancelled
   * @returns Summary of download results
   */
  async fullDownloadAllChats(
    onProgress?: (current: number, total: number, chatId: string) => void,
    onCancelled?: () => boolean
  ): Promise<{
    success: boolean;
    downloaded: number;
    total: number;
    error?: string;
  }> {
    const STORAGE_LIMIT_BYTES = 500 * 1024 * 1024; // 500MB

    try {
      // Get list of all cached chat IDs
      const { messageCache } = await import('./message-cache');
      const stats = await messageCache.getDetailedStats();
      const chatIds = stats.chatBreakdown.map((c) => c.requestId);

      if (chatIds.length === 0) {
        return {
          success: true,
          downloaded: 0,
          total: 0,
        };
      }

      console.log(`[SyncEngine] Starting full download of ${chatIds.length} chats`);

      let downloadedCount = 0;

      // Sequential sync of each chat
      for (const chatId of chatIds) {
        // Check if cancelled (T071)
        if (onCancelled && onCancelled()) {
          console.log('[SyncEngine] Full download cancelled by user');
          return {
            success: false,
            downloaded: downloadedCount,
            total: chatIds.length,
            error: 'Cancelled by user',
          };
        }

        // Check storage limit before each download (T070)
        const currentUsage = await messageCache.getDetailedStats();
        if (currentUsage.totalSize >= STORAGE_LIMIT_BYTES) {
          console.warn('[SyncEngine] Storage limit reached, stopping download');
          return {
            success: false,
            downloaded: downloadedCount,
            total: chatIds.length,
            error: 'Storage limit (500MB) reached',
          };
        }

        // Notify progress
        onProgress?.(downloadedCount + 1, chatIds.length, chatId);

        // Sync the chat
        const result = await this.syncChat(chatId, { maxMessages: 100 });

        if (result.success) {
          downloadedCount++;
        } else {
          console.error(`[SyncEngine] Failed to sync chat ${chatId}:`, result.error);
        }

        // Small delay to avoid overwhelming the server
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      console.log(`[SyncEngine] Full download complete: ${downloadedCount}/${chatIds.length} chats`);

      return {
        success: true,
        downloaded: downloadedCount,
        total: chatIds.length,
      };
    } catch (error) {
      console.error('[SyncEngine] Full download failed:', error);
      return {
        success: false,
        downloaded: 0,
        total: 0,
        error: error instanceof Error ? error.message : 'Download failed',
      };
    }
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  /**
   * Register callback for sync start
   */
  onSyncStart(callback: (requestId: string) => void): () => void {
    this.onSyncStartCallbacks.push(callback);
    return () => {
      const index = this.onSyncStartCallbacks.indexOf(callback);
      if (index > -1) {
        this.onSyncStartCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Register callback for sync complete
   */
  onSyncComplete(callback: (requestId: string, result: SyncResult) => void): () => void {
    this.onSyncCompleteCallbacks.push(callback);
    return () => {
      const index = this.onSyncCompleteCallbacks.indexOf(callback);
      if (index > -1) {
        this.onSyncCompleteCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Register callback for sync error
   */
  onSyncError(callback: (requestId: string, error: Error) => void): () => void {
    this.onSyncErrorCallbacks.push(callback);
    return () => {
      const index = this.onSyncErrorCallbacks.indexOf(callback);
      if (index > -1) {
        this.onSyncErrorCallbacks.splice(index, 1);
      }
    };
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private notifySyncStart(requestId: string): void {
    for (const callback of this.onSyncStartCallbacks) {
      try {
        callback(requestId);
      } catch (error) {
        console.error('[SyncEngine] Error in syncStart callback:', error);
      }
    }
  }

  private notifySyncComplete(requestId: string, result: SyncResult): void {
    for (const callback of this.onSyncCompleteCallbacks) {
      try {
        callback(requestId, result);
      } catch (error) {
        console.error('[SyncEngine] Error in syncComplete callback:', error);
      }
    }
  }

  private notifySyncError(requestId: string, error: Error): void {
    for (const callback of this.onSyncErrorCallbacks) {
      try {
        callback(requestId, error);
      } catch (err) {
        console.error('[SyncEngine] Error in syncError callback:', err);
      }
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const syncEngine = new SyncEngine();

export default syncEngine;
