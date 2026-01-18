/**
 * Centralized SWR Cache Key Management
 *
 * This module provides consistent cache key generation for all SWR hooks.
 * Using centralized keys ensures proper cache invalidation and data sharing
 * across components.
 *
 * Usage:
 * - Import cacheKeys and use the appropriate function to generate keys
 * - All keys are prefixed with /api/ for Next.js API routes
 */

/**
 * Cache key generators for different resources
 */
export const cacheKeys = {
  // Request/Ticket related keys
  requestDetails: (requestId: string) => `/api/requests-details/${requestId}`,
  requestAssignees: (requestId: string) => `/api/requests-details/${requestId}/assignees`,
  requestCC: (requestId: string) => `/api/requests-details/${requestId}/cc`,
  requestNotes: (requestId: string) => `/api/request-notes/${requestId}`,
  // Unified assignment route with type parameter
  requestAssignment: (requestId: string, typeId: number) => `/api/requests-details/${requestId}/assignments?type=${typeId}`,
  // Technician views list with view type, pagination, and optional business unit IDs
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

  // Chat related keys
  chatMessages: (requestId: string) => `/api/chat/messages/${requestId}`,

  // User/Technician related keys
  technicians: '/api/technicians',
  usersWithRoles: '/api/users/with-roles',
  userPages: (userId: string) => `/api/users/${userId}/pages`,

  // Business unit counts
  businessUnitCounts: (view: string) => `/api/requests/business-unit-counts?view=${view}`,

  // View counts for sidebar (independent of current view/page)
  viewCounts: '/api/requests/view-counts',

  // Ticket type counts (global, not filtered by view)
  ticketTypeCounts: '/api/requests/ticket-type-counts',

  // Metadata keys (global, cached across all ticket views)
  globalPriorities: '/api/priorities',
  globalStatuses: '/api/metadata/statuses',
  globalTechnicians: '/api/technicians',
  globalCategories: '/api/categories?include_subcategories=true',

  // Legacy metadata keys (for backward compatibility)
  priorities: '/api/metadata/priorities',
  statuses: '/api/metadata/statuses',
  categories: '/api/metadata/categories',

  // Settings keys
  systemEvents: '/api/setting/system-events',
  systemEvent: (eventId: string) => `/api/setting/system-events/${eventId}`,
  systemMessages: '/api/setting/system-messages',
  systemMessage: (messageId: string) => `/api/setting/system-messages/${messageId}`,

  // Custom views
  customView: '/api/user-custom-views',
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
  // Match all request-related keys for a specific request
  requestRelated: (requestId: string) =>
    createKeyMatcher(new RegExp(`/api/(requests-details|request-notes|chat/messages)/${requestId}`)),

  // Match all user-related keys
  userRelated: createKeyMatcher(/\/api\/users/),

  // Match all metadata keys
  metadataRelated: createKeyMatcher(/\/api\/metadata/),
} as const;
