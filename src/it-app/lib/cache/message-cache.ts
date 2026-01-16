/**
 * MessageCache - CRUD operations for cached messages and chat metadata
 *
 * Implements local cache layer for WhatsApp-style message sync.
 * Provides efficient storage, retrieval, and gap detection for chat messages.
 *
 * @module cache-message
 * @version 3.0.0
 */

import { openCacheDB, type IDBPDatabase, type DBSchema } from './db';
import type { CachedMessage, ChatSyncState, SequenceGap } from './schemas';
import { STORE_NAMES, CACHE_LIMITS } from './schemas';
import { cacheLogger } from './cache-logger';
import { cacheStats } from './cache-stats';

export class MessageCache {
  constructor(private userId: string) {}

  /**
   * Get the database instance (required for MessageCacheInterface)
   */
  async getDB(): Promise<IDBPDatabase<DBSchema>> {
    return openCacheDB(this.userId);
  }

  // ===========================================================================
  // CRUD Operations
  // ===========================================================================

  /**
   * Get a single message by ID
   */
  async getMessage(id: string): Promise<CachedMessage | null> {
    const db = await this.getDB();
    return (await db.get(STORE_NAMES.MESSAGES, id)) || null;
  }

  /**
   * Get message by client temp ID (for optimistic UI updates)
   * Note: This scans all messages - consider adding index on tempId for production
   */
  async getByTempId(tempId: string): Promise<CachedMessage | null> {
    const db = await this.getDB();

    // Need to scan since tempId is not indexed
    // In production, add index on tempId for better performance
    const messages = await db.getAll(STORE_NAMES.MESSAGES);
    return messages.find((m) => m.tempId === tempId || m.clientTempId === tempId) || null;
  }

  /**
   * Get all cached messages for a specific chat
   * T051: Now uses paginated reads internally for better performance
   */
  async getCachedMessages(requestId: string): Promise<CachedMessage[]> {
    const startTime = performance.now();
    const db = await this.getDB();
    const allMessages = await db.getAllFromIndex(STORE_NAMES.MESSAGES, 'by_request', requestId);

    const duration = performance.now() - startTime;

    // Track cache statistics
    if (allMessages.length > 0) {
      cacheStats.recordHit(allMessages.length);
      cacheLogger.logCacheHit(requestId, allMessages.length, duration);
    } else {
      cacheStats.recordMiss();
      cacheLogger.logCacheMiss(requestId);
    }

    // Sort by sequence number for consistent ordering
    return allMessages.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  }

  /**
   * T051: Get paginated messages for a specific chat
   * Efficiently loads messages in chunks to avoid blocking the main thread
   *
   * @param requestId - The service request ID
   * @param offset - Starting offset (default: 0)
   * @param limit - Maximum number of messages to return (default: 100)
   * @returns Array of cached messages sorted by sequence number
   */
  async getCachedMessagesPaginated(
    requestId: string,
    offset: number = 0,
    limit: number = 100
  ): Promise<CachedMessage[]> {
    const db = await this.getDB();

    // Get all messages for the request (IndexedDB doesn't support offset/limit on indexes)
    // Future optimization: Use cursor-based pagination for better performance
    const allMessages = await db.getAllFromIndex(STORE_NAMES.MESSAGES, 'by_request', requestId);

    // Sort by sequence number for consistent ordering
    const sorted = allMessages.sort((a, b) => a.sequenceNumber - b.sequenceNumber);

    // Apply pagination
    return sorted.slice(offset, offset + limit);
  }

  /**
   * T051: Get messages with a specific sequence number range (optimized)
   * Uses cursor-based approach for efficient range queries
   *
   * @param requestId - The service request ID
   * @param startSeq - Starting sequence number (inclusive)
   * @param endSeq - Ending sequence number (inclusive)
   * @param limit - Maximum number of messages to return (default: 100)
   * @returns Array of cached messages in the sequence range
   */
  async getCachedMessagesBySequenceRange(
    requestId: string,
    startSeq: number,
    endSeq: number,
    limit: number = 100
  ): Promise<CachedMessage[]> {
    const db = await this.getDB();

    // Use the compound index for efficient range queries
    const tx = db.transaction(STORE_NAMES.MESSAGES, 'readonly');
    const index = tx.store.index('by_request_sequence');

    const messages: CachedMessage[] = [];

    // Open cursor for the specific range
    const range = IDBKeyRange.bound(
      [requestId, startSeq],
      [requestId, endSeq],
      false,
      false
    );

    let cursor = await index.openCursor(range);
    let count = 0;

    while (cursor && count < limit) {
      messages.push(cursor.value);
      count++;
      cursor = await cursor.continue();
    }

    await tx.done;
    return messages;
  }

