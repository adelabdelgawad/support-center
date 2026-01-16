/**
 * MediaManager - Media File Caching with LRU Eviction
 *
 * Manages media file caching in IndexedDB with automatic LRU eviction
 * when cache size exceeds limits. Handles downloading, caching, and
 * serving media files for the IT App.
 *
 * @module cache/media-manager
 * @version 3.0.0
 */

import { openCacheDB } from './db';
import type {
  CachedMediaMeta,
  CachedMediaBlob,
  MediaDownloadRequest,
  MediaDownloadResult,
  MediaPriority,
} from './schemas';
import { STORE_NAMES, CACHE_LIMITS } from './schemas';

// Cache size limits
const BROWSER_MAX_SIZE = CACHE_LIMITS.BROWSER_MAX_SIZE_MB * 1024 * 1024; // 100MB
const EVICTION_THRESHOLD = BROWSER_MAX_SIZE * 0.9; // 90MB
const EVICTION_TARGET = BROWSER_MAX_SIZE * 0.8; // 80MB

/**
 * MediaManager - Handles media file caching with LRU eviction
 */
export class MediaManager {
  constructor(private userId: string) {}

  /**
   * Get database instance
   */
  private async getDB() {
    return openCacheDB(this.userId);
  }

  /**
   * Download and cache media blob
   *
   * Downloads media from presigned URL, caches it in IndexedDB,
   * and returns a blob URL for immediate use. Handles cache eviction
   * if size limits are exceeded.
   *
   * @param meta - Download request metadata
   * @returns Download result with local URL or error
   */
  async downloadMedia(meta: MediaDownloadRequest): Promise<MediaDownloadResult> {
    const { requestId, filename, presignedUrl } = meta;
    const cacheKey = `${requestId}:${filename}`;

    // Check if already cached
    if (await this.isMediaCached(requestId, filename)) {
      const url = await this.getMediaUrl(requestId, filename);
      return { success: true, localUrl: url!, fromCache: true };
    }

    try {
      // Download from server
      const response = await fetch(presignedUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const blob = await response.blob();
      const size = blob.size;

      // Check cache size and evict if needed
      const currentSize = await this.getCacheSize();
      if (currentSize + size > EVICTION_THRESHOLD) {
        const bytesToFree = currentSize + size - EVICTION_TARGET;
        const freed = await this.evictOldest(bytesToFree);
        console.log(`[MediaManager] Freed ${freed} bytes to make room for ${size} bytes`);
      }

      // Store in IndexedDB
      const db = await this.getDB();
      const tx = db.transaction(
        [STORE_NAMES.MEDIA_META, STORE_NAMES.MEDIA_BLOBS],
        'readwrite'
      );

      // Store blob
      const blobKey = cacheKey;
      await tx.objectStore(STORE_NAMES.MEDIA_BLOBS).put({
        key: blobKey,
        data: blob,
        size,
        mimeType: blob.type,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
      } as CachedMediaBlob);

      // Store metadata
      await tx.objectStore(STORE_NAMES.MEDIA_META).put({
        id: cacheKey,
        requestId,
        messageId: meta.messageId,
        filename,
        mimeType: blob.type,
        fileSize: size,
        downloadStatus: 'completed',
        downloadProgress: 100,
        downloadedAt: Date.now(),
        sha256Hash: meta.expectedHash || null,
        isVerified: false, // TODO: Implement hash verification
        localBlobKey: blobKey,
        thumbnailBlobKey: null,
        lastAccessedAt: Date.now(),
        isPinned: false,
        priority: meta.priority || 'normal',
      } as CachedMediaMeta);

      await tx.done;

      // Return blob URL
      const url = URL.createObjectURL(blob);
      console.log(`[MediaManager] Downloaded and cached ${filename} (${size} bytes)`);
      return { success: true, localUrl: url, fromCache: false };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[MediaManager] Failed to download ${filename}:`, errorMessage);
      return {
        success: false,
        error: errorMessage,
        fromCache: false,
      };
    }
  }

  /**
   * Get blob URL for cached media
   *
   * Returns a blob URL for the cached media if available, and updates
   * the last accessed time for LRU tracking.
   *
   * @param requestId - Request ID
   * @param filename - Media filename
   * @returns Blob URL or null if not cached
   */
  async getMediaUrl(requestId: string, filename: string): Promise<string | null> {
    const db = await this.getDB();
    const cacheKey = `${requestId}:${filename}`;

    const meta = await db.get(STORE_NAMES.MEDIA_META, cacheKey);
    if (!meta) {
      return null;
    }

    const blobRecord = await db.get(STORE_NAMES.MEDIA_BLOBS, meta.localBlobKey!);
    if (!blobRecord) {
      console.warn(`[MediaManager] Blob not found for ${cacheKey}`);
      return null;
    }

    // Update last accessed time asynchronously
    this._updateLastAccessed(cacheKey).catch((err) => {
      console.error('[MediaManager] Failed to update last accessed:', err);
    });

    return URL.createObjectURL(blobRecord.data);
  }

  /**
   * Check if media is cached
   *
   * @param requestId - Request ID
   * @param filename - Media filename
   * @returns True if media is fully cached
   */
  async isMediaCached(requestId: string, filename: string): Promise<boolean> {
    const db = await this.getDB();
    const cacheKey = `${requestId}:${filename}`;
    const meta = await db.get(STORE_NAMES.MEDIA_META, cacheKey);
    return meta?.downloadStatus === 'completed';
  }

  /**
   * Get total media cache size
   *
   * @returns Total size in bytes
   */
  async getCacheSize(): Promise<number> {
    const db = await this.getDB();
    const blobs = await db.getAll(STORE_NAMES.MEDIA_BLOBS);
    return blobs.reduce((sum, b) => sum + b.size, 0);
  }

  /**
   * Evict specific media from cache
   *
   * Removes both the metadata and blob for the specified media.
   *
   * @param requestId - Request ID
   * @param filename - Media filename
   */
  async evictMedia(requestId: string, filename: string): Promise<void> {
    const db = await this.getDB();
    const cacheKey = `${requestId}:${filename}`;

    const meta = await db.get(STORE_NAMES.MEDIA_META, cacheKey);
    if (meta?.localBlobKey) {
      await db.delete(STORE_NAMES.MEDIA_BLOBS, meta.localBlobKey);
    }
    await db.delete(STORE_NAMES.MEDIA_META, cacheKey);
    console.log(`[MediaManager] Evicted ${cacheKey}`);
  }

  /**
   * LRU eviction - remove oldest accessed media
   *
   * Evicts unpinned media in order of last accessed time until the
   * specified number of bytes have been freed.
   *
   * @param bytesToFree - Number of bytes to free
   * @returns Actual bytes freed
   */
  async evictOldest(bytesToFree: number): Promise<number> {
    const db = await this.getDB();

    // Get all media sorted by lastAccessed (oldest first)
    const allMedia = await db.getAll(STORE_NAMES.MEDIA_META);
    const sorted = allMedia
      .filter((m) => !m.isPinned && m.downloadStatus === 'completed')
      .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);

    let freed = 0;
    const evicted: string[] = [];

    for (const media of sorted) {
      if (freed >= bytesToFree) break;

      const blobRecord = await db.get(STORE_NAMES.MEDIA_BLOBS, media.localBlobKey!);
      if (blobRecord) {
        freed += blobRecord.size;
        await db.delete(STORE_NAMES.MEDIA_BLOBS, media.localBlobKey!);
        await db.delete(STORE_NAMES.MEDIA_META, media.id);
        evicted.push(media.id);
      }
    }

    if (evicted.length > 0) {
      console.log(`[MediaManager] Evicted ${evicted.length} items (${freed} bytes):`, evicted);
    }

    return freed;
  }

  /**
   * Pin media to prevent eviction
   *
   * Pinned media will not be evicted by LRU eviction. Useful for
   * important or frequently accessed media.
   *
   * @param requestId - Request ID
   * @param filename - Media filename
   */
  async pinMedia(requestId: string, filename: string): Promise<void> {
    const db = await this.getDB();
    const cacheKey = `${requestId}:${filename}`;
    const meta = await db.get(STORE_NAMES.MEDIA_META, cacheKey);
    if (meta) {
      await db.put(STORE_NAMES.MEDIA_META, { ...meta, isPinned: true });
      console.log(`[MediaManager] Pinned ${cacheKey}`);
    }
  }

  /**
   * Unpin media to allow eviction
   *
   * @param requestId - Request ID
   * @param filename - Media filename
   */
  async unpinMedia(requestId: string, filename: string): Promise<void> {
    const db = await this.getDB();
    const cacheKey = `${requestId}:${filename}`;
    const meta = await db.get(STORE_NAMES.MEDIA_META, cacheKey);
    if (meta) {
      await db.put(STORE_NAMES.MEDIA_META, { ...meta, isPinned: false });
      console.log(`[MediaManager] Unpinned ${cacheKey}`);
    }
  }

  /**
   * Verify media integrity using hash
   *
   * Checks if the cached media matches the expected SHA-256 hash.
   * This is useful for detecting corrupted downloads.
   *
   * @param requestId - Request ID
   * @param filename - Media filename
   * @returns True if media is verified or hash not available
   */
  async verifyIntegrity(requestId: string, filename: string): Promise<boolean> {
    const db = await this.getDB();
    const cacheKey = `${requestId}:${filename}`;

    const meta = await db.get(STORE_NAMES.MEDIA_META, cacheKey);
    if (!meta?.sha256Hash) {
      // No hash available, assume valid
      return true;
    }

    const blobRecord = await db.get(STORE_NAMES.MEDIA_BLOBS, meta.localBlobKey!);
    if (!blobRecord) {
      return false;
    }

    try {
      // Compute SHA-256 hash
      const hash = await this._computeHash(blobRecord.data);
      const isValid = hash === meta.sha256Hash;

      // Update verification status
      await db.put(STORE_NAMES.MEDIA_META, { ...meta, isVerified: isValid });

      if (!isValid) {
        console.error(`[MediaManager] Hash mismatch for ${cacheKey}`);
      }

      return isValid;
    } catch (error) {
      console.error(`[MediaManager] Failed to verify integrity:`, error);
      return false;
    }
  }

  /**
   * Get download progress for media
   *
   * @param requestId - Request ID
   * @param filename - Media filename
   * @returns Download status and progress (0-100)
   */
  async getDownloadProgress(
    requestId: string,
    filename: string
  ): Promise<{ status: string; progress: number } | null> {
    const db = await this.getDB();
    const cacheKey = `${requestId}:${filename}`;
    const meta = await db.get(STORE_NAMES.MEDIA_META, cacheKey);

    if (!meta) {
      return null;
    }

    return {
      status: meta.downloadStatus,
      progress: meta.downloadProgress,
    };
  }

  /**
   * Get all cached media for a request
   *
   * @param requestId - Request ID
   * @returns Array of cached media metadata
   */
  async getRequestMedia(requestId: string): Promise<CachedMediaMeta[]> {
    const db = await this.getDB();
    const index = db.transaction(STORE_NAMES.MEDIA_META).store.index('by_request');
    return await index.getAll(requestId);
  }

  /**
   * Clear all cached media (use with caution)
   */
  async clearAllMedia(): Promise<void> {
    const db = await this.getDB();
    await db.clear(STORE_NAMES.MEDIA_BLOBS);
    await db.clear(STORE_NAMES.MEDIA_META);
    console.log('[MediaManager] Cleared all media cache');
  }

  /**
   * Update last accessed time for LRU tracking
   */
  private async _updateLastAccessed(cacheKey: string): Promise<void> {
    const db = await this.getDB();
    const meta = await db.get(STORE_NAMES.MEDIA_META, cacheKey);
    if (meta) {
      await db.put(STORE_NAMES.MEDIA_META, {
        ...meta,
        lastAccessedAt: Date.now(),
      });
    }
  }

  /**
   * Compute SHA-256 hash of blob
   */
  private async _computeHash(blob: Blob): Promise<string> {
    const buffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
}

// Type exports
export type { MediaDownloadRequest, MediaDownloadResult, MediaPriority };
