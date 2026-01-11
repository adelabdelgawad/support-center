'use server';

import { serverFetch, CACHE_PRESETS } from '@/lib/api/server-fetch';
import type { UserCustomView } from '@/types/custom-views';

/**
 * Get current user's custom view (auto-creates if doesn't exist)
 *
 * Cache: SHORT_LIVED (1 minute) - user-specific settings that rarely change
 */
export async function getMyCustomView(): Promise<UserCustomView | null> {
  try {
    const view = await serverFetch<UserCustomView>(
      '/user-custom-views',
      CACHE_PRESETS.SHORT_LIVED()
    );
    return view;
  } catch (error) {
    console.error('Failed to fetch custom view:', error);
    return null;
  }
}
