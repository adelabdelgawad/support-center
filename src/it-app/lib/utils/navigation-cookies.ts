/**
 * Navigation cookie utilities for server-side navigation handling
 *
 * IMPORTANT: These are for cookie handling only, NOT localStorage caching
 */

import type { Page } from '@/types/pages';

/**
 * Get the cookie name for storing navigation data
 */
export function getNavigationCookieName(): string {
  return 'nav-pages';
}

/**
 * Parse navigation cookie value into Page objects
 *
 * @param cookieValue - The cookie value string
 * @param userId - User ID for validation
 * @returns Array of Page objects, or empty array if invalid
 */
export function parseNavigationCookie(cookieValue: string, userId: string): Page[] {
  try {
    const parsed = JSON.parse(decodeURIComponent(cookieValue));

    // Validate it's an array
    if (!Array.isArray(parsed)) {
      return [];
    }

    // Basic validation that items look like Page objects
    const isValidPage = (item: any): item is Page => {
      return (
        item &&
        typeof item.id === 'string' &&
        typeof item.title === 'string' &&
        typeof item.path === 'string'
      );
    };

    return parsed.filter(isValidPage);
  } catch (error) {
    console.warn('Failed to parse navigation cookie:', error);
    return [];
  }
}
