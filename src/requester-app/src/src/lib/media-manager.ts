/**
 * MediaManager - IndexedDB-based media caching with LRU eviction
 *
 * Provides persistent caching of media files (screenshots, attachments) with:
 * - IndexedDB storage for metadata and blobs
 * - LRU eviction when cache exceeds limits
 * - Pin/unpin support for important media
 * - Cache statistics and management
 *
 * @version 1.0.0
 */

import type {
  CachedMediaMeta,
  CachedMediaBlob,
  MediaDownloadRequest,
  MediaDownloadResult,
  MediaDownloadStatus,
  MediaPriority,
} from "@/lib/cache/schemas";

// ============================================================================
// Constants
// ============================================================================

const DB_NAME = "support-center-requester-cache";
const DB_VERSION = 4; // Bumped for media stores
const MEDIA_META_STORE = "media_meta";
const MEDIA_BLOBS_STORE = "media_blobs";

// Desktop app has more storage available
const MAX_CACHE_SIZE = 500 * 1024 * 1024; // 500MB
const EVICTION_THRESHOLD = 450 * 1024 * 1024; // Trigger eviction at 450MB
const EVICTION_TARGET = 400 * 1024 * 1024; // Target 400MB after eviction

// ============================================================================
// Types
// ============================================================================

interface CacheStats {
  totalSize: number;
  mediaCount: number;
  pinnedCount: number;
  hitRate: number;
}

// ============================================================================
// MediaManager Class
// ============================================================================

class MediaManager {
  private db: IDBDatabase | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;
  private cacheHits = 0;
  private cacheMisses = 0;

