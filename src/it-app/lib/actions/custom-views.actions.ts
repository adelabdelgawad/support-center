'use server';

import { serverGet } from '@/lib/fetch';
import type { UserCustomView } from '@/types/custom-views';

/**
 * Get current user's custom view (auto-creates if doesn't exist)
 *
 * Cache: 30s - balances performance with freshness
 * Invalidated on update/reset via revalidatePath
 */
export async function getMyCustomView(): Promise<UserCustomView | null> {
  try {
    const view = await serverGet<UserCustomView>(
      '/user-custom-views',
      { revalidate: 30 }
    );
    return view;
  } catch (error) {
    console.error('Failed to fetch custom view:', error);
    return null;
  }
}
