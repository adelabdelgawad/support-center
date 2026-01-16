/**
 * Image Cache Context - Persistent media cache for screenshots
 *
 * Prevents re-fetching images by maintaining a persistent cache of blob URLs.
 * Uses IndexedDB via MediaManager for persistent storage across app restarts.
 *
 * T041: Integrated with MediaManager for IndexedDB persistence
 * T043: Viewport-triggered lazy loading for optimal performance
 *
 * Benefits:
 * - Images cached persistently in IndexedDB (survives app restart)
 * - Viewport-aware loading - only downloads when media enters viewport
 * - Components can remount without triggering re-fetch
 * - Memory efficient (blob URLs are just pointers)
 * - Works with authentication (fetches with Bearer token)
 * - Cache-first approach - checks IndexedDB before network
 * - LRU eviction when cache exceeds limits
 */

import {
  createContext,
  useContext,
  createSignal,
  createEffect,
  onCleanup,
  type ParentComponent,
  type Accessor,
} from "solid-js";
import { authStore } from "@/stores";
import { RuntimeConfig } from "@/lib/runtime-config";
import { logger } from "@/logging";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { mediaManager } from "@/lib/media-manager";

interface ImageCacheContextValue {
  /**
   * Get cached blob URL for a screenshot filename.
   * Checks IndexedDB (MediaManager) first, then in-memory cache.
   * If not cached, downloads and caches it.
   */
  getImageUrl: (requestId: string, filename: string) => Promise<string>;

  /**
   * Check if image is cached (synchronous - checks in-memory only)
   * For accurate IndexedDB check, use isCachedAsync
   */
  isCached: (filename: string) => boolean;

  /**
   * Check if image is cached in IndexedDB (async - accurate)
   */
  isCachedAsync: (requestId: string, filename: string) => Promise<boolean>;

  /**
   * Get cache stats (for debugging)
   */
  getCacheStats: () => { size: number; filenames: string[] };

  /**
   * Clear entire cache (called on logout)
   */
  clearCache: () => void;

  /**
   * Remove specific image from cache
   */
  removeFromCache: (filename: string) => void;

  /**
   * Register image element for viewport-triggered lazy loading
   * Returns a cleanup function to unregister the element
   */
  registerForLazyLoading: (
    element: HTMLElement,
    requestId: string,
    filename: string,
    onLoad?: () => void,
    onError?: () => void
  ) => () => void;

  /**
   * Prefetch image for a given filename (for visible viewport images)
   */
  prefetchImage: (requestId: string, filename: string) => Promise<void>;
}

const ImageCacheContext = createContext<ImageCacheContextValue>();

/**
 * Global cache storage
 * Key: screenshot filename
 * Value: blob URL (blob:http://...)
 */
const imageCache = new Map<string, string>();

/**
 * Track in-flight requests to prevent duplicate fetches
 * Key: screenshot filename
 * Value: Promise<string> (resolves to blob URL)
 */
const inflightRequests = new Map<string, Promise<string>>();

/**
 * IntersectionObserver for viewport-triggered lazy loading
 * Images are only fetched when they enter the viewport
 */
let viewportObserver: IntersectionObserver | null = null;

/**
 * Track observed elements and their associated filenames
 * Key: HTMLElement (the image element)
 * Value: { requestId, filename, onLoad, onError }
 */
const observedElements = new WeakMap<HTMLElement, {
  requestId: string;
  filename: string;
  onLoad?: () => void;
  onError?: () => void;
}>();

/**
 * Initialize IntersectionObserver for lazy loading
 */
function initializeViewportObserver() {
  if (viewportObserver) return; // Already initialized

  if (typeof window === "undefined") return;

  viewportObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        // Only trigger when element enters viewport
        if (entry.isIntersecting) {
          const element = entry.target as HTMLElement;
          const data = observedElements.get(element);

          if (data?.requestId && data?.filename) {
            // Prefetch the image when it enters viewport
            fetchAndCacheImage(data.requestId, data.filename)
              .then((blobUrl) => {
                data.onLoad?.();
              })
              .catch((error) => {
                console.error(`[ImageCache] Failed to load image on viewport enter: ${data.filename}`, error);
                data.onError?.();
              });

            // Stop observing once triggered (image is cached now)
            viewportObserver?.unobserve(element);
            observedElements.delete(element);
          }
        }
      });
    },
    {
      // Trigger when element is 100px away from entering viewport
      rootMargin: "100px",
      // Trigger when at least 1px of the element is visible
      threshold: 0.01,
    }
  );

  logger.info('image', 'Viewport observer initialized for lazy loading');
}

