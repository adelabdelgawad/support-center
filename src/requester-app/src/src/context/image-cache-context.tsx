/**
 * Image Cache Context - Persistent image caching with offline support
 *
 * Architecture:
 * - SQLite → metadata & index only (no blobs, no base64)
 * - Filesystem → actual image bytes (%APPDATA%/supportcenter.requester/images/)
 *
 * Features:
 * - Cache-first loading (instant if cached on filesystem)
 * - NOT_FOUND status tracking (prevents retry spam for 404s)
 * - User-initiated retry for failed images
 * - Automatic cleanup (7-day expiry)
 * - Works with authentication (fetches with Bearer token)
 * - Backward-compatible migration from blob-based storage
 *
 * Status Flow:
 * 1. Check SQLite metadata → if CACHED, load from filesystem and return blob URL
 * 2. If NOT_FOUND/ERROR → return status for UI handling
 * 3. If not cached → fetch from server
 *    - On success → write to filesystem + store metadata in SQLite
 *    - On 404/410 → mark NOT_FOUND in SQLite
 *    - On error → mark ERROR in SQLite
 */

import {
  createContext,
  useContext,
  createEffect,
  type ParentComponent,
} from "solid-js";
import { authStore } from "@/stores";
import { RuntimeConfig } from "@/lib/runtime-config";
import { logger } from "@/logging";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { sqliteImageCache, type ImageCacheStatus } from "@/lib/sqlite-image-cache";

// Re-export for consumers
export type { ImageCacheStatus } from "@/lib/sqlite-image-cache";

/**
 * Result of getting an image URL
 */
export interface ImageFetchResult {
  status: ImageCacheStatus | 'LOADING' | 'PENDING';
  blobUrl: string | null;
  errorMessage: string | null;
}

interface ImageCacheContextValue {
  /**
   * Get cached blob URL for a screenshot filename.
   * If cached → returns immediately
   * If NOT_FOUND/ERROR → returns status for UI handling
   * If not cached → fetches, caches, and returns
   *
   * @param filename - Screenshot filename
   * @param requestId - Request ID for cache association (optional, for cache organization)
   */
  getImageUrl: (filename: string, requestId?: string) => Promise<ImageFetchResult>;

  /**
   * Check if image is cached (synchronous check of in-memory cache only)
   */
  isCached: (filename: string) => boolean;

  /**
   * Retry fetching a failed image
   * Clears the error status and re-attempts fetch
   */
  retryImage: (filename: string, requestId?: string) => Promise<ImageFetchResult>;

  /**
   * Get cache stats (for debugging)
   */
  getCacheStats: () => Promise<{
    totalImages: number;
    cachedImages: number;
    notFoundImages: number;
    errorImages: number;
    totalSizeMB: number;
    blobUrlCount: number;
    inflightCount: number;
  }>;

  /**
   * Clear entire cache (called on logout)
   */
  clearCache: () => Promise<void>;

  /**
   * Remove specific image from cache
   */
  removeFromCache: (filename: string) => Promise<void>;
}

const ImageCacheContext = createContext<ImageCacheContextValue>();

/**
 * In-memory tracking for quick checks
 * Maps filename to current status
 */
const statusCache = new Map<string, ImageCacheStatus>();

/**
 * Track in-flight requests to prevent duplicate fetches
 */
const inflightRequests = new Map<string, Promise<ImageFetchResult>>();

/**
 * Placeholder SVGs for different states
 */
const EXPIRED_PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="200" height="150" viewBox="0 0 200 150">
    <rect width="200" height="150" fill="#f3f4f6"/>
    <text x="100" y="75" text-anchor="middle" font-family="Arial" font-size="14" fill="#9ca3af">
      Screenshot Expired
    </text>
  </svg>
`);

const ERROR_PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="200" height="150" viewBox="0 0 200 150">
    <rect width="200" height="150" fill="#fee2e2"/>
    <text x="100" y="75" text-anchor="middle" font-family="Arial" font-size="14" fill="#dc2626">
      Failed to Load
    </text>
  </svg>
`);

/**
 * Fetch and cache an image
 */
