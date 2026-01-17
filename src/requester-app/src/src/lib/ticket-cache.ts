/**
 * IndexedDB Ticket Cache for Instant Startup
 *
 * Provides instant ticket list loading by caching tickets locally.
 * Based on WhatsApp pattern - show cached data immediately,
 * then sync with server in background.
 *
 * Features:
 * - Instant ticket list retrieval (sub-10ms)
 * - Automatic cache cleanup (24-hour expiry for freshness)
 * - Stores full ChatPageResponse for TanStack Query integration
 * - Offline support foundation
 */

import type { ChatPageResponse, ChatMessageListItem, RequestStatusCount } from "@/types";

const DB_NAME = "support-center-requester-cache";
const DB_VERSION = 5; // Bumped to 5 to resolve version conflict with existing DB
const TICKETS_STORE = "tickets";
const TICKET_META_STORE = "ticket_meta";
const CACHE_EXPIRY_HOURS = 24;

// Ticket list metadata for tracking freshness
interface TicketCacheMeta {
  key: string; // 'all-user-tickets'
  lastUpdated: number; // timestamp
  ticketCount: number;
}

// Serialized ticket for storage
interface CachedTicket extends ChatMessageListItem {
  _cachedAt: number;
}

/**
 * Serialize a ticket for IndexedDB storage
 */
function serializeTicket(ticket: ChatMessageListItem): CachedTicket {
  return {
    ...ticket,
    _cachedAt: Date.now(),
  };
}

