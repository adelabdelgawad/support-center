/**
 * Centralized SWR Cache Key Management
 *
 * This module provides consistent cache key generation for SWR hooks.
 * After the migration to useAsyncData, only requests-list and scheduler
 * related keys should remain here.
 *
 * Usage:
 * - Import cacheKeys and use the appropriate function to generate keys
 * - All keys are prefixed with /api/ for Next.js API routes
 */

/**
 * Cache key generators for different resources
 * NOTE: After migration, only requests-list and scheduler keys use SWR
 */
export const cacheKeys = {
  // Request/Ticket related keys (SWR - kept for requests-list)
  technicianViews: (view: string, page: number, perPage: number, businessUnitIds?: number[]) => {
    const params = new URLSearchParams({
      view,
      page: page.toString(),
      perPage: perPage.toString(),
    });
    if (businessUnitIds && businessUnitIds.length > 0) {
      businessUnitIds.forEach(id => {
        params.append('business_unit_ids', id.toString());
      });
    }
    return `/api/requests/technician-views?${params.toString()}`;
  },

  // View counts for sidebar (SWR - kept for requests-list)
  viewCounts: '/api/requests/view-counts',

  // Business unit counts (SWR - kept for requests-list)
  businessUnitCounts: (view: string) => `/api/requests/business-unit-counts?view=${view}`,

  // Ticket type counts (SWR - kept for requests-list)
  ticketTypeCounts: '/api/requests/ticket-type-counts',

  // Scheduler related keys (SWR - kept for scheduler)
  schedulerJobs: (page: number = 1, perPage: number = 50) => `/api/scheduler/jobs?page=${page}&per_page=${perPage}`,
  schedulerStatus: '/api/scheduler/status',
} as const;

/**
 * Type for cache key functions
 */
export type CacheKeyFunction = typeof cacheKeys;

/**
 * Helper to get all keys that match a pattern (for invalidation)
 * @param pattern - Regex pattern to match keys
 * @returns Function that checks if a key matches the pattern
 */
export function createKeyMatcher(pattern: RegExp) {
  return (key: string) => pattern.test(key);
}

/**
 * Predefined key matchers for common invalidation patterns
 */
export const keyMatchers = {
  // Match all requests-list keys for invalidation from detail page
  requestsList: createKeyMatcher(/\/api\/requests\/(technician-views|view-counts|business-unit-counts|ticket-type-counts)/),

  // Match all scheduler keys
  schedulerRelated: createKeyMatcher(/\/api\/scheduler\//),
} as const;
