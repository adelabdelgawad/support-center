/**
 * IndexedDB Message Cache for Tauri App
 *
 * Provides instant chat loading by caching messages locally.
 * Based on WhatsApp pattern - show cached messages immediately,
 * then sync with server in background.
 *
 * Features:
 * - Instant message retrieval (sub-10ms)
 * - Automatic cache cleanup (7-day expiry)
 * - Sequence-based freshness tracking
 * - Offline support foundation
 */

import type { ChatMessage } from "@/types";
import { DB_VERSION as EXPECTED_DB_VERSION } from "./cache/schemas";
import { cacheLogger } from "./cache/cache-logger";
import { cacheStats } from "./cache/cache-stats";

const DB_NAME = "support-center-requester-cache";
const DB_VERSION = 3; // Bumped to 3 for offline queue support
const MESSAGES_STORE = "messages";
const CHAT_META_STORE = "chat_meta";
const OFFLINE_QUEUE_STORE = "offline_queue";
const CACHE_EXPIRY_DAYS = 7;

// ============================================================================
// Types
// ============================================================================

// Detailed cache statistics for per-chat breakdown (T067)
export interface ChatCacheStats {
  requestId: string;
  messageCount: number;
  mediaSize: number; // bytes
  lastSyncedAt: number; // timestamp
  lastAccessedAt: number; // timestamp
  totalSize: number; // bytes (messages + media)
}

// Overall cache statistics (T067)
export interface DetailedCacheStatistics {
  totalSize: number; // bytes
  totalSizeMB: number; // megabytes
  storageLimitMB: number;
  usagePercentage: number;
  totalChats: number;
  totalMessages: number;
  hitRate: number; // cache hit rate percentage
  lastSyncTimestamp: number; // most recent sync across all chats
  chatBreakdown: ChatCacheStats[]; // per-chat statistics
}

// Chat metadata for tracking freshness
interface ChatMeta {
  requestId: string;
  latestSequence: number;
  lastUpdated: number; // timestamp
  lastSyncedAt: number; // timestamp of last server sync
  messageCount: number;
  knownGaps?: import("./cache/schemas").SequenceGap[];
  lastAccessedAt?: number;
}

// Offline queue entry for failed messages
export interface OfflineQueueEntry {
  tempId: string;
  requestId: string;
  content: string;
  errorMessage: string;
  timestamp: number;
  retryCount: number;
}

/**
 * Serialize a ChatMessage for IndexedDB storage
 * Removes non-serializable properties and circular references
 */
function serializeMessage(message: ChatMessage): any {
  return {
    id: message.id,
    requestId: message.requestId,
    senderId: message.senderId,
    // Serialize sender object by extracting only primitive fields
    sender: message.sender ? {
      id: message.sender.id,
      username: message.sender.username,
      fullName: message.sender.fullName,
      isTechnician: message.sender.isTechnician,
    } : null,
    content: message.content,
    sequenceNumber: message.sequenceNumber,
    isScreenshot: message.isScreenshot,
    screenshotFileName: message.screenshotFileName,
    isRead: message.isRead,
    isReadByCurrentUser: message.isReadByCurrentUser,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
    readAt: message.readAt,
    readReceipt: message.readReceipt,
    status: message.status,
    tempId: message.tempId,
    clientTempId: message.clientTempId,
    isSystemMessage: message.isSystemMessage,
    _cachedAt: Date.now(),
  };
}

class MessageCacheService {
  private db: IDBDatabase | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;
  private currentDBVersion: number = DB_VERSION;

  // Cache hit tracking for statistics (T067)
  private cacheHits = 0;
  private cacheMisses = 0;

  /**
   * Check schema version compatibility
   * Returns true if schema version matches expected version
   *
   * T058: Schema version check on app startup
   */
  async checkSchemaVersion(): Promise<{ compatible: boolean; currentVersion: number; expectedVersion: number }> {
    try {
      // Check current version by opening DB without triggering upgrade
      const currentVersion = await this.getCurrentDBVersion();
      const expectedVersion = EXPECTED_DB_VERSION;

      console.log(
        `[MessageCache] Schema version check: current=${currentVersion}, expected=${expectedVersion}`
      );

      return {
        compatible: currentVersion === expectedVersion,
        currentVersion,
        expectedVersion,
      };
    } catch (error) {
      console.error('[MessageCache] Schema version check failed:', error);
      // Assume incompatible if check fails
      return {
        compatible: false,
        currentVersion: 0,
        expectedVersion: EXPECTED_DB_VERSION,
      };
    }
  }

  /**
   * Get the current IndexedDB schema version
   */
  private async getCurrentDBVersion(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      if (typeof window === "undefined" || !window.indexedDB) {
        reject(new Error("IndexedDB not available"));
        return;
      }

      const request = indexedDB.open(DB_NAME);

      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        const version = request.result.version;
        request.result.close();
        resolve(version);
      };