  /**
   * T051: Get message count for a specific chat
   * Useful for determining total pages in pagination
   *
   * @param requestId - The service request ID
   * @returns Total number of cached messages for this chat
   */
  async getCachedMessageCount(requestId: string): Promise<number> {
    const db = await this.getDB();
    const messages = await db.getAllFromIndex(STORE_NAMES.MESSAGES, 'by_request', requestId);
    return messages.length;
  }

  /**
   * T051: Get newest N messages for a specific chat
   * Optimized for loading the most recent messages first
   *
   * @param requestId - The service request ID
   * @param limit - Maximum number of messages to return (default: 50)
   * @returns Array of the newest cached messages sorted by sequence number
   */
  async getNewestMessages(requestId: string, limit: number = 50): Promise<CachedMessage[]> {
    const db = await this.getDB();

    // Get all messages for the request
    const allMessages = await db.getAllFromIndex(STORE_NAMES.MESSAGES, 'by_request', requestId);

    // Sort by sequence number (descending for newest first)
    const sorted = allMessages.sort((a, b) => b.sequenceNumber - a.sequenceNumber);

    // Return newest N messages, then sort back to ascending
    return sorted.slice(0, limit).sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  }

  /**
   * T051: Get oldest N messages for a specific chat
   * Optimized for scrolling to top and loading history
   *
   * @param requestId - The service request ID
   * @param limit - Maximum number of messages to return (default: 50)
   * @returns Array of the oldest cached messages sorted by sequence number
   */
  async getOldestMessages(requestId: string, limit: number = 50): Promise<CachedMessage[]> {
    const db = await this.getDB();

    // Get all messages for the request
    const allMessages = await db.getAllFromIndex(STORE_NAMES.MESSAGES, 'by_request', requestId);

    // Sort by sequence number (ascending for oldest first)
    const sorted = allMessages.sort((a, b) => a.sequenceNumber - b.sequenceNumber);

    // Return oldest N messages
    return sorted.slice(0, limit);
  }

  /**
   * Get messages in a sequence number range
   */
  async getCachedMessagesRange(
    requestId: string,
    startSeq: number,
    endSeq: number
  ): Promise<CachedMessage[]> {
    const db = await this.getDB();
    const allMessages = await this.getCachedMessages(requestId);

    return allMessages.filter((m) => m.sequenceNumber >= startSeq && m.sequenceNumber <= endSeq);
  }

  /**
   * Add a single message to cache
   */
  async addMessage(message: CachedMessage): Promise<void> {
    const db = await this.getDB();
    await db.put(STORE_NAMES.MESSAGES, message);

    // Estimate message size (rough approximation)
    const bytes = JSON.stringify(message).length;
    cacheStats.recordWrite(1, bytes);
    cacheLogger.log({
      operation: 'add_message' as any,
      requestId: message.requestId,
      metadata: { messageId: message.id, bytes },
    });
  }

  /**
   * Add multiple messages efficiently in a single transaction
   */
  async addMessagesBatch(messages: CachedMessage[]): Promise<void> {
    if (messages.length === 0) return;

    const startTime = performance.now();
    const db = await this.getDB();
    const tx = db.transaction(STORE_NAMES.MESSAGES, 'readwrite');

    await Promise.all([
      ...messages.map((m) => tx.store.put(m)),
      tx.done,
    ]);

    const duration = performance.now() - startTime;

    // Estimate total bytes
    const bytes = messages.reduce((sum, m) => sum + JSON.stringify(m).length, 0);
    cacheStats.recordBatchWrite(messages.length, bytes);

    cacheLogger.log({
      operation: 'add_batch' as any,
      requestId: messages[0]?.requestId,
      duration,
      messageCount: messages.length,
      metadata: { totalBytes: bytes },
    });
  }

  /**
   * Update an existing message
   */
  async updateMessage(message: CachedMessage): Promise<void> {
    const db = await this.getDB();
    await db.put(STORE_NAMES.MESSAGES, message);
  }

