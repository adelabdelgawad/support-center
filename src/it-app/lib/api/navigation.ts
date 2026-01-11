/**
 * Client-side API for fetching navigation pages
 *
 * This calls the Next.js API route which proxies to the backend.
 * Used by the useNavigation hook for SWR-based data fetching.
 */

import type { Page } from '@/types/pages';

/**
 * Fetch user navigation pages from the API
 * This is a client-side function that calls the Next.js API route
 */
export async function fetchUserPages(userId: string): Promise<Page[]> {
  const response = await fetch(`/api/users/${userId}/pages`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const error = new Error('Failed to fetch user pages') as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  return data as Page[];
}
