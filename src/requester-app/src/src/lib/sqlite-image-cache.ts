/**
 * SQLite Image Cache for Tauri App (Filesystem-Backed)
 *
 * Provides persistent image caching with offline support and retry capability.
 * Images are stored on the filesystem, SQLite stores metadata only.
 *
 * Architecture:
 * - SQLite → metadata & index only (no blobs, no base64)
 * - Filesystem → actual image bytes (%APPDATA%/supportcenter.requester/images/)
 *
 * Features:
 * - Cache-first loading (instant if cached)
 * - NOT_FOUND/ERROR status tracking (prevents retry spam)
 * - User-initiated retry support
 * - Automatic cleanup (7-day expiry)
 * - LRU eviction when cache exceeds limits
 * - Backward-compatible migration from blob-based storage
 *
 * Status:
 * - CACHED: Image data available on filesystem
 * - NOT_FOUND: Server returned 404/410 (image doesn't exist)
 * - ERROR: Network or other error occurred
 */

import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";

const DB_PATH = "sqlite:image_cache.db";
const CACHE_EXPIRY_DAYS = 7;
const MAX_CACHE_SIZE_MB = 100;
const MAX_IMAGES = 500;

// Debug configuration
const DEBUG_ENABLED = false;

function debugLog(category: string, message: string, data?: unknown) {
  if (!DEBUG_ENABLED) return;
  const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
  const prefix = `[ImageCache:${category}][${timestamp}]`;
  if (data !== undefined) {
    console.log(prefix, message, data);
  } else {
    console.log(prefix, message);
  }
}

/**
 * Image cache entry status
 */
export type ImageCacheStatus = 'CACHED' | 'NOT_FOUND' | 'ERROR';

/**
 * Image cache entry (metadata only - no blob data)
 */
export interface ImageCacheEntry {
  id: number;
  filename: string;
  requestId: string;
  status: ImageCacheStatus;
  filePath: string | null; // Relative path in images directory
  mimeType: string | null;
  sizeBytes: number | null;
  cachedAt: number;
  lastAccessedAt: number;
  retryCount: number;
  errorMessage: string | null;
}

/**
 * Result of getting a cached image
 */
export interface ImageCacheResult {
  status: ImageCacheStatus;
  blobUrl: string | null;
  errorMessage: string | null;
}

/**
 * Result of reading an image from filesystem (from Rust)
 */
interface ImageReadResult {
  base64_data: string;
  mime_type: string;
  size_bytes: number;
}

class SQLiteImageCacheService {
  private db: Database | null = null;
  private dbPromise: Promise<Database> | null = null;
  private initialized = false;
  private migrationRun = false;

  // Write queue for serialization
  private writeQueue: Promise<void> = Promise.resolve();

  // In-memory blob URL cache (to avoid re-creating blob URLs)
  private blobUrlCache = new Map<string, string>();

  /**
   * Initialize database on app startup
   */
  async init(): Promise<void> {
    const startTime = Date.now();
    debugLog('INIT', 'Pre-warming SQLite image cache...');

    try {
      await this.getDB();
      debugLog('INIT', `Image cache ready in ${Date.now() - startTime}ms`);
    } catch (error) {
      debugLog('INIT', `Image cache warmup failed: ${error}`);
    }
  }

