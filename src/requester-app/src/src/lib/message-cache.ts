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

const DB_NAME = "support-center-requester-cache";
const DB_VERSION = 2; // Bumped to 2 to share schema with ticket-cache.ts
const MESSAGES_STORE = "messages";
const CHAT_META_STORE = "chat_meta";
const CACHE_EXPIRY_DAYS = 7;

// Chat metadata for tracking freshness
interface ChatMeta {
  requestId: string;
  latestSequence: number;
  lastUpdated: number; // timestamp
  messageCount: number;
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

  /**
   * Initialize IndexedDB database
   */
  private async getDB(): Promise<IDBDatabase> {
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
      };
    });

    return this.dbPromise;
  }

  /**
   * Get cached messages for a chat
   * Returns messages sorted by sequence number
   */
  async getCachedMessages(requestId: string): Promise<ChatMessage[]> {
    try {
      const db = await this.getDB();

      return new Promise<ChatMessage[]>((resolve, reject) => {
        const transaction = db.transaction(MESSAGES_STORE, "readonly");
        const store = transaction.objectStore(MESSAGES_STORE);
        const index = store.index("by_request");
        const request = index.getAll(requestId);

        request.onsuccess = () => {
          const messages = (request.result || []) as ChatMessage[];
          // Sort by sequence number
          messages.sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));
          resolve(messages);
        };

        request.onerror = () => {
          console.error("[MessageCache] Failed to get messages:", request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error("[MessageCache] getCachedMessages error:", error);
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
          resolve(request.result || null);
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
   * Cache messages for a chat
   * Replaces all existing messages for this chat
   */
  async cacheMessages(requestId: string, messages: ChatMessage[]): Promise<void> {
    if (messages.length === 0) return;

    try {
      const db = await this.getDB();

      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([MESSAGES_STORE, CHAT_META_STORE], "readwrite");

        transaction.oncomplete = () => {
          resolve();
        };

        transaction.onerror = () => {
          console.error("[MessageCache] Cache transaction failed:", transaction.error);
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
          messageCount: messages.length,
        } as ChatMeta);
      });
    } catch (error) {
      console.error("[MessageCache] cacheMessages error:", error);
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
   */
  async cleanupExpiredCache(): Promise<void> {
    try {
      const db = await this.getDB();
      const expiryTime = Date.now() - CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([MESSAGES_STORE, CHAT_META_STORE], "readwrite");

        transaction.oncomplete = () => {
          resolve();
        };

        transaction.onerror = () => {
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
            }
            cursor.continue();
          }
        };
      });
    } catch (error) {
      console.error("[MessageCache] cleanupExpiredCache error:", error);
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
