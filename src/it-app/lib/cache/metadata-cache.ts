/**
 * Global Metadata Cache Utility
 *
 * Provides localStorage-based caching for global metadata (priorities, statuses, technicians, categories).
 * This enables instant rendering without waiting for metadata API calls.
 *
 * Cache Strategy:
 * - On first load: use cached metadata, fetch in background
 * - On subsequent loads: use cached metadata, revalidate in background
 * - Cache persists per browser session for instant rendering
 * - Long TTL (1 hour) since this data rarely changes
 */

import type { Priority, RequestStatus, Technician } from '@/types/metadata';
import type { Category } from '@/lib/hooks/use-categories-tags';

const CACHE_VERSION = 'v1';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CachedMetadata<T> {
  version: string;
  data: T;
  timestamp: number;
}

const CACHE_KEYS = {
  priorities: 'metadata-priorities',
  statuses: 'metadata-statuses',
  technicians: 'metadata-technicians',
  categories: 'metadata-categories',
};

/**
 * Generic function to get cached metadata
 */
function getCachedData<T>(key: string): T | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const cached = localStorage.getItem(key);
    if (!cached) return null;

    const parsed: CachedMetadata<T> = JSON.parse(cached);

    // Validate cache version
    if (parsed.version !== CACHE_VERSION) {
      localStorage.removeItem(key);
      return null;
    }

    // Check if cache is stale (older than TTL)
    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) {
      // Don't remove - still use stale data but signal for revalidation
      return parsed.data;
    }

    return parsed.data;
  } catch (error) {
    console.warn(`[MetadataCache] Failed to read ${key}:`, error);
    return null;
  }
}

/**
 * Generic function to set cached metadata
 */
function setCachedData<T>(key: string, data: T): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const cacheData: CachedMetadata<T> = {
      version: CACHE_VERSION,
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(cacheData));
  } catch (error) {
    console.warn(`[MetadataCache] Failed to write ${key}:`, error);
  }
}

/**
 * Check if cache is stale (needs revalidation)
 */
function isCacheStale(key: string): boolean {
  if (typeof window === 'undefined') {
    return true;
  }

  try {
    const cached = localStorage.getItem(key);
    if (!cached) return true;

    const parsed = JSON.parse(cached);
    return Date.now() - parsed.timestamp > CACHE_TTL_MS;
  } catch {
    return true;
  }
}

// Priorities
export function getCachedPriorities(): Priority[] | null {
  return getCachedData<Priority[]>(CACHE_KEYS.priorities);
}

export function setCachedPriorities(data: Priority[]): void {
  setCachedData(CACHE_KEYS.priorities, data);
}

export function isPrioritiesCacheStale(): boolean {
  return isCacheStale(CACHE_KEYS.priorities);
}

// Statuses
export function getCachedStatuses(): RequestStatus[] | null {
  return getCachedData<RequestStatus[]>(CACHE_KEYS.statuses);
}

export function setCachedStatuses(data: RequestStatus[]): void {
  setCachedData(CACHE_KEYS.statuses, data);
}

export function isStatusesCacheStale(): boolean {
  return isCacheStale(CACHE_KEYS.statuses);
}

// Technicians
export function getCachedTechnicians(): Technician[] | null {
  return getCachedData<Technician[]>(CACHE_KEYS.technicians);
}

export function setCachedTechnicians(data: Technician[]): void {
  setCachedData(CACHE_KEYS.technicians, data);
}

export function isTechniciansCacheStale(): boolean {
  return isCacheStale(CACHE_KEYS.technicians);
}

// Categories
export function getCachedCategories(): Category[] | null {
  return getCachedData<Category[]>(CACHE_KEYS.categories);
}

export function setCachedCategories(data: Category[]): void {
  setCachedData(CACHE_KEYS.categories, data);
}

export function isCategoriesCacheStale(): boolean {
  return isCacheStale(CACHE_KEYS.categories);
}

/**
 * Clear all metadata caches
 */
export function clearAllMetadataCaches(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    Object.values(CACHE_KEYS).forEach((key) => {
      localStorage.removeItem(key);
    });
  } catch (error) {
    console.warn('[MetadataCache] Failed to clear caches:', error);
  }
}