  /**
   * Initialize IndexedDB database with media stores
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
        console.error("[MediaManager] Failed to open database:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create media metadata store
        if (!db.objectStoreNames.contains(MEDIA_META_STORE)) {
          const metaStore = db.createObjectStore(MEDIA_META_STORE, {
            keyPath: "id",
          });
          metaStore.createIndex("by_request", "requestId", { unique: false });
          metaStore.createIndex("by_last_accessed", "lastAccessedAt", { unique: false });
          metaStore.createIndex("by_status", "downloadStatus", { unique: false });
          metaStore.createIndex("by_pinned", "isPinned", { unique: false });
        }

        // Create media blobs store
        if (!db.objectStoreNames.contains(MEDIA_BLOBS_STORE)) {
          const blobStore = db.createObjectStore(MEDIA_BLOBS_STORE, {
            keyPath: "key",
          });
          blobStore.createIndex("by_last_accessed", "lastAccessedAt", { unique: false });
        }
      };
    });

    return this.dbPromise;
  }

  // ============================================================================
  // Download Methods
  // ============================================================================

  /**
   * Download and cache media from presigned URL
   */
  async downloadMedia(request: MediaDownloadRequest): Promise<MediaDownloadResult> {
    const { requestId, filename, presignedUrl, expectedSize, priority } = request;
    const mediaId = `${requestId}:${filename}`;

    try {
      // Check if already cached
      const cached = await this.isMediaCached(requestId, filename);
      if (cached) {
        this.cacheHits++;
        const url = await this.getMediaUrl(requestId, filename);
        return {
          success: true,
          localUrl: url || undefined,
          fromCache: true,
        };
      }

      this.cacheMisses++;

      // Update metadata to downloading
      await this.updateMetadata(mediaId, {
        downloadStatus: "downloading",
        downloadProgress: 0,
      });

      // Download the blob
      const response = await fetch(presignedUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const blob = await response.blob();

      // Verify size if provided
      if (expectedSize && blob.size !== expectedSize) {
        console.warn(
          `[MediaManager] Size mismatch for ${filename}: expected ${expectedSize}, got ${blob.size}`
        );
      }

      // Store in cache
      await this.storeMedia(requestId, filename, blob, request);

      // Update metadata to completed
      await this.updateMetadata(mediaId, {
        downloadStatus: "completed",
        downloadProgress: 100,
        downloadedAt: Date.now(),
        fileSize: blob.size,
      });

      // Check if eviction is needed
      await this.checkAndEvict();

      const url = await this.getMediaUrl(requestId, filename);
      return {
        success: true,
        localUrl: url || undefined,
        fromCache: false,
      };
    } catch (error) {
      // Update metadata to failed
      await this.updateMetadata(mediaId, {
        downloadStatus: "failed",
      }).catch(() => {});

      console.error(`[MediaManager] Failed to download ${filename}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        fromCache: false,
      };
    }
  }

  /**
   * Download thumbnail for media
   */
  async downloadThumbnail(requestId: string, filename: string): Promise<Blob | null> {
    // For now, thumbnails are not implemented separately
    // This is a placeholder for future enhancement
    console.warn("[MediaManager] Thumbnail download not yet implemented");
    return null;
  }

  /**
   * Get cached blob URL for media
   */
  async getMediaUrl(requestId: string, filename: string): Promise<string | null> {
    const mediaId = `${requestId}:${filename}`;

    try {
      const db = await this.getDB();

      return new Promise<string | null>((resolve, reject) => {
        const transaction = db.transaction(MEDIA_BLOBS_STORE, "readonly");
        const store = transaction.objectStore(MEDIA_BLOBS_STORE);
        const request = store.get(mediaId);

        request.onsuccess = () => {
          const cached = request.result as CachedMediaBlob | undefined;
          if (cached) {
            // Update last accessed time
            this.updateLastAccessed(mediaId).catch(() => {});

            // Create blob URL if not already created
            const url = URL.createObjectURL(cached.data);
            resolve(url);
          } else {
            resolve(null);
          }
        };

        request.onerror = () => {
          console.error("[MediaManager] Failed to get media URL:", request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error("[MediaManager] getMediaUrl error:", error);
      return null;
    }
  }

  /**
   * Check if media is cached
   */
  async isMediaCached(requestId: string, filename: string): Promise<boolean> {
    const mediaId = `${requestId}:${filename}`;

    try {
      const db = await this.getDB();

      return new Promise<boolean>((resolve, reject) => {
        const transaction = db.transaction(MEDIA_BLOBS_STORE, "readonly");
        const store = transaction.objectStore(MEDIA_BLOBS_STORE);
        const request = store.get(mediaId);

        request.onsuccess = () => {
          resolve(!!request.result);
        };

        request.onerror = () => {
          console.error("[MediaManager] Failed to check cache:", request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error("[MediaManager] isMediaCached error:", error);
      return false;
    }
  }

  // ============================================================================
  // Pin/Unpin Methods
  // ============================================================================

  /**
   * Pin media to prevent LRU eviction
   * Pinned media will never be evicted by evictOldest()
   */
  async pinMedia(requestId: string, filename: string): Promise<void> {
    const mediaId = `${requestId}:${filename}`;

    try {
      const db = await this.getDB();

      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(MEDIA_META_STORE, "readwrite");
        const store = transaction.objectStore(MEDIA_META_STORE);
        const getRequest = store.get(mediaId);

        getRequest.onsuccess = () => {
          const meta = getRequest.result as CachedMediaMeta | undefined;

          if (meta) {
            // Update isPinned flag
            meta.isPinned = true;
            meta.lastAccessedAt = Date.now();

            store.put(meta);

            console.log(`[MediaManager] Pinned media: ${mediaId}`);
            resolve();
          } else {
            console.warn(`[MediaManager] Cannot pin non-existent media: ${mediaId}`);
            resolve(); // Silently succeed if media doesn't exist
          }
        };

        getRequest.onerror = () => {
          console.error("[MediaManager] Failed to pin media:", getRequest.error);
          reject(getRequest.error);
        };

        transaction.onerror = () => {
          console.error("[MediaManager] Pin transaction failed:", transaction.error);
          reject(transaction.error);
        };

        transaction.oncomplete = () => {
          resolve();
        };
      });
    } catch (error) {
      console.error("[MediaManager] pinMedia error:", error);
      throw error;
    }
  }

  /**
   * Unpin media to allow LRU eviction
   */
  async unpinMedia(requestId: string, filename: string): Promise<void> {
    const mediaId = `${requestId}:${filename}`;

    try {
      const db = await this.getDB();

      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(MEDIA_META_STORE, "readwrite");
        const store = transaction.objectStore(MEDIA_META_STORE);
        const getRequest = store.get(mediaId);

        getRequest.onsuccess = () => {
          const meta = getRequest.result as CachedMediaMeta | undefined;

          if (meta) {
            // Update isPinned flag
            meta.isPinned = false;
            meta.lastAccessedAt = Date.now();

            store.put(meta);

            console.log(`[MediaManager] Unpinned media: ${mediaId}`);
            resolve();
          } else {
            console.warn(`[MediaManager] Cannot unpin non-existent media: ${mediaId}`);
            resolve(); // Silently succeed if media doesn't exist
          }
        };

        getRequest.onerror = () => {
          console.error("[MediaManager] Failed to unpin media:", getRequest.error);
          reject(getRequest.error);
        };

        transaction.onerror = () => {
          console.error("[MediaManager] Unpin transaction failed:", transaction.error);
          reject(transaction.error);
        };

        transaction.oncomplete = () => {
          resolve();
        };
      });
    } catch (error) {
      console.error("[MediaManager] unpinMedia error:", error);
      throw error;
    }
  }

  /**
   * Get all pinned media for a request
   */
  async getPinnedMedia(requestId: string): Promise<CachedMediaMeta[]> {
    try {
      const db = await this.getDB();

      return new Promise<CachedMediaMeta[]>((resolve, reject) => {
        const transaction = db.transaction(MEDIA_META_STORE, "readonly");
        const store = transaction.objectStore(MEDIA_META_STORE);
        const index = store.index("by_request");
        const request = index.getAll(requestId);

        request.onsuccess = () => {
          const allMedia = (request.result || []) as CachedMediaMeta[];
          const pinned = allMedia.filter((m) => m.isPinned);
          resolve(pinned);
        };

        request.onerror = () => {
          console.error("[MediaManager] Failed to get pinned media:", request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error("[MediaManager] getPinnedMedia error:", error);
      return [];
    }
  }

  // ============================================================================
  // Cache Management
  // ============================================================================

  /**
   * Evict specific media from cache
   */
  async evictMedia(requestId: string, filename: string): Promise<void> {
    const mediaId = `${requestId}:${filename}`;

    try {
      const db = await this.getDB();

      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(
          [MEDIA_META_STORE, MEDIA_BLOBS_STORE],
          "readwrite"
        );

        transaction.oncomplete = () => {
          console.log(`[MediaManager] Evicted media: ${mediaId}`);
          resolve();
        };

        transaction.onerror = () => {
          console.error("[MediaManager] Evict transaction failed:", transaction.error);
          reject(transaction.error);
        };

        // Delete metadata
        transaction.objectStore(MEDIA_META_STORE).delete(mediaId);

        // Delete blob
        transaction.objectStore(MEDIA_BLOBS_STORE).delete(mediaId);
      });
    } catch (error) {
      console.error("[MediaManager] evictMedia error:", error);
      throw error;
    }
  }

  /**
   * Evict oldest unpinned media to free up space
   * Pinned media is never evicted
   */
  async evictOldest(bytesToFree: number): Promise<number> {
    try {
      const db = await this.getDB();

      return new Promise<number>((resolve, reject) => {
        const transaction = db.transaction([MEDIA_META_STORE, MEDIA_BLOBS_STORE], "readwrite");

        let bytesFreed = 0;
        const mediaToEvict: string[] = [];

        transaction.oncomplete = () => {
          // Log eviction summary
          console.log(`[MediaManager] Evicted ${mediaToEvict.length} items, freed ${bytesFreed} bytes`);
          resolve(bytesFreed);
        };

        transaction.onerror = () => {
          console.error("[MediaManager] Evict oldest transaction failed:", transaction.error);
          reject(transaction.error);
        };

        const metaStore = transaction.objectStore(MEDIA_META_STORE);
        const index = metaStore.index("by_last_accessed");

        // Open cursor to iterate by lastAccessedAt (oldest first)
        const cursorRequest = index.openCursor(null, "next");

        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;

          if (cursor && bytesFreed < bytesToFree) {
            const meta = cursor.value as CachedMediaMeta;

            // Skip pinned media - never evict pinned items
            if (meta.isPinned) {
              cursor.continue();
              return;
            }

            // Get blob size
            const blobStore = transaction.objectStore(MEDIA_BLOBS_STORE);
            const blobRequest = blobStore.get(meta.id);

            blobRequest.onsuccess = () => {
              const blob = blobRequest.result as CachedMediaBlob | undefined;

              if (blob) {
                const size = blob.size;
                mediaToEvict.push(meta.id);

                // Delete metadata and blob
                metaStore.delete(meta.id);
                blobStore.delete(meta.id);

                bytesFreed += size;
              }

              // Continue to next item
              cursor.continue();
            };
          } else {
            // Done - either no more items or freed enough space
          }
        };
      });
    } catch (error) {
      console.error("[MediaManager] evictOldest error:", error);
      return 0;
    }
  }

  /**
   * Check cache size and evict if necessary
   */
  private async checkAndEvict(): Promise<void> {
    const cacheSize = await this.getCacheSize();

    if (cacheSize > EVICTION_THRESHOLD) {
      const bytesToFree = cacheSize - EVICTION_TARGET;
      console.log(
        `[MediaManager] Cache size ${cacheSize} exceeds threshold ${EVICTION_THRESHOLD}, evicting ${bytesToFree} bytes`
      );
      await this.evictOldest(bytesToFree);
    }
  }

  // ============================================================================
  // Integrity
  // ============================================================================

  /**
   * Verify media integrity using SHA256 hash
   */
  async verifyIntegrity(requestId: string, filename: string): Promise<boolean> {
    const mediaId = `${requestId}:${filename}`;

    try {
      const db = await this.getDB();

      return new Promise<boolean>((resolve, reject) => {
        const transaction = db.transaction(MEDIA_META_STORE, "readonly");
        const store = transaction.objectStore(MEDIA_META_STORE);
        const request = store.get(mediaId);

        request.onsuccess = async () => {
          const meta = request.result as CachedMediaMeta | undefined;

          if (!meta || !meta.sha256Hash) {
            resolve(false);
            return;
          }

          // Get blob and compute hash
          const blobTransaction = db.transaction(MEDIA_BLOBS_STORE, "readonly");
          const blobStore = blobTransaction.objectStore(MEDIA_BLOBS_STORE);
          const blobRequest = blobStore.get(mediaId);

          blobRequest.onsuccess = async () => {
            const blob = blobRequest.result as CachedMediaBlob | undefined;

            if (!blob) {
              resolve(false);
              return;
            }

            // Compute SHA256 hash
            const hash = await this.computeSHA256(blob.data);
            const isValid = hash === meta.sha256Hash;

            if (isValid) {
              // Update verification status
              await this.updateMetadata(mediaId, { isVerified: true });
            }

            resolve(isValid);
          };

          blobRequest.onerror = () => {
            reject(blobRequest.error);
          };
        };

        request.onerror = () => {
          reject(request.error);
        };
      });
    } catch (error) {
      console.error("[MediaManager] verifyIntegrity error:", error);
      return false;
    }
  }

  /**
   * Compute SHA256 hash of blob
   */
  private async computeSHA256(blob: Blob): Promise<string> {
    const buffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    return hashHex;
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get total cache size in bytes
   */
  async getCacheSize(): Promise<number> {
    try {
      const db = await this.getDB();

      return new Promise<number>((resolve, reject) => {
        const transaction = db.transaction(MEDIA_BLOBS_STORE, "readonly");

        let totalSize = 0;

        const request = transaction.objectStore(MEDIA_BLOBS_STORE).openCursor();

        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            const blob = cursor.value as CachedMediaBlob;
            totalSize += blob.size;
            cursor.continue();
          }
        };

        transaction.oncomplete = () => {
          resolve(totalSize);
        };

        transaction.onerror = () => {
          reject(transaction.error);
        };
      });
    } catch (error) {
      console.error("[MediaManager] getCacheSize error:", error);
      return 0;
    }
  }

  /**
   * Get comprehensive cache statistics
   */
  async getStats(): Promise<CacheStats> {
    try {
      const db = await this.getDB();

      return new Promise<CacheStats>((resolve, reject) => {
        const transaction = db.transaction([MEDIA_META_STORE, MEDIA_BLOBS_STORE], "readonly");

        let mediaCount = 0;
        let pinnedCount = 0;
        let totalSize = 0;

        // Count media and pinned items
        const metaRequest = transaction.objectStore(MEDIA_META_STORE).openCursor();

        metaRequest.onsuccess = () => {
          const cursor = metaRequest.result;
          if (cursor) {
            const meta = cursor.value as CachedMediaMeta;
            mediaCount++;
            if (meta.isPinned) pinnedCount++;
            cursor.continue();
          }
        };

        // Calculate total size
        const blobRequest = transaction.objectStore(MEDIA_BLOBS_STORE).openCursor();

        blobRequest.onsuccess = () => {
          const cursor = blobRequest.result;
          if (cursor) {
            const blob = cursor.value as CachedMediaBlob;
            totalSize += blob.size;
            cursor.continue();
          }
        };

        transaction.oncomplete = () => {
          const totalRequests = this.cacheHits + this.cacheMisses;
          const hitRate = totalRequests > 0 ? this.cacheHits / totalRequests : 0;

          resolve({
            totalSize,
            mediaCount,
            pinnedCount,
            hitRate,
          });
        };

        transaction.onerror = () => {
          reject(transaction.error);
        };
      });
    } catch (error) {
      console.error("[MediaManager] getStats error:", error);
      return {
        totalSize: 0,
        mediaCount: 0,
        pinnedCount: 0,
        hitRate: 0,
      };
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Store media blob and metadata
   */
  private async storeMedia(
    requestId: string,
    filename: string,
    blob: Blob,
    request: MediaDownloadRequest
  ): Promise<void> {
    const mediaId = `${requestId}:${filename}`;
    const now = Date.now();

    try {
      const db = await this.getDB();

      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(
          [MEDIA_META_STORE, MEDIA_BLOBS_STORE],
          "readwrite"
        );

        transaction.oncomplete = () => {
          resolve();
        };

        transaction.onerror = () => {
          console.error("[MediaManager] Store transaction failed:", transaction.error);
          reject(transaction.error);
        };

        // Store metadata
        const metaStore = transaction.objectStore(MEDIA_META_STORE);
        metaStore.put({
          id: mediaId,
          requestId: request.requestId,
          messageId: request.messageId,
          filename: request.filename,
          mimeType: blob.type,
          fileSize: blob.size,
          downloadStatus: "completed",
          downloadProgress: 100,
          downloadedAt: now,
          sha256Hash: request.expectedHash || null,
          isVerified: !!request.expectedHash,
          localBlobKey: mediaId,
          thumbnailBlobKey: null,
          lastAccessedAt: now,
          isPinned: false,
          priority: request.priority,
        } as CachedMediaMeta);

        // Store blob
        const blobStore = transaction.objectStore(MEDIA_BLOBS_STORE);
        blobStore.put({
          key: mediaId,
          data: blob,
          size: blob.size,
          mimeType: blob.type,
          createdAt: now,
          lastAccessedAt: now,
        } as CachedMediaBlob);
      });
    } catch (error) {
      console.error("[MediaManager] storeMedia error:", error);
      throw error;
    }
  }

  /**
   * Update media metadata
   */
  private async updateMetadata(
    mediaId: string,
    updates: Partial<CachedMediaMeta>
  ): Promise<void> {
    try {
      const db = await this.getDB();

      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(MEDIA_META_STORE, "readwrite");
        const store = transaction.objectStore(MEDIA_META_STORE);
        const getRequest = store.get(mediaId);

        getRequest.onsuccess = () => {
          const meta = getRequest.result as CachedMediaMeta | undefined;

          if (meta) {
            // Merge updates
            const updated = { ...meta, ...updates };
            store.put(updated);
          }

          resolve();
        };

        getRequest.onerror = () => {
          reject(getRequest.error);
        };

        transaction.onerror = () => {
          reject(transaction.error);
        };
      });
    } catch (error) {
      console.error("[MediaManager] updateMetadata error:", error);
      throw error;
    }
  }

  /**
   * Update last accessed time for media
   */
  private async updateLastAccessed(mediaId: string): Promise<void> {
    await this.updateMetadata(mediaId, { lastAccessedAt: Date.now() });
  }

  /**
   * Clear all cached media
   */
  async clearAll(): Promise<void> {
    try {
      const db = await this.getDB();

      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(
          [MEDIA_META_STORE, MEDIA_BLOBS_STORE],
          "readwrite"
        );

        transaction.oncomplete = () => {
          console.log("[MediaManager] Cleared all media cache");
          resolve();
        };

        transaction.onerror = () => {
          console.error("[MediaManager] Clear all transaction failed:", transaction.error);
          reject(transaction.error);
        };

        transaction.objectStore(MEDIA_META_STORE).clear();
        transaction.objectStore(MEDIA_BLOBS_STORE).clear();
      });
    } catch (error) {
      console.error("[MediaManager] clearAll error:", error);
      throw error;
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const mediaManager = new MediaManager();
export default mediaManager;
