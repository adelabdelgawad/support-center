/**
 * Request Deduplicator
 *
 * Prevents redundant API calls when multiple sources trigger the same request.
 * Provides:
 * - In-flight request deduplication (same key returns existing promise)
 * - Recent result caching with TTL (avoids re-fetch within TTL window)
 *
 * Usage:
 * ```ts
 * const result = await deduplicatedFetch(
 *   `messages:${requestId}:${limit}`,
 *   () => fetchMessages(requestId, limit)
 * );
 * ```
 */

// Map of in-flight requests (key -> pending promise)
const inflightRequests = new Map<string, Promise<unknown>>();

// Map of recent results with timestamps (key -> { data, timestamp })
const recentResults = new Map<string, { data: unknown; timestamp: number }>();

// Default TTL for recent results (2 seconds)
const RESULT_TTL_MS = 2000;

/**
 * Execute a fetch function with deduplication.
 *
 * If an identical request is in-flight, returns the existing promise.
 * If a recent result exists within TTL, returns the cached result.
 * Otherwise, makes a new request.
 *
 * @param key - Unique key identifying the request
 * @param fetchFn - Function that performs the actual fetch
 * @param ttlMs - Optional custom TTL for caching (default: 2000ms)
 * @returns Promise resolving to the fetch result
 */
export function deduplicatedFetch<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttlMs: number = RESULT_TTL_MS
): Promise<T> {
  // Check recent results (avoid re-fetch within TTL)
  const recent = recentResults.get(key);
  if (recent && Date.now() - recent.timestamp < ttlMs) {
    console.log(`[RequestDeduplicator] Cache hit for key: ${key}`);
    return Promise.resolve(recent.data as T);
  }

  // Check inflight requests (deduplicate concurrent calls)
  const inflight = inflightRequests.get(key);
  if (inflight) {
    console.log(`[RequestDeduplicator] Deduplicating in-flight request: ${key}`);
    return inflight as Promise<T>;
  }

  // Make new request
  console.log(`[RequestDeduplicator] New request: ${key}`);
  const promise = fetchFn()
    .then((data) => {
      // Cache the result with timestamp
      recentResults.set(key, { data, timestamp: Date.now() });
      return data;
    })
    .finally(() => {
      // Remove from inflight map when complete
      inflightRequests.delete(key);
    });

  inflightRequests.set(key, promise);
  return promise;
}

/**
 * Clear cached results.
 *
 * @param keyPrefix - If provided, only clears entries matching this prefix.
 *                    If not provided, clears all cached results.
 */
export function clearDeduplicationCache(keyPrefix?: string): void {
  if (keyPrefix) {
    for (const key of recentResults.keys()) {
      if (key.startsWith(keyPrefix)) {
        recentResults.delete(key);
      }
    }
    console.log(`[RequestDeduplicator] Cleared cache for prefix: ${keyPrefix}`);
  } else {
    recentResults.clear();
    console.log(`[RequestDeduplicator] Cleared all cache`);
  }
}

/**
 * Invalidate a specific cache entry.
 *
 * Use this when you know the data has changed and needs to be refetched.
 *
 * @param key - The exact key to invalidate
 */
export function invalidateCache(key: string): void {
  recentResults.delete(key);
}

/**
 * Get cache statistics for debugging.
 *
 * @returns Object with cache stats
 */
export function getCacheStats(): { inflight: number; cached: number } {
  return {
    inflight: inflightRequests.size,
    cached: recentResults.size,
  };
}