/**
 * Cleanup viewport observer (called on logout/unmount)
 */
function cleanupViewportObserver() {
  if (viewportObserver) {
    viewportObserver.disconnect();
    viewportObserver = null;
  }
  observedElements.clear();
}

/**
 * Fetch screenshot with authentication and create blob URL
 * T041: Cache-first approach - checks MediaManager (IndexedDB) before network
 *
 * Flow:
 * 1. Check in-memory cache (fastest - already created blob URLs)
 * 2. Check MediaManager/IndexedDB (persistent cache)
 * 3. Download from network if not cached
 * 4. Store in MediaManager for persistence
 * 5. Create blob URL and cache in-memory for immediate access
 */
async function fetchAndCacheImage(requestId: string, filename: string): Promise<string> {
  // STEP 1: Check in-memory cache first (fastest - blob URLs already created)
  const cached = imageCache.get(filename);
  if (cached) {
    return cached;
  }

  // Check if already fetching (deduplicate concurrent requests)
  const inflight = inflightRequests.get(filename);
  if (inflight) {
    return inflight;
  }

  // Create fetch promise
  const fetchPromise = (async () => {
    try {
      // STEP 2: Check MediaManager (IndexedDB persistent cache)
      // This provides T041 persistence - images survive app restarts
      try {
        const isCached = await mediaManager.isMediaCached(requestId, filename);
        if (isCached) {
          logger.info('image', 'Screenshot found in IndexedDB cache', { filename });
          const blobUrl = await mediaManager.getMediaUrl(requestId, filename);

          if (blobUrl) {
            // Cache blob URL in-memory for instant subsequent access
            imageCache.set(filename, blobUrl);
            return blobUrl;
          }
        }
      } catch (dbError) {
        console.warn('[ImageCache] MediaManager check failed, falling back to network:', dbError);
        // Continue to network fetch if MediaManager fails
      }

      // STEP 3: Not cached - download from network
      const token = authStore.state.token;
      const apiUrl = RuntimeConfig.getServerAddress();
      const url = `${apiUrl}/screenshots/by-filename/${filename}`;

      // Log image fetch attempt
      logger.info('image', 'Fetching screenshot from network', {
        filename,
        requestId,
        hasToken: !!token,
      });

      // Use Tauri HTTP plugin to bypass CORS
      const response = await tauriFetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // Handle 410 Gone (screenshot deleted/expired) gracefully
      if (response.status === 410) {
        console.warn(`[ImageCache] ⚠️ Screenshot expired or deleted: ${filename}`);

        // Log screenshot expiration
        logger.warn('image', 'Screenshot expired or deleted', {
          filename,
          requestId,
          statusCode: 410,
        });

        // Return a data URL placeholder for expired screenshots
        const PLACEHOLDER_SVG = 'data:image/svg+xml,' + encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" width="200" height="150" viewBox="0 0 200 150">
            <rect width="200" height="150" fill="#f3f4f6"/>
            <text x="100" y="75" text-anchor="middle" font-family="Arial" font-size="14" fill="#9ca3af">
              Screenshot Expired
            </text>
          </svg>
        `);

        // Cache the placeholder to avoid repeated 410 requests
        imageCache.set(filename, PLACEHOLDER_SVG);
        return PLACEHOLDER_SVG;
      }

      if (!response.ok) {
        throw new Error(`Failed to load screenshot: ${response.status}`);
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      // STEP 4: Store in MediaManager for persistence (T041)
      // This allows the image to survive app restarts
      try {
        await mediaManager.downloadMedia({
          requestId,
          messageId: '', // Not available in this context
          filename,
          presignedUrl: url,
          expectedSize: blob.size,
          priority: 'normal',
        });
        logger.info('image', 'Screenshot cached in IndexedDB', {
          filename,
          requestId,
          size: blob.size,
        });
      } catch (dbError) {
        console.warn('[ImageCache] Failed to cache in MediaManager:', dbError);
        // Continue anyway - we have the blob URL
      }

      // Cache the blob URL in-memory for immediate subsequent access
      // This is kept separate from IndexedDB for performance
      imageCache.set(filename, blobUrl);

      // Log successful image load
      logger.info('image', 'Screenshot loaded successfully', {
        filename,
        requestId,
        size: blob.size,
      });

      return blobUrl;
    } catch (error) {
      console.error(`[ImageCache] ❌ Fetch failed: ${filename}`, error);

      // Log image fetch failure
      logger.error('image', 'Screenshot fetch failed', {
        filename,
        requestId,
        error: String(error),
        errorType: error?.constructor?.name,
      });

      // Provide fallback placeholder for any fetch error
      const ERROR_PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="200" height="150" viewBox="0 0 200 150">
          <rect width="200" height="150" fill="#fee2e2"/>
          <text x="100" y="75" text-anchor="middle" font-family="Arial" font-size="14" fill="#dc2626">
            Failed to Load
          </text>
        </svg>
      `);

      // Cache error placeholder to prevent retry storms
      imageCache.set(filename, ERROR_PLACEHOLDER);
      return ERROR_PLACEHOLDER;
    } finally {
      // Remove from inflight tracking
      inflightRequests.delete(filename);
    }
  })();

  // Track as inflight to deduplicate concurrent requests
  inflightRequests.set(filename, fetchPromise);

  return fetchPromise;
}

