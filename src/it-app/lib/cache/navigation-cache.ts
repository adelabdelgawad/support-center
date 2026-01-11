/**
 * Navigation Cache Utility
 *
 * Provides dual caching for user navigation pages:
 * 1. Cookie-based cache: Read by server for SSR (instant, no API call)
 * 2. localStorage cache: Fallback for client-side
 *
 * Cache Strategy:
 * - Server render: reads from cookie (instant navigation)
 * - Client hydration: uses same data (no mismatch)
 * - Background: SWR fetches fresh data and updates both caches
 */

import type { Page } from '@/types/pages';

const CACHE_KEY_PREFIX = 'nav-pages:';
const COOKIE_NAME = 'nav_pages';
const CACHE_VERSION = 'v1';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes soft TTL for staleness detection

interface CachedNavigation {
  version: string;
  userId: string;
  pages: Page[];
  timestamp: number;
}

/**
 * Clear oversized nav_pages cookie if it exists
 * Called on app initialization to prevent browser warnings
 * Note: This is expected behavior when user has many navigation pages - localStorage fallback works fine
 */
export function clearOversizedCookie(): void {
  if (typeof window === 'undefined') return;

  try {
    const cookieValue = document.cookie
      .split('; ')
      .find((row) => row.startsWith(`${COOKIE_NAME}=`))
      ?.split('=')[1];

    // If cookie exists and is large, clear it silently
    // This is expected when user has many pages - localStorage fallback handles it
    if (cookieValue && cookieValue.length > 3800) {
      document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`;
    }
  } catch (error) {
    // Ignore errors during cleanup
  }
}

/**
 * Get cached navigation pages for a user
 * Returns null if no cache exists or cache is for different user
 */
export function getCachedNavigation(userId: string): Page[] | null {
  if (typeof window === 'undefined') {
    return null;
  }

  // Clear any oversized cookies on first access
  clearOversizedCookie();

  try {
    const cacheKey = `${CACHE_KEY_PREFIX}${userId}`;
    const cached = localStorage.getItem(cacheKey);

    if (!cached) {
      return null;
    }

    const parsed: CachedNavigation = JSON.parse(cached);

    // Validate cache version and user ID
    if (parsed.version !== CACHE_VERSION || parsed.userId !== userId) {
      localStorage.removeItem(cacheKey);
      return null;
    }

    return parsed.pages;
  } catch (error) {
    console.warn('[NavigationCache] Failed to read cache:', error);
    return null;
  }
}

/**
 * Check if cached navigation is stale (older than TTL)
 * Stale cache can still be used but should trigger background refresh
 */
export function isCacheStale(userId: string): boolean {
  if (typeof window === 'undefined') {
    return true;
  }

  try {
    const cacheKey = `${CACHE_KEY_PREFIX}${userId}`;
    const cached = localStorage.getItem(cacheKey);

    if (!cached) {
      return true;
    }

    const parsed: CachedNavigation = JSON.parse(cached);
    const age = Date.now() - parsed.timestamp;

    return age > CACHE_TTL_MS;
  } catch {
    return true;
  }
}

/**
 * Save navigation pages to cache (localStorage + cookie)
 */
export function setCachedNavigation(userId: string, pages: Page[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const cacheKey = `${CACHE_KEY_PREFIX}${userId}`;
    const cacheData: CachedNavigation = {
      version: CACHE_VERSION,
      userId,
      pages,
      timestamp: Date.now(),
    };

    // Save to localStorage
    localStorage.setItem(cacheKey, JSON.stringify(cacheData));

    // Also save to cookie for SSR (compress to essential fields only)
    // Handle both camelCase (from backend) and snake_case (from cache)
    const cookiePages = pages.map(p => ({
      id: p.id,
      title: p.title,
      path: p.path,
      icon: p.icon,
      parent_id: (p as any).parentId ?? p.parent_id ?? null,
      is_active: p.is_active ?? (p as any).isActive ?? true,
    }));

    const cookieData = JSON.stringify({
      v: CACHE_VERSION,
      u: userId,
      p: cookiePages,
    });

    // URL-encode and check size (encoding can add ~3x size for special chars)
    const encodedCookie = encodeURIComponent(cookieData);

    // Set cookie with 1 day expiry, httpOnly=false so JS can set it
    // Max cookie size is 4096 bytes - be conservative to account for cookie name/attributes
    if (encodedCookie.length < 3800) {
      document.cookie = `${COOKIE_NAME}=${encodedCookie}; path=/; max-age=86400; SameSite=Lax`;
    } else {
      // Cookie would be too large - clear any existing cookie and use localStorage only
      // This is expected behavior when user has many navigation pages
      document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`;
    }
  } catch (error) {
    console.warn('[NavigationCache] Failed to write cache:', error);
  }
}

/**
 * Clear navigation cache for a user
 * Call this when user permissions change
 */
export function clearNavigationCache(userId: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const cacheKey = `${CACHE_KEY_PREFIX}${userId}`;
    localStorage.removeItem(cacheKey);
  } catch (error) {
    console.warn('[NavigationCache] Failed to clear cache:', error);
  }
}

/**
 * Clear all navigation caches (for logout)
 */
export function clearAllNavigationCaches(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    // Clear localStorage
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(CACHE_KEY_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));

    // Clear cookie
    document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`;
  } catch (error) {
    console.warn('[NavigationCache] Failed to clear all caches:', error);
  }
}

/**
 * Get navigation from cookie (for server-side use)
 * Returns the cookie value that can be parsed on the server
 */
export function getNavigationCookieName(): string {
  return COOKIE_NAME;
}

/**
 * Parse navigation cookie value (for server-side use)
 */
export function parseNavigationCookie(cookieValue: string, userId: string): Page[] | null {
  try {
    const decoded = decodeURIComponent(cookieValue);
    const data = JSON.parse(decoded);

    // Validate version and user
    if (data.v !== CACHE_VERSION || data.u !== userId) {
      return null;
    }

    // Transform back to Page format
    return data.p.map((p: any) => ({
      id: p.id,
      title: p.title,
      path: p.path,
      icon: p.icon,
      parent_id: p.parent_id,
      is_active: p.is_active,
      isActive: p.is_active,
    }));
  } catch {
    return null;
  }
}
