/**
 * Image Cache Context - Global blob URL cache for screenshots
 *
 * Prevents re-fetching images by maintaining a persistent cache of blob URLs.
 * Blob URLs are NOT revoked when components unmount, allowing reuse across renders.
 *
 * Benefits:
 * - Images fetched once and cached forever (until app restart)
 * - Components can remount without triggering re-fetch
 * - Memory efficient (blob URLs are just pointers)
 * - Works with authentication (fetches with Bearer token)
 */

import {
  createContext,
  useContext,
  createSignal,
  createEffect,
  type ParentComponent,
  type Accessor,
} from "solid-js";
import { authStore } from "@/stores";
import { RuntimeConfig } from "@/lib/runtime-config";

interface ImageCacheContextValue {
  /**
   * Get cached blob URL for a screenshot filename.
   * If not cached, fetches image and caches it.
   */
  getImageUrl: (filename: string) => Promise<string>;

  /**
   * Check if image is cached (synchronous)
   */
  isCached: (filename: string) => boolean;

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
 * Fetch screenshot with authentication and create blob URL
 */
async function fetchAndCacheImage(filename: string): Promise<string> {
  // Check cache first
  const cached = imageCache.get(filename);
  if (cached) {
    return cached;
  }

  // Check if already fetching
  const inflight = inflightRequests.get(filename);
  if (inflight) {
    return inflight;
  }

  // Create fetch promise
  const fetchPromise = (async () => {
    try {
      const token = authStore.state.token;
      const apiUrl = RuntimeConfig.getServerAddress();
      const url = `${apiUrl}/screenshots/by-filename/${filename}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // Handle 410 Gone (screenshot deleted/expired) gracefully
      if (response.status === 410) {
        console.warn(`[ImageCache] ⚠️ Screenshot expired or deleted: ${filename}`);
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

      // Cache the blob URL (NEVER revoke it - let it persist)
      imageCache.set(filename, blobUrl);

      return blobUrl;
    } catch (error) {
      console.error(`[ImageCache] ❌ Fetch failed: ${filename}`, error);
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

  // Track as inflight
  inflightRequests.set(filename, fetchPromise);

  return fetchPromise;
}

export const ImageCacheProvider: ParentComponent = (props) => {
  const getImageUrl = async (filename: string): Promise<string> => {
    return fetchAndCacheImage(filename);
  };

  const isCached = (filename: string): boolean => {
    return imageCache.has(filename);
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
  };

  const removeFromCache = (filename: string) => {
    const blobUrl = imageCache.get(filename);
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      imageCache.delete(filename);
    }
  };

  // Clear cache when user logs out
  createEffect(() => {
    const isAuthenticated = authStore.state.isAuthenticated;

    // When user becomes unauthenticated (logs out), clear the cache
    if (!isAuthenticated && imageCache.size > 0) {
      clearCache();
    }
  });

  const value: ImageCacheContextValue = {
    getImageUrl,
    isCached,
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