class TicketCacheService {
  private db: IDBDatabase | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;
  private memoryCache: ChatPageResponse | null = null;
  private memoryCacheTimestamp: number = 0;

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
        console.error("[TicketCache] Failed to open database:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // V1: Create messages store (shared with message-cache.ts)
        if (!db.objectStoreNames.contains("messages")) {
          const messagesStore = db.createObjectStore("messages", {
            keyPath: "id",
          });
          messagesStore.createIndex("by_request", "requestId", { unique: false });
          messagesStore.createIndex("by_request_sequence", ["requestId", "sequenceNumber"], {
            unique: false,
          });
        }

        // V1: Create chat metadata store
        if (!db.objectStoreNames.contains("chat_meta")) {
          db.createObjectStore("chat_meta", { keyPath: "requestId" });
        }

        // V2: Create tickets store
        if (!db.objectStoreNames.contains(TICKETS_STORE)) {
          const ticketsStore = db.createObjectStore(TICKETS_STORE, {
            keyPath: "id",
          });
          ticketsStore.createIndex("by_status", "statusId", { unique: false });
          ticketsStore.createIndex("by_cached_at", "_cachedAt", { unique: false });
        }

        // V2: Create ticket metadata store
        if (!db.objectStoreNames.contains(TICKET_META_STORE)) {
          db.createObjectStore(TICKET_META_STORE, { keyPath: "key" });
        }
      };
    });

    return this.dbPromise;
  }

  /**
   * Get cached tickets synchronously from memory cache
   * Returns null if no memory cache available
   */
  getCachedTicketsSync(): ChatPageResponse | null {
    // Check if memory cache is fresh (< 5 minutes)
    const isFresh = Date.now() - this.memoryCacheTimestamp < 5 * 60 * 1000;
    if (this.memoryCache && isFresh) {
      return this.memoryCache;
    }
    return null;
  }

  /**
   * Get cached tickets from IndexedDB
   * Returns full ChatPageResponse for TanStack Query compatibility
   */
  async getCachedTickets(): Promise<ChatPageResponse | null> {
    // Check memory cache first
    const memoryResult = this.getCachedTicketsSync();
    if (memoryResult) {
      return memoryResult;
    }

    try {
      const db = await this.getDB();

      // Get metadata first
      const meta = await new Promise<TicketCacheMeta | null>((resolve, reject) => {
        const transaction = db.transaction(TICKET_META_STORE, "readonly");
        const store = transaction.objectStore(TICKET_META_STORE);
        const request = store.get("all-user-tickets");

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });

      // Check if cache is expired
      if (!meta || Date.now() - meta.lastUpdated > CACHE_EXPIRY_HOURS * 60 * 60 * 1000) {
        console.log("[TicketCache] Cache expired or missing");
        return null;
      }

      // Get all tickets
      const tickets = await new Promise<CachedTicket[]>((resolve, reject) => {
        const transaction = db.transaction(TICKETS_STORE, "readonly");
        const store = transaction.objectStore(TICKETS_STORE);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });

      if (tickets.length === 0) {
        return null;
      }

      // Reconstruct ChatPageResponse
      const response: ChatPageResponse = {
        chatMessages: tickets.map((t) => {
          // Remove _cachedAt before returning
          const { _cachedAt, ...ticket } = t;
          return ticket;
        }),
        requestStatus: await this.getCachedStatuses(),
      };

      // Update memory cache
      this.memoryCache = response;
      this.memoryCacheTimestamp = Date.now();

      console.log(`[TicketCache] Retrieved ${tickets.length} tickets from cache`);
      return response;
    } catch (error) {
      console.error("[TicketCache] getCachedTickets error:", error);
      return null;
    }
  }

  /**
   * Get cached request statuses
   */
  private async getCachedStatuses(): Promise<RequestStatusCount[]> {
    try {
      const db = await this.getDB();

      return new Promise<RequestStatusCount[]>((resolve, reject) => {
        const transaction = db.transaction(TICKET_META_STORE, "readonly");
        const store = transaction.objectStore(TICKET_META_STORE);
        const request = store.get("request-statuses");

        request.onsuccess = () => {
          const data = request.result;
          resolve(data?.statuses || []);
        };
        request.onerror = () => reject(request.error);
      });
    } catch {
      return [];
    }
  }

  /**
   * Cache tickets from API response
   * Replaces all existing cached tickets
   */
  async cacheTickets(response: ChatPageResponse): Promise<void> {
    if (!response.chatMessages || response.chatMessages.length === 0) {
      console.log("[TicketCache] No tickets to cache");
      return;
    }

    // Update memory cache immediately
    this.memoryCache = response;
    this.memoryCacheTimestamp = Date.now();

    try {
      const db = await this.getDB();

      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([TICKETS_STORE, TICKET_META_STORE], "readwrite");

        transaction.oncomplete = () => {
          console.log(`[TicketCache] Cached ${response.chatMessages.length} tickets`);
          resolve();
        };

        transaction.onerror = () => {
          console.error("[TicketCache] Cache transaction failed:", transaction.error);
          reject(transaction.error);
        };

        // Clear existing tickets and add new ones
        const ticketsStore = transaction.objectStore(TICKETS_STORE);
        ticketsStore.clear();

        for (const ticket of response.chatMessages) {
          ticketsStore.put(serializeTicket(ticket));
        }

        // Update metadata
        const metaStore = transaction.objectStore(TICKET_META_STORE);
        metaStore.put({
          key: "all-user-tickets",
          lastUpdated: Date.now(),
          ticketCount: response.chatMessages.length,
        } as TicketCacheMeta);

        // Cache statuses
        if (response.requestStatus) {
          metaStore.put({
            key: "request-statuses",
            statuses: response.requestStatus,
            lastUpdated: Date.now(),
          });
        }
      });
    } catch (error) {
      console.error("[TicketCache] cacheTickets error:", error);
    }
  }

  /**
   * Update a single ticket in the cache
   * Used for WebSocket updates
   */
  async updateTicket(ticketId: string, updates: Partial<ChatMessageListItem>): Promise<void> {
    // Update memory cache
    if (this.memoryCache) {
      const idx = this.memoryCache.chatMessages.findIndex((t) => t.id === ticketId);
      if (idx !== -1) {
        this.memoryCache.chatMessages[idx] = {
          ...this.memoryCache.chatMessages[idx],
          ...updates,
        };
      }
    }

    try {
      const db = await this.getDB();

      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(TICKETS_STORE, "readwrite");
        const store = transaction.objectStore(TICKETS_STORE);
        const getRequest = store.get(ticketId);

        getRequest.onsuccess = () => {
          const existing = getRequest.result as CachedTicket | undefined;
          if (existing) {
            store.put({
              ...existing,
              ...updates,
              _cachedAt: Date.now(),
            });
          }
        };

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } catch (error) {
      console.error("[TicketCache] updateTicket error:", error);
    }
  }

  /**
   * Clear all cached ticket data
   */
  async clearAll(): Promise<void> {
    // Clear memory cache
    this.memoryCache = null;
    this.memoryCacheTimestamp = 0;

    try {
      const db = await this.getDB();

      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([TICKETS_STORE, TICKET_META_STORE], "readwrite");

        transaction.oncomplete = () => {
          console.log("[TicketCache] Cache cleared");
          resolve();
        };

        transaction.onerror = () => {
          reject(transaction.error);
        };

        transaction.objectStore(TICKETS_STORE).clear();
        transaction.objectStore(TICKET_META_STORE).clear();
      });
    } catch (error) {
      console.error("[TicketCache] clearAll error:", error);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{ tickets: number; lastUpdated: number | null }> {
    try {
      const db = await this.getDB();

      return new Promise<{ tickets: number; lastUpdated: number | null }>((resolve, reject) => {
        const transaction = db.transaction([TICKETS_STORE, TICKET_META_STORE], "readonly");

        let tickets = 0;
        let lastUpdated: number | null = null;

        const ticketsRequest = transaction.objectStore(TICKETS_STORE).count();
        ticketsRequest.onsuccess = () => {
          tickets = ticketsRequest.result;
        };

        const metaRequest = transaction.objectStore(TICKET_META_STORE).get("all-user-tickets");
        metaRequest.onsuccess = () => {
          lastUpdated = metaRequest.result?.lastUpdated || null;
        };

        transaction.oncomplete = () => {
          resolve({ tickets, lastUpdated });
        };

        transaction.onerror = () => {
          reject(transaction.error);
        };
      });
    } catch (error) {
      console.error("[TicketCache] getStats error:", error);
      return { tickets: 0, lastUpdated: null };
    }
  }

  /**
   * Preload cache on app startup
   * Populates memory cache from IndexedDB
   */
  async preload(): Promise<void> {
    try {
      const cached = await this.getCachedTickets();
      if (cached) {
        console.log("[TicketCache] Preloaded cache with", cached.chatMessages.length, "tickets");
      }
    } catch (error) {
      console.error("[TicketCache] Preload error:", error);
    }
  }
}

// Singleton instance
export const ticketCache = new TicketCacheService();

// Preload cache on module load (non-blocking)
// The preload is already async (IndexedDB), so no delay needed
if (typeof window !== "undefined") {
  ticketCache.preload().catch(console.error);
}

export default ticketCache;