  /**
   * Execute write operation with serialization
   */
  private async withWriteLock<T>(_operationName: string, operation: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.writeQueue = this.writeQueue
        .then(async () => {
          const result = await operation();
          return result;
        })
        .then(resolve)
        .catch(reject);
    });
  }

  /**
   * Initialize SQLite database with NEW schema (metadata only)
   */
  private async getDB(): Promise<Database> {
    if (this.db && this.initialized) return this.db;

    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = (async () => {
      try {
        const db = await Database.load(DB_PATH);
        this.db = db;

        // Use DELETE journal mode for immediate writes
        await db.execute(`PRAGMA journal_mode = DELETE`);
        await db.execute(`PRAGMA synchronous = FULL`);

        // Check if old schema exists (has base64_data column)
        const tableInfo = await db.select<{ name: string }[]>(
          `PRAGMA table_info(image_cache)`
        );

        const hasLegacyColumn = tableInfo.some(col => col.name === 'base64_data');

        if (hasLegacyColumn) {
          // Migrate to new schema
          console.log("[SQLiteImageCache] Migrating to filesystem-backed schema...");
          await this.migrateToFilesystemSchema(db);
        } else {
          // Check if table exists at all
          const tables = await db.select<{ name: string }[]>(
            `SELECT name FROM sqlite_master WHERE type='table' AND name='image_cache'`
          );

          if (tables.length === 0) {
            // Create new schema from scratch
            await this.createNewSchema(db);
          }
        }

        this.initialized = true;
        console.log("[SQLiteImageCache] Database initialized successfully (filesystem-backed)");
        return db;
      } catch (error) {
        console.error("[SQLiteImageCache] Failed to initialize database:", error);
        throw error;
      }
    })();

    return this.dbPromise;
  }

  /**
   * Create new metadata-only schema
   */
  private async createNewSchema(db: Database): Promise<void> {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS image_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT UNIQUE NOT NULL,
        request_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'CACHED',
        file_path TEXT,
        mime_type TEXT,
        size_bytes INTEGER,
        cached_at INTEGER NOT NULL,
        last_accessed_at INTEGER NOT NULL,
        retry_count INTEGER DEFAULT 0,
        error_message TEXT
      )
    `);

    // Create indexes
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_image_cache_filename
      ON image_cache(filename)
    `);

    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_image_cache_request_id
      ON image_cache(request_id)
    `);

    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_image_cache_cached_at
      ON image_cache(cached_at)
    `);

    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_image_cache_last_accessed
      ON image_cache(last_accessed_at)
    `);

    console.log("[SQLiteImageCache] Created new metadata-only schema");
  }

  /**
   * Migrate from blob-based schema to filesystem-backed schema
   * This extracts images from SQLite and writes them to filesystem
   */
  private async migrateToFilesystemSchema(db: Database): Promise<void> {
    if (this.migrationRun) return;
    this.migrationRun = true;

    try {
      // Get all rows with blob data
      const legacyRows = await db.select<{
        filename: string;
        request_id: string;
        status: string;
        base64_data: string | null;
        mime_type: string | null;
        size_bytes: number | null;
        cached_at: number;
        last_accessed_at: number;
        retry_count: number;
        error_message: string | null;
      }[]>(`SELECT * FROM image_cache WHERE base64_data IS NOT NULL`);

      console.log(`[SQLiteImageCache] Found ${legacyRows.length} legacy entries to migrate`);

      // Migrate each image to filesystem
      let migratedCount = 0;
      for (const row of legacyRows) {
        if (row.base64_data && row.status === 'CACHED') {
          try {
            // Write to filesystem using Rust command
            const filePath = await invoke<string>('image_storage_write', {
              filename: row.filename,
              base64Data: row.base64_data,
            });

            // Update row to clear blob and set file_path
            await db.execute(
              `UPDATE image_cache
               SET base64_data = NULL, file_path = ?
               WHERE filename = ?`,
              [filePath, row.filename]
            );

            migratedCount++;
            debugLog('MIGRATE', `Migrated: ${row.filename}`);
          } catch (error) {
            console.error(`[SQLiteImageCache] Failed to migrate ${row.filename}:`, error);
            // Mark as error so it can be re-fetched
            await db.execute(
              `UPDATE image_cache
               SET status = 'ERROR', error_message = 'Migration failed', base64_data = NULL
               WHERE filename = ?`,
              [row.filename]
            );
          }
        }
      }

      console.log(`[SQLiteImageCache] Migrated ${migratedCount} images to filesystem`);

      // Now alter the table to remove the base64_data column
      // SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
      await this.recreateTableWithoutBlobColumn(db);

    } catch (error) {
      console.error("[SQLiteImageCache] Migration failed:", error);
      throw error;
    }
  }

  /**
   * Recreate table without blob column (SQLite doesn't support DROP COLUMN well)
   */
  private async recreateTableWithoutBlobColumn(db: Database): Promise<void> {
    // Create new table with correct schema
    await db.execute(`
      CREATE TABLE IF NOT EXISTS image_cache_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT UNIQUE NOT NULL,
        request_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'CACHED',
        file_path TEXT,
        mime_type TEXT,
        size_bytes INTEGER,
        cached_at INTEGER NOT NULL,
        last_accessed_at INTEGER NOT NULL,
        retry_count INTEGER DEFAULT 0,
        error_message TEXT
      )
    `);

    // Copy data (excluding base64_data)
    await db.execute(`
      INSERT INTO image_cache_new (id, filename, request_id, status, file_path, mime_type, size_bytes, cached_at, last_accessed_at, retry_count, error_message)
      SELECT id, filename, request_id, status, file_path, mime_type, size_bytes, cached_at, last_accessed_at, retry_count, error_message
      FROM image_cache
    `);

    // Drop old table
    await db.execute(`DROP TABLE image_cache`);

    // Rename new table
    await db.execute(`ALTER TABLE image_cache_new RENAME TO image_cache`);

    // Recreate indexes
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_image_cache_filename
      ON image_cache(filename)
    `);

    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_image_cache_request_id
      ON image_cache(request_id)
    `);

    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_image_cache_cached_at
      ON image_cache(cached_at)
    `);

    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_image_cache_last_accessed
      ON image_cache(last_accessed_at)
    `);

    console.log("[SQLiteImageCache] Table schema migrated to filesystem-backed");
  }

  // ==========================================================================
  // Core Operations
  // ==========================================================================

  /**
   * Get cached image by filename
   * Returns status and blob URL if cached
   */
  async getCachedImage(filename: string): Promise<ImageCacheResult | null> {
    try {
      const db = await this.getDB();

      const rows = await db.select<Record<string, unknown>[]>(
        `SELECT * FROM image_cache WHERE filename = ?`,
        [filename]
      );

      if (rows.length === 0) {
        return null;
      }

      const row = rows[0];
      const status = row.status as ImageCacheStatus;
      const filePath = row.file_path as string | null;

      // Update last accessed time (fire-and-forget)
      this.updateLastAccessed(filename).catch(() => {});

      // If NOT_FOUND or ERROR, return status without blob
      if (status === 'NOT_FOUND' || status === 'ERROR') {
        return {
          status,
          blobUrl: null,
          errorMessage: row.error_message as string | null,
        };
      }

      // Check if we already have a blob URL in memory
      const existingBlobUrl = this.blobUrlCache.get(filename);
      if (existingBlobUrl) {
        return {
          status: 'CACHED',
          blobUrl: existingBlobUrl,
          errorMessage: null,
        };
      }

      // Load from filesystem and create blob URL
      if (!filePath) {
        return {
          status: 'ERROR',
          blobUrl: null,
          errorMessage: 'File path is missing',
        };
      }

      try {
        // Read from filesystem using Rust command
        const result = await invoke<ImageReadResult>('image_storage_read', {
          filename: filePath,
        });

        const blobUrl = this.base64ToBlobUrl(result.base64_data, result.mime_type);
        this.blobUrlCache.set(filename, blobUrl);

        return {
          status: 'CACHED',
          blobUrl,
          errorMessage: null,
        };
      } catch (error) {
        // File doesn't exist on disk - mark as error
        console.error(`[SQLiteImageCache] Failed to read from filesystem: ${error}`);
        return {
          status: 'ERROR',
          blobUrl: null,
          errorMessage: 'Cached file not found on disk',
        };
      }
    } catch (error) {
      debugLog('READ', `getCachedImage error: ${error}`);
      return null;
    }
  }

  /**
   * Cache a successfully fetched image
   */
  async cacheImage(
    filename: string,
    requestId: string,
    blob: Blob
  ): Promise<void> {
    return this.withWriteLock(`cacheImage(${filename})`, async () => {
      try {
        const db = await this.getDB();
        const now = Date.now();

        // Convert blob to base64
        const base64Data = await this.blobToBase64(blob);
        const mimeType = blob.type || 'image/png';
        const sizeBytes = blob.size;

        // Write to filesystem using Rust command
        const filePath = await invoke<string>('image_storage_write', {
          filename,
          base64Data,
        });

        // Create blob URL and cache it in memory
        const blobUrl = URL.createObjectURL(blob);
        this.blobUrlCache.set(filename, blobUrl);

        // Store metadata only in SQLite (no blob data!)
        await db.execute(
          `INSERT OR REPLACE INTO image_cache
           (filename, request_id, status, file_path, mime_type, size_bytes, cached_at, last_accessed_at, retry_count, error_message)
           VALUES (?, ?, 'CACHED', ?, ?, ?, ?, ?, 0, NULL)`,
          [filename, requestId, filePath, mimeType, sizeBytes, now, now]
        );

        debugLog('WRITE', `Cached image: ${filename}, size: ${sizeBytes} bytes`);

        // Check if we need to evict old images
        this.checkAndEvict().catch(() => {});
      } catch (error) {
        debugLog('WRITE', `cacheImage error: ${error}`);
        throw error;
      }
    });
  }

  /**
   * Mark an image as NOT_FOUND (404/410)
   */
  async markNotFound(filename: string, requestId: string): Promise<void> {
    return this.withWriteLock(`markNotFound(${filename})`, async () => {
      try {
        const db = await this.getDB();
        const now = Date.now();

        await db.execute(
          `INSERT OR REPLACE INTO image_cache
           (filename, request_id, status, file_path, mime_type, size_bytes, cached_at, last_accessed_at, retry_count, error_message)
           VALUES (?, ?, 'NOT_FOUND', NULL, NULL, NULL, ?, ?, 0, 'Image not found on server')`,
          [filename, requestId, now, now]
        );

        debugLog('WRITE', `Marked as NOT_FOUND: ${filename}`);
      } catch (error) {
        debugLog('WRITE', `markNotFound error: ${error}`);
      }
    });
  }

  /**
   * Mark an image as ERROR (network error, etc.)
   */
  async markError(filename: string, requestId: string, errorMessage: string): Promise<void> {
    return this.withWriteLock(`markError(${filename})`, async () => {
      try {
        const db = await this.getDB();
        const now = Date.now();

        // Get current retry count
        const rows = await db.select<{ retry_count: number }[]>(
          `SELECT retry_count FROM image_cache WHERE filename = ?`,
          [filename]
        );

        const currentRetryCount = rows.length > 0 ? rows[0].retry_count : 0;

        await db.execute(
          `INSERT OR REPLACE INTO image_cache
           (filename, request_id, status, file_path, mime_type, size_bytes, cached_at, last_accessed_at, retry_count, error_message)
           VALUES (?, ?, 'ERROR', NULL, NULL, NULL, ?, ?, ?, ?)`,
          [filename, requestId, now, now, currentRetryCount + 1, errorMessage]
        );

        debugLog('WRITE', `Marked as ERROR: ${filename}, error: ${errorMessage}`);
      } catch (error) {
        debugLog('WRITE', `markError error: ${error}`);
      }
    });
  }

  /**
   * Clear error/not_found status for retry
   * Returns true if entry was cleared (retry allowed)
   */
  async clearForRetry(filename: string): Promise<boolean> {
    return this.withWriteLock(`clearForRetry(${filename})`, async () => {
      try {
        const db = await this.getDB();

        // Delete the entry so it can be re-fetched
        await db.execute(
          `DELETE FROM image_cache WHERE filename = ? AND status IN ('NOT_FOUND', 'ERROR')`,
          [filename]
        );

        // Also remove from blob URL cache
        const blobUrl = this.blobUrlCache.get(filename);
        if (blobUrl) {
          URL.revokeObjectURL(blobUrl);
          this.blobUrlCache.delete(filename);
        }

        debugLog('WRITE', `Cleared for retry: ${filename}`);
        return true;
      } catch (error) {
        debugLog('WRITE', `clearForRetry error: ${error}`);
        return false;
      }
    });
  }

  /**
   * Remove specific image from cache (metadata and file)
   */
  async removeFromCache(filename: string): Promise<void> {
    return this.withWriteLock(`removeFromCache(${filename})`, async () => {
      try {
        const db = await this.getDB();

        // Get file path before deleting
        const rows = await db.select<{ file_path: string | null }[]>(
          `SELECT file_path FROM image_cache WHERE filename = ?`,
          [filename]
        );

        if (rows.length > 0 && rows[0].file_path) {
          // Delete from filesystem
          try {
            await invoke('image_storage_delete', { filename: rows[0].file_path });
          } catch (error) {
            console.warn(`[SQLiteImageCache] Failed to delete file: ${error}`);
          }
        }

        await db.execute(`DELETE FROM image_cache WHERE filename = ?`, [filename]);

        // Revoke blob URL if exists
        const blobUrl = this.blobUrlCache.get(filename);
        if (blobUrl) {
          URL.revokeObjectURL(blobUrl);
          this.blobUrlCache.delete(filename);
        }

        debugLog('WRITE', `Removed from cache: ${filename}`);
      } catch (error) {
        debugLog('WRITE', `removeFromCache error: ${error}`);
      }
    });
  }

  /**
   * Clear all cached images for a specific request
   */
  async clearRequestImages(requestId: string): Promise<void> {
    return this.withWriteLock(`clearRequestImages(${requestId})`, async () => {
      try {
        const db = await this.getDB();

        // Get filenames and file paths first
        const rows = await db.select<{ filename: string; file_path: string | null }[]>(
          `SELECT filename, file_path FROM image_cache WHERE request_id = ?`,
          [requestId]
        );

        for (const row of rows) {
          // Delete from filesystem
          if (row.file_path) {
            try {
              await invoke('image_storage_delete', { filename: row.file_path });
            } catch (error) {
              console.warn(`[SQLiteImageCache] Failed to delete file: ${error}`);
            }
          }

          // Revoke blob URL
          const blobUrl = this.blobUrlCache.get(row.filename);
          if (blobUrl) {
            URL.revokeObjectURL(blobUrl);
            this.blobUrlCache.delete(row.filename);
          }
        }

        await db.execute(`DELETE FROM image_cache WHERE request_id = ?`, [requestId]);

        debugLog('WRITE', `Cleared all images for request: ${requestId}`);
      } catch (error) {
        debugLog('WRITE', `clearRequestImages error: ${error}`);
      }
    });
  }

  // ==========================================================================
  // Maintenance Operations
  // ==========================================================================

  /**
   * Update last accessed time
   */
  private async updateLastAccessed(filename: string): Promise<void> {
    try {
      const db = await this.getDB();
      await db.execute(
        `UPDATE image_cache SET last_accessed_at = ? WHERE filename = ?`,
        [Date.now(), filename]
      );
    } catch (error) {
      // Non-critical, ignore errors
    }
  }

  /**
   * Check cache size and evict if necessary
   */
  private async checkAndEvict(): Promise<void> {
    try {
      const db = await this.getDB();

      // Check total count
      const countResult = await db.select<{ count: number }[]>(
        `SELECT COUNT(*) as count FROM image_cache WHERE status = 'CACHED'`
      );

      const count = countResult[0]?.count ?? 0;

      if (count > MAX_IMAGES) {
        // Evict oldest accessed images
        const toEvict = count - MAX_IMAGES + 50; // Evict 50 extra to avoid frequent eviction
        await this.evictOldestImages(toEvict);
      }

      // Check total size from filesystem
      const totalSizeBytes = await invoke<number>('image_storage_get_size');
      const totalSizeMB = totalSizeBytes / (1024 * 1024);

      if (totalSizeMB > MAX_CACHE_SIZE_MB) {
        // Evict until under limit
        await this.evictUntilUnderSize(MAX_CACHE_SIZE_MB * 0.8); // Target 80% of limit
      }
    } catch (error) {
      debugLog('MAINT', `checkAndEvict error: ${error}`);
    }
  }

  /**
   * Evict oldest accessed images
   */
  private async evictOldestImages(count: number): Promise<void> {
    try {
      const db = await this.getDB();

      // Get oldest accessed images
      const rows = await db.select<{ filename: string; file_path: string | null }[]>(
        `SELECT filename, file_path FROM image_cache
         WHERE status = 'CACHED'
         ORDER BY last_accessed_at ASC
         LIMIT ?`,
        [count]
      );

      for (const row of rows) {
        // Delete from filesystem
        if (row.file_path) {
          try {
            await invoke('image_storage_delete', { filename: row.file_path });
          } catch (error) {
            console.warn(`[SQLiteImageCache] Failed to delete file: ${error}`);
          }
        }

        // Revoke blob URL
        const blobUrl = this.blobUrlCache.get(row.filename);
        if (blobUrl) {
          URL.revokeObjectURL(blobUrl);
          this.blobUrlCache.delete(row.filename);
        }
      }

      const filenames = rows.map(r => r.filename);
      if (filenames.length > 0) {
        const placeholders = filenames.map(() => '?').join(',');
        await db.execute(
          `DELETE FROM image_cache WHERE filename IN (${placeholders})`,
          filenames
        );
      }

      debugLog('MAINT', `Evicted ${rows.length} oldest images`);
    } catch (error) {
      debugLog('MAINT', `evictOldestImages error: ${error}`);
    }
  }

  /**
   * Evict images until total size is under target
   */
  private async evictUntilUnderSize(targetMB: number): Promise<void> {
    try {
      const db = await this.getDB();
      const targetBytes = targetMB * 1024 * 1024;

      // Get current size from filesystem
      let currentSize = await invoke<number>('image_storage_get_size');

      if (currentSize <= targetBytes) return;

      // Get images ordered by last accessed (oldest first)
      const rows = await db.select<{ filename: string; file_path: string | null; size_bytes: number }[]>(
        `SELECT filename, file_path, size_bytes FROM image_cache
         WHERE status = 'CACHED'
         ORDER BY last_accessed_at ASC`
      );

      const toDelete: string[] = [];

      for (const row of rows) {
        if (currentSize <= targetBytes) break;

        toDelete.push(row.filename);
        currentSize -= row.size_bytes || 0;

        // Delete from filesystem
        if (row.file_path) {
          try {
            await invoke('image_storage_delete', { filename: row.file_path });
          } catch (error) {
            console.warn(`[SQLiteImageCache] Failed to delete file: ${error}`);
          }
        }

        // Revoke blob URL
        const blobUrl = this.blobUrlCache.get(row.filename);
        if (blobUrl) {
          URL.revokeObjectURL(blobUrl);
          this.blobUrlCache.delete(row.filename);
        }
      }

      if (toDelete.length > 0) {
        const placeholders = toDelete.map(() => '?').join(',');
        await db.execute(
          `DELETE FROM image_cache WHERE filename IN (${placeholders})`,
          toDelete
        );
      }

      debugLog('MAINT', `Evicted ${toDelete.length} images to reduce size`);
    } catch (error) {
      debugLog('MAINT', `evictUntilUnderSize error: ${error}`);
    }
  }

  /**
   * Clean up expired cache entries
   */
  async cleanupExpiredCache(): Promise<void> {
    return this.withWriteLock('cleanupExpiredCache', async () => {
      try {
        const db = await this.getDB();
        const expiryTime = Date.now() - CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

        // Get filenames and file paths to delete
        const rows = await db.select<{ filename: string; file_path: string | null }[]>(
          `SELECT filename, file_path FROM image_cache WHERE cached_at < ?`,
          [expiryTime]
        );

        for (const row of rows) {
          // Delete from filesystem
          if (row.file_path) {
            try {
              await invoke('image_storage_delete', { filename: row.file_path });
            } catch (error) {
              console.warn(`[SQLiteImageCache] Failed to delete expired file: ${error}`);
            }
          }

          // Revoke blob URL
          const blobUrl = this.blobUrlCache.get(row.filename);
          if (blobUrl) {
            URL.revokeObjectURL(blobUrl);
            this.blobUrlCache.delete(row.filename);
          }
        }

        // Delete expired entries from SQLite
        await db.execute(`DELETE FROM image_cache WHERE cached_at < ?`, [expiryTime]);

        debugLog('MAINT', `Cleaned up ${rows.length} expired images`);
      } catch (error) {
        debugLog('MAINT', `cleanupExpiredCache error: ${error}`);
      }
    });
  }

  /**
   * Clear all cached images (called on logout)
   */
  async clearAll(): Promise<void> {
    return this.withWriteLock('clearAll', async () => {
      try {
        const db = await this.getDB();

        // Revoke all blob URLs
        for (const blobUrl of this.blobUrlCache.values()) {
          URL.revokeObjectURL(blobUrl);
        }
        this.blobUrlCache.clear();

        // Delete all files from filesystem
        try {
          await invoke('image_storage_clear_all');
        } catch (error) {
          console.warn(`[SQLiteImageCache] Failed to clear filesystem: ${error}`);
        }

        // Delete all entries from SQLite
        await db.execute(`DELETE FROM image_cache`);

        debugLog('MAINT', `Cleared all cached images`);
      } catch (error) {
        debugLog('MAINT', `clearAll error: ${error}`);
      }
    });
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    totalImages: number;
    cachedImages: number;
    notFoundImages: number;
    errorImages: number;
    totalSizeMB: number;
    blobUrlCount: number;
  }> {
    try {
      const db = await this.getDB();

      const countResult = await db.select<{ status: string; count: number }[]>(
        `SELECT status, COUNT(*) as count FROM image_cache GROUP BY status`
      );

      // Get total size from filesystem
      let totalSizeBytes = 0;
      try {
        totalSizeBytes = await invoke<number>('image_storage_get_size');
      } catch (error) {
        console.warn(`[SQLiteImageCache] Failed to get filesystem size: ${error}`);
      }

      const stats = {
        totalImages: 0,
        cachedImages: 0,
        notFoundImages: 0,
        errorImages: 0,
        totalSizeMB: totalSizeBytes / (1024 * 1024),
        blobUrlCount: this.blobUrlCache.size,
      };

      for (const row of countResult) {
        stats.totalImages += row.count;
        if (row.status === 'CACHED') stats.cachedImages = row.count;
        if (row.status === 'NOT_FOUND') stats.notFoundImages = row.count;
        if (row.status === 'ERROR') stats.errorImages = row.count;
      }

      return stats;
    } catch (error) {
      debugLog('READ', `getStats error: ${error}`);
      return {
        totalImages: 0,
        cachedImages: 0,
        notFoundImages: 0,
        errorImages: 0,
        totalSizeMB: 0,
        blobUrlCount: this.blobUrlCache.size,
      };
    }
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Convert blob to base64 string
   */
  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        // Remove data URL prefix (data:image/png;base64,)
        const base64Data = base64.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Convert base64 string to blob URL
   */
  private base64ToBlobUrl(base64Data: string, mimeType: string): string {
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });
    return URL.createObjectURL(blob);
  }
}

// Singleton instance
export const sqliteImageCache = new SQLiteImageCacheService();

// Initialize cleanup on load
if (typeof window !== "undefined") {
  // Run cleanup after a short delay
  setTimeout(() => {
    sqliteImageCache.cleanupExpiredCache().catch(console.error);
  }, 10000);
}

// Debug tools for console
if (typeof window !== "undefined") {
  (window as any).sqliteImageCache = sqliteImageCache;
  (window as any).getImageCacheStats = () => sqliteImageCache.getStats().then(console.log);
}

export default sqliteImageCache;