export const ImageCacheProvider: ParentComponent = (props) => {
  const getImageUrl = async (requestId: string, filename: string): Promise<string> => {
    return fetchAndCacheImage(requestId, filename);
  };

  const isCached = (filename: string): boolean => {
    // Synchronous check for in-memory cache only
    // For accurate IndexedDB check, use isCachedAsync
    return imageCache.has(filename);
  };

  const isCachedAsync = async (requestId: string, filename: string): Promise<boolean> => {
    // Check in-memory cache first
    if (imageCache.has(filename)) {
      return true;
    }

    // Check IndexedDB via MediaManager
    try {
      return await mediaManager.isMediaCached(requestId, filename);
    } catch (error) {
      console.warn('[ImageCache] Failed to check IndexedDB cache:', error);
      return false;
    }
  };

  const getCacheStats = () => {
    return {
      size: imageCache.size,
      filenames: Array.from(imageCache.keys()),
    };
  };

  const clearCache = () => {
    // Revoke all blob URLs to free memory
    for (const blobUrl of imageCache.values()) {
      URL.revokeObjectURL(blobUrl);
    }

    imageCache.clear();
    inflightRequests.clear();

    // Also cleanup viewport observer
    cleanupViewportObserver();
  };

  const removeFromCache = (filename: string) => {
    const blobUrl = imageCache.get(filename);
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      imageCache.delete(filename);
    }
  };

  /**
   * Register image element for viewport-triggered lazy loading
   * Returns a cleanup function to unregister the element
   */
  const registerForLazyLoading = (
    element: HTMLElement,
    requestId: string,
    filename: string,
    onLoad?: () => void,
    onError?: () => void
  ): (() => void) => {
    // If image is already cached (in-memory), no need to observe
    if (imageCache.has(filename)) {
      // Still call onLoad to maintain consistent behavior
      onLoad?.();
      return () => {}; // No-op cleanup function
    }

    // Initialize observer on first use
    if (!viewportObserver) {
      initializeViewportObserver();
    }

    // Store element metadata
    observedElements.set(element, { requestId, filename, onLoad, onError });

    // Start observing the element
    viewportObserver?.observe(element);

    logger.debug('image', 'Registered element for lazy loading', {
      filename,
      requestId,
      hasObserver: !!viewportObserver,
    });

    // Return cleanup function
    return () => {
      viewportObserver?.unobserve(element);
      observedElements.delete(element);
    };
  };

  /**
   * Prefetch image for a given filename
   * Used for visible viewport images to fetch immediately
   */
  const prefetchImage = async (requestId: string, filename: string): Promise<void> => {
    if (imageCache.has(filename)) {
      logger.debug('image', 'Image already cached (in-memory), skipping prefetch', { filename });
      return;
    }

    // Check IndexedDB cache
    try {
      const isCached = await mediaManager.isMediaCached(requestId, filename);
      if (isCached) {
        logger.debug('image', 'Image cached in IndexedDB, prefetching to memory', { filename });
        // This will fetch from IndexedDB and cache in-memory
        await fetchAndCacheImage(requestId, filename);
        return;
      }
    } catch (error) {
      logger.warn('image', 'Failed to check IndexedDB during prefetch', { filename, error });
    }

    logger.info('image', 'Prefetching image for visible viewport', { filename, requestId });
    await fetchAndCacheImage(requestId, filename);
  };

  // Clear cache when user logs out
  createEffect(() => {
    const isAuthenticated = authStore.state.isAuthenticated;

    // When user becomes unauthenticated (logs out), clear the cache
    if (!isAuthenticated && imageCache.size > 0) {
      clearCache();
    }
  });

  // Cleanup viewport observer on provider unmount
  onCleanup(() => {
    cleanupViewportObserver();
  });

  const value: ImageCacheContextValue = {
    getImageUrl,
    isCached,
    isCachedAsync,
    getCacheStats,
    clearCache,
    removeFromCache,
    registerForLazyLoading,
    prefetchImage,
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