async function fetchAndCacheImage(filename: string, requestId: string): Promise<ImageFetchResult> {
  // Check SQLite cache first
  const cachedResult = await sqliteImageCache.getCachedImage(filename);

  if (cachedResult) {
    // Update in-memory status cache
    statusCache.set(filename, cachedResult.status);

    if (cachedResult.status === 'CACHED' && cachedResult.blobUrl) {
      return {
        status: 'CACHED',
        blobUrl: cachedResult.blobUrl,
        errorMessage: null,
      };
    }

    if (cachedResult.status === 'NOT_FOUND') {
      return {
        status: 'NOT_FOUND',
        blobUrl: EXPIRED_PLACEHOLDER,
        errorMessage: cachedResult.errorMessage,
      };
    }

    if (cachedResult.status === 'ERROR') {
      return {
        status: 'ERROR',
        blobUrl: ERROR_PLACEHOLDER,
        errorMessage: cachedResult.errorMessage,
      };
    }
  }

  // Check if already fetching
  const inflight = inflightRequests.get(filename);
  if (inflight) {
    return inflight;
  }

  // Create fetch promise
  const fetchPromise = (async (): Promise<ImageFetchResult> => {
    try {
      const token = authStore.state.token;
      const apiUrl = RuntimeConfig.getServerAddress();
      const url = `${apiUrl}/screenshots/by-filename/${filename}`;

      logger.info('image', 'Fetching screenshot', {
        filename,
        hasToken: !!token,
      });

      // Use Tauri HTTP plugin to bypass CORS
      const response = await tauriFetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // Handle 404/410 Gone (screenshot deleted/expired)
      if (response.status === 404 || response.status === 410) {
        console.warn(`[ImageCache] Screenshot not found: ${filename} (${response.status})`);

        logger.warn('image', 'Screenshot not found', {
          filename,
          statusCode: response.status,
        });

        // Cache as NOT_FOUND to prevent repeated requests
        await sqliteImageCache.markNotFound(filename, requestId);
        statusCache.set(filename, 'NOT_FOUND');

        return {
          status: 'NOT_FOUND',
          blobUrl: EXPIRED_PLACEHOLDER,
          errorMessage: 'Screenshot not found on server',
        };
      }

      if (!response.ok) {
        throw new Error(`Failed to load screenshot: ${response.status}`);
      }

      const blob = await response.blob();

      // Cache to SQLite
      await sqliteImageCache.cacheImage(filename, requestId, blob);
      statusCache.set(filename, 'CACHED');

      // Get blob URL from cache (it creates one during cacheImage)
      const result = await sqliteImageCache.getCachedImage(filename);

      logger.info('image', 'Screenshot loaded and cached', {
        filename,
        size: blob.size,
      });

      return {
        status: 'CACHED',
        blobUrl: result?.blobUrl ?? URL.createObjectURL(blob),
        errorMessage: null,
      };
    } catch (error) {
      console.error(`[ImageCache] Fetch failed: ${filename}`, error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error('image', 'Screenshot fetch failed', {
        filename,
        error: errorMessage,
      });

      // Cache as ERROR to prevent immediate retry spam
      await sqliteImageCache.markError(filename, requestId, errorMessage);
      statusCache.set(filename, 'ERROR');

      return {
        status: 'ERROR',
        blobUrl: ERROR_PLACEHOLDER,
        errorMessage,
      };
    } finally {
      // Remove from inflight tracking
      inflightRequests.delete(filename);
    }
  })();

  // Track as inflight
  inflightRequests.set(filename, fetchPromise);

  return fetchPromise;
}

export const ImageCacheProvider: ParentComponent = (props) => {
  const getImageUrl = async (filename: string, requestId?: string): Promise<ImageFetchResult> => {
    return fetchAndCacheImage(filename, requestId || 'unknown');
  };

  const isCached = (filename: string): boolean => {
    return statusCache.get(filename) === 'CACHED';
  };

  const retryImage = async (filename: string, requestId?: string): Promise<ImageFetchResult> => {
    // Clear the error status to allow re-fetch
    await sqliteImageCache.clearForRetry(filename);
    statusCache.delete(filename);

    // Re-fetch
    return fetchAndCacheImage(filename, requestId || 'unknown');
  };

  const getCacheStats = async () => {
    const stats = await sqliteImageCache.getStats();
    return {
      ...stats,
      inflightCount: inflightRequests.size,
    };
  };

  const clearCache = async () => {
    await sqliteImageCache.clearAll();
    statusCache.clear();
    inflightRequests.clear();
  };

  const removeFromCache = async (filename: string) => {
    await sqliteImageCache.removeFromCache(filename);
    statusCache.delete(filename);
  };

  // Clear cache when user logs out
  createEffect(() => {
    const isAuthenticated = authStore.state.isAuthenticated;

    // When user becomes unauthenticated (logs out), clear the cache
    if (!isAuthenticated && statusCache.size > 0) {
      clearCache().catch(console.error);
    }
  });

  const value: ImageCacheContextValue = {
    getImageUrl,
    isCached,
    retryImage,
    getCacheStats,
    clearCache,
    removeFromCache,
  };

  return (
    <ImageCacheContext.Provider value={value}>
      {props.children}
    </ImageCacheContext.Provider>
  );
};

/**
 * Hook to access image cache
 */
export function useImageCache(): ImageCacheContextValue {
  const context = useContext(ImageCacheContext);
  if (!context) {
    throw new Error("useImageCache must be used within ImageCacheProvider");
  }
  return context;
}

// Initialize SQLite image cache on app startup
if (typeof window !== "undefined") {
  sqliteImageCache.init().catch(console.error);
}
