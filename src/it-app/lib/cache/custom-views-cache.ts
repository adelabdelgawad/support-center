/**
 * Custom Views Cache Utility
 *
 * Provides localStorage-based caching for user custom view settings.
 * This enables instant page rendering without waiting for custom view API.
 *
 * Cache Strategy:
 * - On first load: use default view settings, fetch in background
 * - On subsequent loads: use cached settings, revalidate in background
 * - Cache persists per user for instant rendering
 */

import type { ViewType } from '@/types/requests-list';

const CACHE_KEY = 'custom-view-settings';
const CACHE_VERSION = 'v1';

interface CachedCustomView {
  version: string;
  visibleTabs: ViewType[];
  defaultTab: ViewType;
  timestamp: number;
}

// Default view settings (fallback when no cache)
export const DEFAULT_VIEW_SETTINGS = {
  visibleTabs: [
    'unassigned',
    'all_unsolved',
    'my_unsolved',
    'recently_updated',
    'recently_solved',
  ] as ViewType[],
  defaultTab: 'unassigned' as ViewType,
};

/**
 * Get cached custom view settings
 * Returns defaults if no cache exists
 */
export function getCachedCustomView(): {
  visibleTabs: ViewType[];
  defaultTab: ViewType;
} {
  if (typeof window === 'undefined') {
    return DEFAULT_VIEW_SETTINGS;
  }

  try {
    const cached = localStorage.getItem(CACHE_KEY);

    if (!cached) {
      return DEFAULT_VIEW_SETTINGS;
    }

    const parsed: CachedCustomView = JSON.parse(cached);

    // Validate cache version
    if (parsed.version !== CACHE_VERSION) {
      localStorage.removeItem(CACHE_KEY);
      return DEFAULT_VIEW_SETTINGS;
    }

    return {
      visibleTabs: parsed.visibleTabs,
      defaultTab: parsed.defaultTab,
    };
  } catch (error) {
    console.warn('[CustomViewsCache] Failed to read cache:', error);
    return DEFAULT_VIEW_SETTINGS;
  }
}

/**
 * Save custom view settings to cache
 */
export function setCachedCustomView(
  visibleTabs: ViewType[],
  defaultTab: ViewType
): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const cacheData: CachedCustomView = {
      version: CACHE_VERSION,
      visibleTabs,
      defaultTab,
      timestamp: Date.now(),
    };

    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
  } catch (error) {
    console.warn('[CustomViewsCache] Failed to write cache:', error);
  }
}

/**
 * Clear custom view cache
 */
export function clearCustomViewCache(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (error) {
    console.warn('[CustomViewsCache] Failed to clear cache:', error);
  }
}