  /**
   * Replace optimistic message with real message from server
   * This is called when a temp message is confirmed by the server
   */
  async replaceOptimisticMessage(tempId: string, realMessage: CachedMessage): Promise<void> {
    const db = await this.getDB();

    // First find and remove the temp message
    const tempMsg = await this.getByTempId(tempId);
    if (tempMsg) {
      await db.delete(STORE_NAMES.MESSAGES, tempMsg.id);
    }

    // Add the real message
    await db.put(STORE_NAMES.MESSAGES, realMessage);
  }

  // ===========================================================================
  // Sync State Management
  // ===========================================================================

  /**
   * Get sync state for a chat
   */
  async getChatMeta(requestId: string): Promise<ChatSyncState | null> {
    const db = await this.getDB();
    return (await db.get(STORE_NAMES.CHAT_META, requestId)) || null;
  }

  /**
   * Update sync checkpoint for a chat
   */
  async updateSyncState(requestId: string, updates: Partial<ChatSyncState>): Promise<void> {
    const db = await this.getDB();
    const existing = await this.getChatMeta(requestId);

    const updated: ChatSyncState = existing
      ? { ...existing, ...updates }
      : {
          requestId,
          lastSyncedSequence: 0,
          lastSyncedAt: Date.now(),
          totalMessageCount: 0,
          knownGaps: [],
          unreadCount: 0,
          lastReadSequence: 0,
          lastReadAt: null,
          messageCount: 0,
          mediaSize: 0,
          lastAccessedAt: Date.now(),
          serverRevision: null,
          ...updates,
        };

    await db.put(STORE_NAMES.CHAT_META, updated);
  }

  // ===========================================================================
  // Gap Detection
  // ===========================================================================

  /**
   * Detect sequence number gaps in cached messages
   * Returns sorted array of gaps that need to be filled
   */
  async detectGaps(requestId: string): Promise<SequenceGap[]> {
    const messages = await this.getCachedMessages(requestId);

    if (messages.length < 2) return [];

    // Sort by sequence number
    const sorted = [...messages].sort((a, b) => a.sequenceNumber - b.sequenceNumber);

    const gaps: SequenceGap[] = [];

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1].sequenceNumber;
      const curr = sorted[i].sequenceNumber;