      // onupgradeneeded won't fire since we're not specifying a version
      request.onupgradeneeded = () => {
        // This shouldn't happen, but handle it
        request.result.close();
        resolve(request.result.version);
      };
    });
  }

  /**
   * Initialize IndexedDB database
   */
  async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof window === "undefined" || !window.indexedDB) {
        reject(new Error("IndexedDB not available"));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error("[MessageCache] Failed to open database:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create messages store with compound index
        if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
          const messagesStore = db.createObjectStore(MESSAGES_STORE, {
            keyPath: "id",
          });
          messagesStore.createIndex("by_request", "requestId", { unique: false });
          messagesStore.createIndex("by_request_sequence", ["requestId", "sequenceNumber"], {
            unique: false,
          });
        }

        // Create chat metadata store
        if (!db.objectStoreNames.contains(CHAT_META_STORE)) {
          db.createObjectStore(CHAT_META_STORE, { keyPath: "requestId" });
        }

        // V2: Create tickets store (shared with ticket-cache.ts)
        if (!db.objectStoreNames.contains("tickets")) {
          const ticketsStore = db.createObjectStore("tickets", {
            keyPath: "id",
          });
          ticketsStore.createIndex("by_status", "statusId", { unique: false });
          ticketsStore.createIndex("by_cached_at", "_cachedAt", { unique: false });
        }

        // V2: Create ticket metadata store
        if (!db.objectStoreNames.contains("ticket_meta")) {
          db.createObjectStore("ticket_meta", { keyPath: "key" });
        }

        // V3: Create offline queue store for offline operations
        if (!db.objectStoreNames.contains(OFFLINE_QUEUE_STORE)) {
          const offlineQueueStore = db.createObjectStore(OFFLINE_QUEUE_STORE, {
            keyPath: "id",
          });
          offlineQueueStore.createIndex("by_status", "status", { unique: false });
          offlineQueueStore.createIndex("by_created", "createdAt", { unique: false });
          offlineQueueStore.createIndex("by_next_retry", "nextRetryAt", { unique: false });
        }
      };
    });

    return this.dbPromise;
  }

  /**
   * Get cached messages for a chat
   * Returns messages sorted by sequence number
   */
  async getCachedMessages(requestId: string): Promise<ChatMessage[]> {
    const startTime = performance.now();
    try {
      const db = await this.getDB();

      return new Promise<ChatMessage[]>((resolve, reject) => {
        const transaction = db.transaction(MESSAGES_STORE, "readonly");
        const store = transaction.objectStore(MESSAGES_STORE);
        const index = store.index("by_request");
        const request = index.getAll(requestId);

        request.onsuccess = () => {
          const duration = performance.now() - startTime;
          const messages = (request.result || []) as ChatMessage[];
          // Sort by sequence number
          messages.sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));

          // Update cache hit tracking (T067)
          if (messages.length > 0) {
            this.cacheHits++;
            cacheStats.recordHit(messages.length);
            cacheLogger.logCacheHit(requestId, messages.length, duration);
          } else {
            this.cacheMisses++;
            cacheStats.recordMiss();
            cacheLogger.logCacheMiss(requestId);
          }

          resolve(messages);
        };

        request.onerror = () => {
          const duration = performance.now() - startTime;
          console.error("[MessageCache] Failed to get messages:", request.error);
          this.cacheMisses++;
          cacheStats.recordMiss();
          cacheLogger.log({
            operation: 'get_messages' as any,
            requestId,
            duration,
            error: request.error?.message,
          });
          reject(request.error);
        };
      });
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error("[MessageCache] getCachedMessages error:", error);
      this.cacheMisses++;
      cacheStats.recordMiss();
      cacheLogger.log({
        operation: 'get_messages' as any,
        requestId,
        duration,
        error: String(error),
      });
      return [];
    }
  }

  /**
   * Get paginated messages from cache (T052)
   * Reads messages in chunks for efficient large chat loading
   *
   * @param requestId - The ticket/chat ID
   * @param offset - Number of messages to skip (for pagination)
   * @param limit - Maximum number of messages to return (default: 100)
   * @param beforeSequence - Optional sequence number to fetch messages older than this
   * @returns Paginated messages sorted by sequence number
   */
  async getCachedMessagesPaginated(
    requestId: string,
    offset: number = 0,
    limit: number = 100,
    beforeSequence?: number
  ): Promise<{ messages: ChatMessage[]; hasMore: boolean; total: number }> {
    try {
      const db = await this.getDB();

      return new Promise<{ messages: ChatMessage[]; hasMore: boolean; total: number }>((resolve, reject) => {
        const transaction = db.transaction(MESSAGES_STORE, "readonly");
        const store = transaction.objectStore(MESSAGES_STORE);
        const index = store.index("by_request_sequence");

        let messages: ChatMessage[] = [];
        let hasMore = false;
        let totalCount = 0;

        // Use cursor for efficient pagination
        const range = beforeSequence
          ? IDBKeyRange.bound([requestId, 0], [requestId, beforeSequence])
          : IDBKeyRange.lowerBound([requestId, 0]);

        const request = index.openCursor(range, "prev"); // "prev" for newest-first

        let skipped = 0;
        let collected = 0;

        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            totalCount++;

            if (skipped < offset) {
              skipped++;
              cursor.continue();
              return;
            }

            if (collected < limit) {
              messages.push(cursor.value);
              collected++;
              cursor.continue();
            } else {
              // We've collected enough messages, but there might be more
              hasMore = true;
              cursor.continue();
            }
          } else {
            // Cursor exhausted - sort messages by sequence number (ascending)
            messages.sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));
            resolve({ messages, hasMore, total: totalCount });
          }
        };

        request.onerror = () => {
          console.error("[MessageCache] Failed to get paginated messages:", request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error("[MessageCache] getCachedMessagesPaginated error:", error);
      return { messages: [], hasMore: false, total: 0 };
    }
  }

  /**
   * Get total message count for a chat
   * Useful for pagination UI and loading indicators
   */
  async getMessageCount(requestId: string): Promise<number> {
    try {
      const db = await this.getDB();

      return new Promise<number>((resolve, reject) => {
        const transaction = db.transaction(MESSAGES_STORE, "readonly");
        const store = transaction.objectStore(MESSAGES_STORE);
        const index = store.index("by_request");
        const countRequest = index.count(requestId);

        countRequest.onsuccess = () => {
          resolve(countRequest.result);
        };

        countRequest.onerror = () => {
          console.error("[MessageCache] Failed to count messages:", countRequest.error);
          reject(countRequest.error);
        };
      });
    } catch (error) {
      console.error("[MessageCache] getMessageCount error:", error);
      return 0;
    }
  }

  /**
   * Get newest messages from cache (for initial load)
   * Returns the N most recent messages for instant chat display
   *
   * @param requestId - The ticket/chat ID
   * @param limit - Maximum number of messages to return (default: 100)
   * @returns Newest messages sorted by sequence number
   */
  async getNewestMessages(requestId: string, limit: number = 100): Promise<ChatMessage[]> {
    try {
      const db = await this.getDB();

      return new Promise<ChatMessage[]>((resolve, reject) => {
        const transaction = db.transaction(MESSAGES_STORE, "readonly");
        const store = transaction.objectStore(MESSAGES_STORE);
        const index = store.index("by_request_sequence");

        const range = IDBKeyRange.lowerBound([requestId, 0]);
        const request = index.openCursor(range, "prev"); // Newest first

        const messages: ChatMessage[] = [];

        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor && messages.length < limit) {
            messages.unshift(cursor.value); // Add to beginning for newest-first
            cursor.continue();
          } else {
            // Sort by sequence number (ascending = chronological)
            messages.sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));
            resolve(messages);
          }
        };

        request.onerror = () => {
          console.error("[MessageCache] Failed to get newest messages:", request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error("[MessageCache] getNewestMessages error:", error);
      return [];
    }
  }

  /**
   * Get chat metadata (latest sequence, last updated)
   */
  async getChatMeta(requestId: string): Promise<ChatMeta | null> {
    try {
      const db = await this.getDB();

      return new Promise<ChatMeta | null>((resolve, reject) => {
        const transaction = db.transaction(CHAT_META_STORE, "readonly");
        const store = transaction.objectStore(CHAT_META_STORE);
        const request = store.get(requestId);

        request.onsuccess = () => {
          const meta = request.result || null;

          // Update lastAccessedAt on read
          if (meta) {
            this.updateLastAccessedAt(requestId);
          }

          resolve(meta);
        };

        request.onerror = () => {
          console.error("[MessageCache] Failed to get chat meta:", request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error("[MessageCache] getChatMeta error:", error);
      return null;
    }
  }

  /**
   * Update lastAccessedAt timestamp for a chat
   */
  private async updateLastAccessedAt(requestId: string): Promise<void> {
    try {
      const db = await this.getDB();

      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(CHAT_META_STORE, "readwrite");
        const store = transaction.objectStore(CHAT_META_STORE);
        const getRequest = store.get(requestId);

        getRequest.onsuccess = () => {
          const meta = getRequest.result as ChatMeta | undefined;
          if (meta) {
            meta.lastAccessedAt = Date.now();
            store.put(meta);
          }
          resolve();
        };

        getRequest.onerror = () => {
          console.error("[MessageCache] Failed to update lastAccessedAt:", getRequest.error);
          reject(getRequest.error);
        };
      });
    } catch (error) {
      console.error("[MessageCache] updateLastAccessedAt error:", error);
    }
  }

  /**
   * Cache messages for a chat
   * Replaces all existing messages for this chat
   */
  async cacheMessages(requestId: string, messages: ChatMessage[]): Promise<void> {
    if (messages.length === 0) return;

    const startTime = performance.now();
    try {
      const db = await this.getDB();

      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([MESSAGES_STORE, CHAT_META_STORE], "readwrite");

        transaction.oncomplete = () => {
          const duration = performance.now() - startTime;
          const bytes = messages.reduce((sum, m) => sum + JSON.stringify(m).length, 0);
          cacheStats.recordBatchWrite(messages.length, bytes);
          cacheLogger.log({
            operation: 'add_batch' as any,
            requestId,
            duration,
            messageCount: messages.length,
            metadata: { totalBytes: bytes },
          });
          resolve();
        };

        transaction.onerror = () => {
          const duration = performance.now() - startTime;
          console.error("[MessageCache] Cache transaction failed:", transaction.error);
          cacheLogger.log({
            operation: 'add_batch' as any,
            requestId,
            duration,
            error: transaction.error?.message,
          });
          reject(transaction.error);
        };

        // Store messages (serialize to avoid DataCloneError)
        const messagesStore = transaction.objectStore(MESSAGES_STORE);
        for (const message of messages) {
          messagesStore.put(serializeMessage(message));
        }

        // Update chat metadata
        const metaStore = transaction.objectStore(CHAT_META_STORE);
        const latestSequence = Math.max(...messages.map((m) => m.sequenceNumber || 0));
        metaStore.put({
          requestId,
          latestSequence,
          lastUpdated: Date.now(),
          lastSyncedAt: Date.now(),
          messageCount: messages.length,
          lastAccessedAt: Date.now(),
          knownGaps: [],
        } as ChatMeta);
      });
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error("[MessageCache] cacheMessages error:", error);
      cacheLogger.log({
        operation: 'add_batch' as any,
        requestId,
        duration,
        error: String(error),
      });
    }
  }

  /**
   * Add a single message to the cache
   */
  async addMessage(message: ChatMessage): Promise<void> {
    try {
      const db = await this.getDB();

      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([MESSAGES_STORE, CHAT_META_STORE], "readwrite");

        transaction.oncomplete = () => {
          resolve();
        };

        transaction.onerror = () => {
          console.error("[MessageCache] Add message failed:", transaction.error);
          reject(transaction.error);
        };

        // Store message (serialize to avoid DataCloneError)
        const messagesStore = transaction.objectStore(MESSAGES_STORE);
        messagesStore.put(serializeMessage(message));

        // Update chat metadata sequence if this message is newer
        const metaStore = transaction.objectStore(CHAT_META_STORE);
        const getRequest = metaStore.get(message.requestId);

        getRequest.onsuccess = () => {
          const meta = getRequest.result as ChatMeta | undefined;
          const currentSequence = meta?.latestSequence || 0;

          if ((message.sequenceNumber || 0) > currentSequence) {
            metaStore.put({
              requestId: message.requestId,
              latestSequence: message.sequenceNumber || 0,
              lastUpdated: Date.now(),
              lastSyncedAt: Date.now(),
              messageCount: (meta?.messageCount || 0) + 1,
            } as ChatMeta);
          }
        };
      });
    } catch (error) {
      console.error("[MessageCache] addMessage error:", error);
    }
  }

  /**
   * Add multiple messages efficiently in a single transaction
   * Use this for batch syncs from server
   */
  async addMessagesBatch(messages: ChatMessage[]): Promise<void> {
    if (messages.length === 0) return;

    try {
      const db = await this.getDB();

      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([MESSAGES_STORE, CHAT_META_STORE], "readwrite");

        transaction.oncomplete = () => {
          resolve();
        };

        transaction.onerror = () => {
          console.error("[MessageCache] Batch add failed:", transaction.error);
          reject(transaction.error);
        };

        // Store all messages (serialize to avoid DataCloneError)
        const messagesStore = transaction.objectStore(MESSAGES_STORE);
        for (const message of messages) {
          messagesStore.put(serializeMessage(message));
        }

        // Update chat metadata
        const metaStore = transaction.objectStore(CHAT_META_STORE);

        // Group messages by requestId to update metadata for each chat
        const messagesByRequest = new Map<string, ChatMessage[]>();
        for (const message of messages) {
          if (!messagesByRequest.has(message.requestId)) {
            messagesByRequest.set(message.requestId, []);
          }
          messagesByRequest.get(message.requestId)!.push(message);
        }

        // Update metadata for each affected chat
        for (const [requestId, chatMessages] of messagesByRequest) {
          const getRequest = metaStore.get(requestId);

          getRequest.onsuccess = () => {
            const meta = getRequest.result as ChatMeta | undefined;
            const currentSequence = meta?.latestSequence || 0;
            const maxSequence = Math.max(
              currentSequence,
              ...chatMessages.map((m) => m.sequenceNumber || 0)
            );

            metaStore.put({
              requestId,
              latestSequence: maxSequence,
              lastUpdated: Date.now(),
              lastSyncedAt: Date.now(),
              messageCount: (meta?.messageCount || 0) + chatMessages.length,
            } as ChatMeta);
          };
        }
      });
    } catch (error) {
      console.error("[MessageCache] addMessagesBatch error:", error);
    }
  }

  /**
   * Replace an optimistic message with the real one
   */
  async replaceOptimisticMessage(tempId: string, realMessage: ChatMessage): Promise<void> {
    try {
      const db = await this.getDB();

      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(MESSAGES_STORE, "readwrite");
        const store = transaction.objectStore(MESSAGES_STORE);

        // Delete optimistic message
        store.delete(tempId);

        // Add real message (serialize to avoid DataCloneError)
        store.put(serializeMessage(realMessage));

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } catch (error) {
      console.error("[MessageCache] replaceOptimisticMessage error:", error);
    }
  }

  /**
   * Clear cache for a specific chat
   */
  async clearChat(requestId: string): Promise<void> {
    try {
      const db = await this.getDB();

      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([MESSAGES_STORE, CHAT_META_STORE], "readwrite");

        transaction.oncomplete = () => {
          resolve();
        };

        transaction.onerror = () => {
          reject(transaction.error);
        };

        // Delete all messages for this chat
        const messagesStore = transaction.objectStore(MESSAGES_STORE);
        const index = messagesStore.index("by_request");
        const cursorRequest = index.openKeyCursor(requestId);

        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (cursor) {
            messagesStore.delete(cursor.primaryKey);
            cursor.continue();
          }
        };

        // Delete chat metadata
        const metaStore = transaction.objectStore(CHAT_META_STORE);
        metaStore.delete(requestId);
      });
    } catch (error) {
      console.error("[MessageCache] clearChat error:", error);
    }
  }

  /**
   * Clear expired cache entries (older than 7 days)
   * T060: Improved version that returns number of entries cleaned
   *
   * @param maxAgeDays - Maximum age in days (default: 7)
   * @returns Number of entries cleaned (messages + chats)
   */
  async cleanupExpiredCache(maxAgeDays: number = CACHE_EXPIRY_DAYS): Promise<number> {
    try {
      const db = await this.getDB();
      const expiryTime = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

      let messagesDeleted = 0;
      let chatsDeleted = 0;

      return new Promise<number>((resolve, reject) => {
        const transaction = db.transaction([MESSAGES_STORE, CHAT_META_STORE], "readwrite");

        transaction.oncomplete = () => {
          const totalCleaned = messagesDeleted + chatsDeleted;
          console.log(
            `[MessageCache] Cleanup complete: ${messagesDeleted} messages, ${chatsDeleted} chats removed ` +
            `(older than ${maxAgeDays} days)`
          );
          resolve(totalCleaned);
        };

        transaction.onerror = () => {
          console.error("[MessageCache] Cleanup transaction failed:", transaction.error);
          reject(transaction.error);
        };

        // Find and delete expired messages
        const messagesStore = transaction.objectStore(MESSAGES_STORE);
        const messagesCursor = messagesStore.openCursor();

        messagesCursor.onsuccess = () => {
          const cursor = messagesCursor.result;
          if (cursor) {
            const cachedAt = (cursor.value as { _cachedAt?: number })._cachedAt || 0;
            if (cachedAt < expiryTime) {
              cursor.delete();
              messagesDeleted++;
            }
            cursor.continue();
          }
        };

        // Find and delete expired chat metadata
        const metaStore = transaction.objectStore(CHAT_META_STORE);
        const metaCursor = metaStore.openCursor();

        metaCursor.onsuccess = () => {
          const cursor = metaCursor.result;
          if (cursor) {
            const lastUpdated = (cursor.value as ChatMeta).lastUpdated || 0;
            if (lastUpdated < expiryTime) {
              cursor.delete();
              chatsDeleted++;
            }
            cursor.continue();
          }
        };
      });
    } catch (error) {
      console.error("[MessageCache] cleanupExpiredCache error:", error);
      return 0;
    }
  }

  /**
   * Evict oldest chats to free up cache space
   * T062: LRU eviction by lastAccessedAt timestamp
   *
   * @param bytesToFree - Number of bytes to free (approximate)
   * @returns Number of chats evicted
   */
  async evictOldestChats(bytesToFree: number): Promise<number> {
    try {
      const db = await this.getDB();

      // Get all chat metadata sorted by lastAccessedAt (oldest first)
      const chatMetas = await this.getAllChatMetaSorted();

      if (chatMetas.length === 0) {
        console.log('[MessageCache] No chats to evict');
        return 0;
      }

      let bytesFreed = 0;
      let chatsEvicted = 0;
      const chatsToEvict: string[] = [];

      // Estimate size and select chats to evict
      for (const meta of chatMetas) {
        if (bytesFreed >= bytesToFree) break;

        // Estimate message size: ~1KB per message (rough estimate)
        const estimatedChatSize = meta.messageCount * 1024;
        bytesFreed += estimatedChatSize;
        chatsToEvict.push(meta.requestId);
        chatsEvicted++;
      }

      // Evict selected chats
      for (const requestId of chatsToEvict) {
        await this.clearChat(requestId);
      }

      console.log(
        `[MessageCache] Evicted ${chatsEvicted} chats to free ~${Math.round(bytesFreed / 1024)}KB ` +
        `(requested: ${Math.round(bytesToFree / 1024)}KB)`
      );

      return chatsEvicted;
    } catch (error) {
      console.error("[MessageCache] evictOldestChats error:", error);
      return 0;
    }
  }

  /**
   * Get all chat metadata sorted by lastAccessedAt (oldest first)
   */
  private async getAllChatMetaSorted(): Promise<ChatMeta[]> {
    try {
      const db = await this.getDB();

      return new Promise<ChatMeta[]>((resolve, reject) => {
        const transaction = db.transaction(CHAT_META_STORE, "readonly");
        const store = transaction.objectStore(CHAT_META_STORE);
        const request = store.getAll();

        request.onsuccess = () => {
          const metas = (request.result || []) as ChatMeta[];
          // Sort by lastAccessedAt (oldest first), default to 0 if not set
          metas.sort((a, b) => (a.lastAccessedAt || 0) - (b.lastAccessedAt || 0));
          resolve(metas);
        };

        request.onerror = () => {
          console.error("[MessageCache] Failed to get all chat meta:", request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error("[MessageCache] getAllChatMetaSorted error:", error);
      return [];
    }
  }

  /**
   * Clear all cached data
   */
  async clearAll(): Promise<void> {
    try {
      const db = await this.getDB();

      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([MESSAGES_STORE, CHAT_META_STORE], "readwrite");

        transaction.oncomplete = () => {
          resolve();
        };

        transaction.onerror = () => {
          reject(transaction.error);
        };

        transaction.objectStore(MESSAGES_STORE).clear();
        transaction.objectStore(CHAT_META_STORE).clear();
      });
    } catch (error) {
      console.error("[MessageCache] clearAll error:", error);
    }
  }

  /**
   * Clear cache by date range (T066)
   * Removes all messages cached between the specified timestamps
   *
   * @param startDate - Start timestamp (inclusive)
   * @param endDate - End timestamp (inclusive)
   * @returns Number of messages cleared
   */
  async clearByDateRange(startDate: number, endDate: number): Promise<number> {
    try {
      const db = await this.getDB();

      return new Promise<number>((resolve, reject) => {
        const transaction = db.transaction([MESSAGES_STORE, CHAT_META_STORE], "readwrite");

        let messagesCleared = 0;
        const affectedChats = new Set<string>();

        transaction.oncomplete = () => {
          console.log(
            `[MessageCache] Cleared ${messagesCleared} messages from ${new Date(startDate).toISOString()} to ${new Date(endDate).toISOString()}`
          );
          resolve(messagesCleared);
        };

        transaction.onerror = () => {
          console.error("[MessageCache] Clear by date range failed:", transaction.error);
          reject(transaction.error);
        };

        const messagesStore = transaction.objectStore(MESSAGES_STORE);
        const messagesCursor = messagesStore.openCursor();

        messagesCursor.onsuccess = () => {
          const cursor = messagesCursor.result;
          if (cursor) {
            const message = cursor.value as ChatMessage;
            const cachedAt = (message as any)._cachedAt || 0;

            // Check if message was cached in the specified range
            if (cachedAt >= startDate && cachedAt <= endDate) {
              const requestId = message.requestId;
              affectedChats.add(requestId);
              cursor.delete();
              messagesCleared++;
            }

            cursor.continue();
          }
        };

        // Update chat metadata for affected chats
        const metaStore = transaction.objectStore(CHAT_META_STORE);
        transaction.oncomplete = () => {
          // Update metadata counts after messages are deleted
          const updateTransaction = db.transaction(CHAT_META_STORE, "readwrite");
          const updateStore = updateTransaction.objectStore(CHAT_META_STORE);

          for (const requestId of affectedChats) {
            const getRequest = updateStore.get(requestId);
            getRequest.onsuccess = () => {
              const meta = getRequest.result as ChatMeta | undefined;
              if (meta && meta.messageCount > 0) {
                meta.messageCount = Math.max(0, meta.messageCount - 1);
                updateStore.put(meta);
              }
            };
          }
        };
      });
    } catch (error) {
      console.error("[MessageCache] clearByDateRange error:", error);
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{ chats: number; messages: number }> {
    try {
      const db = await this.getDB();

      return new Promise<{ chats: number; messages: number }>((resolve, reject) => {
        const transaction = db.transaction([MESSAGES_STORE, CHAT_META_STORE], "readonly");

        let chats = 0;
        let messages = 0;

        const messagesRequest = transaction.objectStore(MESSAGES_STORE).count();
        messagesRequest.onsuccess = () => {
          messages = messagesRequest.result;
        };

        const metaRequest = transaction.objectStore(CHAT_META_STORE).count();
        metaRequest.onsuccess = () => {
          chats = metaRequest.result;
        };

        transaction.oncomplete = () => {
          resolve({ chats, messages });
        };

        transaction.onerror = () => {
          reject(transaction.error);
        };
      });
    } catch (error) {
      console.error("[MessageCache] getStats error:", error);
      return { chats: 0, messages: 0 };
    }
  }

  // ============================================================================
  // Offline Queue Methods
  // ============================================================================

  /**
   * Add a failed message to the offline queue
   */
  async addToOfflineQueue(entry: OfflineQueueEntry): Promise<void> {
    try {
      const db = await this.getDB();

      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(OFFLINE_QUEUE_STORE, "readwrite");
        const store = transaction.objectStore(OFFLINE_QUEUE_STORE);

        store.put(entry);

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => {
          console.error("[MessageCache] Failed to add to offline queue:", transaction.error);
          reject(transaction.error);
        };
      });
    } catch (error) {
      console.error("[MessageCache] addToOfflineQueue error:", error);
    }
  }

  /**
   * Get all failed messages from the offline queue
   */
  async getOfflineQueue(): Promise<OfflineQueueEntry[]> {
    try {
      const db = await this.getDB();

      return new Promise<OfflineQueueEntry[]>((resolve, reject) => {
        const transaction = db.transaction(OFFLINE_QUEUE_STORE, "readonly");
        const store = transaction.objectStore(OFFLINE_QUEUE_STORE);
        const request = store.getAll();

        request.onsuccess = () => {
          const entries = (request.result || []) as OfflineQueueEntry[];
          // Sort by timestamp (oldest first)
          entries.sort((a, b) => a.timestamp - b.timestamp);
          resolve(entries);
        };

        request.onerror = () => {
          console.error("[MessageCache] Failed to get offline queue:", request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error("[MessageCache] getOfflineQueue error:", error);
      return [];
    }
  }

  /**
   * Get failed messages for a specific request
   */
  async getFailedMessagesForRequest(requestId: string): Promise<OfflineQueueEntry[]> {
    try {
      const db = await this.getDB();

      return new Promise<OfflineQueueEntry[]>((resolve, reject) => {
        const transaction = db.transaction(OFFLINE_QUEUE_STORE, "readonly");
        const store = transaction.objectStore(OFFLINE_QUEUE_STORE);
        const index = store.index("by_request");
        const request = index.getAll(requestId);

        request.onsuccess = () => {
          const entries = (request.result || []) as OfflineQueueEntry[];
          // Sort by timestamp (oldest first)
          entries.sort((a, b) => a.timestamp - b.timestamp);
          resolve(entries);
        };

        request.onerror = () => {
          console.error("[MessageCache] Failed to get failed messages:", request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error("[MessageCache] getFailedMessagesForRequest error:", error);
      return [];
    }
  }

  /**
   * Remove a message from the offline queue
   */
  async removeFromOfflineQueue(tempId: string): Promise<void> {
    try {
      const db = await this.getDB();

      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(OFFLINE_QUEUE_STORE, "readwrite");
        const store = transaction.objectStore(OFFLINE_QUEUE_STORE);

        store.delete(tempId);

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => {
          console.error("[MessageCache] Failed to remove from offline queue:", transaction.error);
          reject(transaction.error);
        };
      });
    } catch (error) {
      console.error("[MessageCache] removeFromOfflineQueue error:", error);
    }
  }

  /**
   * Update retry count for a failed message
   */
  async updateRetryCount(tempId: string, retryCount: number): Promise<void> {
    try {
      const db = await this.getDB();

      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(OFFLINE_QUEUE_STORE, "readwrite");
        const store = transaction.objectStore(OFFLINE_QUEUE_STORE);

        const getRequest = store.get(tempId);

        getRequest.onsuccess = () => {
          const entry = getRequest.result as OfflineQueueEntry | undefined;
          if (entry) {
            entry.retryCount = retryCount;
            store.put(entry);
          }
        };

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => {
          console.error("[MessageCache] Failed to update retry count:", transaction.error);
          reject(transaction.error);
        };
      });
    } catch (error) {
      console.error("[MessageCache] updateRetryCount error:", error);
    }
  }

  /**
   * Clear all entries from the offline queue
   */
  async clearOfflineQueue(): Promise<void> {
    try {
      const db = await this.getDB();

      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(OFFLINE_QUEUE_STORE, "readwrite");
        const store = transaction.objectStore(OFFLINE_QUEUE_STORE);

        store.clear();

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => {
          console.error("[MessageCache] Failed to clear offline queue:", transaction.error);
          reject(transaction.error);
        };
      });
    } catch (error) {
      console.error("[MessageCache] clearOfflineQueue error:", error);
    }
  }

  // ============================================================================
  // Detailed Statistics (T067)
  // ============================================================================

  /**
   * Get detailed cache statistics (T067)
   * Returns comprehensive statistics including per-chat breakdown
   *
   * @returns Detailed cache statistics
   */
  async getDetailedStats(): Promise<DetailedCacheStatistics> {
    try {
      const db = await this.getDB();

      return new Promise<DetailedCacheStatistics>((resolve, reject) => {
        const transaction = db.transaction([MESSAGES_STORE, CHAT_META_STORE], "readonly");

        let totalMessages = 0;
        let totalSize = 0;
        let lastSyncTimestamp = 0;
        const chatBreakdown: ChatCacheStats[] = [];
        const STORAGE_LIMIT_MB = 500;

        // Get all messages to calculate total size
        const messagesStore = transaction.objectStore(MESSAGES_STORE);
        const messagesRequest = messagesStore.openCursor();

        messagesRequest.onsuccess = () => {
          const cursor = messagesRequest.result;
          if (cursor) {
            const message = cursor.value as ChatMessage;
            totalMessages++;
            totalSize += this.estimateMessageSize(message);
            cursor.continue();
          }
        };

        // Get all chat metadata
        const metaStore = transaction.objectStore(CHAT_META_STORE);
        const metaRequest = metaStore.openCursor();

        metaRequest.onsuccess = () => {
          const cursor = metaRequest.result;
          if (cursor) {
            const meta = cursor.value as ChatMeta;

            // Track most recent sync
            if (meta.lastSyncedAt > lastSyncTimestamp) {
              lastSyncTimestamp = meta.lastSyncedAt;
            }

            // Get message count for this chat
            const index = messagesStore.index("by_request");
            const countRequest = index.count(meta.requestId);

            countRequest.onsuccess = () => {
              const messageCount = countRequest.result;

              // Estimate chat size (rough approximation)
              const chatSize = messageCount * 1000; // Average 1KB per message

              chatBreakdown.push({
                requestId: meta.requestId,
                messageCount,
                mediaSize: 0, // TODO: Calculate from media cache when implemented
                lastSyncedAt: meta.lastSyncedAt,
                lastAccessedAt: meta.lastAccessedAt || meta.lastSyncedAt,
                totalSize: chatSize,
              });
            };

            cursor.continue();
          }
        };

        transaction.oncomplete = () => {
          const totalSizeMB = totalSize / (1024 * 1024);
          const usagePercentage = (totalSizeMB / STORAGE_LIMIT_MB) * 100;
          const totalRequests = this.cacheHits + this.cacheMisses;
          const hitRate = totalRequests > 0 ? (this.cacheHits / totalRequests) * 100 : 0;

          resolve({
            totalSize,
            totalSizeMB: Math.round(totalSizeMB * 100) / 100,
            storageLimitMB: STORAGE_LIMIT_MB,
            usagePercentage: Math.min(usagePercentage, 100),
            totalChats: chatBreakdown.length,
            totalMessages,
            hitRate: Math.round(hitRate * 100) / 100,
            lastSyncTimestamp,
            chatBreakdown: chatBreakdown.sort((a, b) => b.lastAccessedAt - a.lastAccessedAt),
          });
        };

        transaction.onerror = () => {
          reject(transaction.error);
        };
      });
    } catch (error) {
      console.error("[MessageCache] getDetailedStats error:", error);
      return {
        totalSize: 0,
        totalSizeMB: 0,
        storageLimitMB: 500,
        usagePercentage: 0,
        totalChats: 0,
        totalMessages: 0,
        hitRate: 0,
        lastSyncTimestamp: 0,
        chatBreakdown: [],
      };
    }
  }

  /**
   * Estimate message size in bytes (rough approximation)
   * Text: ~2 bytes per character (UTF-16)
   * Metadata: ~500 bytes overhead per message
   */
  private estimateMessageSize(message: ChatMessage): number {
    const textSize = (message.content?.length || 0) * 2;
    const metadataSize = 500; // Approximate metadata size
    return textSize + metadataSize;
  }
}

// Singleton instance
export const messageCache = new MessageCacheService();

// Initialize cleanup on load
if (typeof window !== "undefined") {
  // Run cleanup after a short delay to not block initial load
  setTimeout(() => {
    messageCache.cleanupExpiredCache().catch(console.error);
  }, 5000);
}

export default messageCache;