      // If there's a gap in sequence numbers
      if (curr > prev + 1) {
        gaps.push({
          startSeq: prev + 1,
          endSeq: curr - 1,
          detectedAt: Date.now(),
        });
      }
    }

    return gaps;
  }

  /**
   * Record a detected gap in chat metadata
   */
  async recordGap(requestId: string, gap: SequenceGap): Promise<void> {
    const meta = await this.getChatMeta(requestId);
    const gaps = meta?.knownGaps || [];

    // Check if this gap already exists
    const exists = gaps.some(
      (g) => g.startSeq === gap.startSeq && g.endSeq === gap.endSeq
    );

    if (!exists) {
      gaps.push(gap);
      await this.updateSyncState(requestId, { knownGaps: gaps });
    }
  }

  /**
   * Clear a gap after it has been filled
   */
  async clearGap(requestId: string, gap: SequenceGap): Promise<void> {
    const meta = await this.getChatMeta(requestId);
    if (!meta) return;

    const gaps = meta.knownGaps.filter(
      (g) => !(g.startSeq === gap.startSeq && g.endSeq === gap.endSeq)
    );

    await this.updateSyncState(requestId, { knownGaps: gaps });
  }

  // ===========================================================================
  // Cache Cleanup
  // ===========================================================================

  /**
   * Clear all data (messages and metadata) for a specific chat
   */
  async clearChat(requestId: string): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction([STORE_NAMES.MESSAGES, STORE_NAMES.CHAT_META], 'readwrite');

    // Delete all messages for this request
    const messages = await tx
      .objectStore(STORE_NAMES.MESSAGES)
      .index('by_request')
      .getAll(requestId);

    await Promise.all([
      ...messages.map((m) => tx.objectStore(STORE_NAMES.MESSAGES).delete(m.id)),
      tx.objectStore(STORE_NAMES.CHAT_META).delete(requestId),
      tx.done,
    ]);
  }

  /**
   * Clear all cached data across all chats
   * Useful for logout or full reset
   */
  async clearAll(): Promise<void> {
    const db = await this.getDB();
    await Promise.all([
      db.clear(STORE_NAMES.MESSAGES),
      db.clear(STORE_NAMES.CHAT_META),
      db.clear(STORE_NAMES.MEDIA_META),
      db.clear(STORE_NAMES.MEDIA_BLOBS),
      db.clear(STORE_NAMES.OFFLINE_QUEUE),
      db.clear(STORE_NAMES.CACHE_STATS),
    ]);
  }

  /**
   * Remove expired messages based on TTL
   * Returns number of messages deleted
   */
  async cleanupExpiredCache(maxAgeDays: number = CACHE_LIMITS.MESSAGE_TTL_DAYS): Promise<number> {
    const db = await this.getDB();
    const cutoffTime = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

    const tx = db.transaction(STORE_NAMES.MESSAGES, 'readwrite');
    const index = tx.store.index('by_cached_at');

    let deletedCount = 0;

    // Get all messages older than cutoff using idb's async cursor API
    let cursor = await index.openCursor(IDBKeyRange.upperBound(cutoffTime));

    while (cursor) {
      await cursor.delete();
      deletedCount++;
      cursor = await cursor.continue();
    }

    await tx.done;
    return deletedCount;
  }

  /**
   * Evict oldest chats to free up space
   * Returns number of chats evicted
   */
  async evictOldestChats(bytesToFree: number): Promise<number> {
    const db = await this.getDB();
    const tx = db.transaction([STORE_NAMES.CHAT_META, STORE_NAMES.MESSAGES], 'readwrite');

    const metaIndex = tx.objectStore(STORE_NAMES.CHAT_META).index('by_last_accessed');
    let evictedCount = 0;
    let freedBytes = 0;
    let totalMessagesDeleted = 0;

    // Use idb's async cursor API
    let cursor = await metaIndex.openCursor(null, 'next'); // Oldest first

    while (cursor && freedBytes < bytesToFree) {
      const meta = cursor.value as ChatSyncState;
      freedBytes += meta.mediaSize;

      // Delete all messages for this chat
      const msgs = await tx
        .objectStore(STORE_NAMES.MESSAGES)
        .index('by_request')
        .getAll(meta.requestId);

      totalMessagesDeleted += msgs.length;

      await Promise.all([
        ...msgs.map((m) => tx.objectStore(STORE_NAMES.MESSAGES).delete(m.id)),
        tx.objectStore(STORE_NAMES.CHAT_META).delete(meta.requestId),
      ]);

      // Log eviction
      cacheLogger.logEviction(meta.requestId, meta.mediaSize, msgs.length);
      cacheStats.recordEviction(meta.mediaSize, msgs.length);

      evictedCount++;
      cursor = await cursor.continue();
    }

    await tx.done;

    // Log summary
    console.log(
      `[MessageCache] Evicted ${evictedCount} chats, ` +
      `${totalMessagesDeleted} messages, ${Math.round(freedBytes / 1024)}KB freed`
    );

    return evictedCount;
  }

  /**
   * T057, T059: Perform cache maintenance on startup
   *
   * This should be called when the app initializes to:
   * 1. Remove expired messages (older than MESSAGE_TTL_DAYS)
   * 2. Log cache statistics for monitoring
   *
   * @returns Object containing cleanup results
   */
  async performStartupMaintenance(): Promise<{
    expiredMessagesRemoved: number;
    currentStats: {
      totalMessages: number;
      chatsCount: number;
      totalSize: number;
    };
  }> {
    console.log('[MessageCache] Running startup maintenance...');

    // Remove expired messages (T059)
    const expiredMessagesRemoved = await this.cleanupExpiredCache();

    if (expiredMessagesRemoved > 0) {
      console.log(`[MessageCache] Removed ${expiredMessagesRemoved} expired messages`);
    }

    // Get current stats
    const stats = await this.getStats();

    console.log(
      `[MessageCache] Current stats: ${stats.totalMessages} messages, ` +
      `${stats.chatsCount} chats, ~${Math.round(stats.totalSize / 1024)}KB`
    );

    return {
      expiredMessagesRemoved,
      currentStats: stats,
    };
  }

  // ===========================================================================
  // Statistics
  // ===========================================================================

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    totalMessages: number;
    chatsCount: number;
    totalSize: number;
  }> {
    const db = await this.getDB();

    const [messagesCount, chatsCount] = await Promise.all([
      db.count(STORE_NAMES.MESSAGES),
      db.count(STORE_NAMES.CHAT_META),
    ]);

    // Calculate approximate size (each message ~1KB average)
    const totalSize = messagesCount * 1024;

    return {
      totalMessages: messagesCount,
      chatsCount: chatsCount,
      totalSize,
    };
  }
}
