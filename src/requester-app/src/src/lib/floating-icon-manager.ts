/**
 * Floating Icon Manager
 *
 * Manages the floating icon badge count and red flash notifications.
 * This utility provides a centralized way to update the floating icon state
 * when new messages arrive or unread counts change.
 */

import { invoke } from '@tauri-apps/api/core';
import type { ChatPageResponse } from '@/types';

/**
 * Current unread count stored in memory
 */
let currentUnreadCount = 0;

/**
 * Update the unread message count on the floating icon
 * This will show/hide the badge and update the count display
 *
 * @param count - Total unread message count across all tickets
 */
export async function updateFloatingIconUnreadCount(count: number): Promise<void> {
  try {
    currentUnreadCount = count;
    await invoke('update_floating_icon_unread_count', { count });
  } catch (error) {
    console.error('[FloatingIconManager] Failed to update unread count:', error);
  }
}

/**
 * Trigger red flash on the floating icon to indicate a new message
 * Optionally updates the unread count as well
 *
 * @param count - Optional unread count to update simultaneously
 */
export async function triggerFloatingIconFlash(count?: number): Promise<void> {
  try {
    await invoke('trigger_floating_icon_flash', { count: count ?? null });

    // Update local count if provided
    if (count !== undefined) {
      currentUnreadCount = count;
    }
  } catch (error) {
    console.error('[FloatingIconManager] Failed to trigger flash:', error);
  }
}

/**
 * Increment the unread count by 1
 * Useful when a new message arrives
 */
export async function incrementUnreadCount(): Promise<void> {
  const newCount = currentUnreadCount + 1;
  await updateFloatingIconUnreadCount(newCount);
}

/**
 * Decrement the unread count by 1
 * Useful when a message is marked as read
 */
export async function decrementUnreadCount(): Promise<void> {
  const newCount = Math.max(0, currentUnreadCount - 1);
  await updateFloatingIconUnreadCount(newCount);
}

/**
 * Reset the unread count to 0
 * Useful when all messages are marked as read
 */
export async function resetUnreadCount(): Promise<void> {
  await updateFloatingIconUnreadCount(0);
}

/**
 * Get the current unread count from memory
 */
export function getCurrentUnreadCount(): number {
  return currentUnreadCount;
}

/**
 * Handle new message notification
 * Triggers flash and increments count
 */
export async function handleNewMessageNotification(): Promise<void> {
  const newCount = currentUnreadCount + 1;
  await triggerFloatingIconFlash(newCount);
}

/**
 * Refresh unread count from ticket cache
 *
 * NOTE: With the reactive FloatingIconSync component, this function is largely
 * redundant as the unread count updates automatically when the TanStack Query
 * cache changes. It's kept for backwards compatibility and as a fallback.
 *
 * The FloatingIconSync component uses createEffect() to reactively subscribe
 * to useAllUserTickets() data changes, which automatically updates the
 * floating icon badge when optimistic updates or server responses change the cache.
 */
export async function refreshUnreadCountFromAPI(): Promise<void> {
  try {
    // Import dynamically to avoid circular dependencies
    const { queryClient } = await import('@/index');
    const { ticketKeys } = await import('@/queries');

    console.log('[FloatingIconManager] Query client:', !!queryClient);
    console.log('[FloatingIconManager] Query key:', ticketKeys.allUserTickets());

    // Get tickets from cache (using the actual global query client)
    const cachedData = queryClient.getQueryData<ChatPageResponse>(
      ticketKeys.allUserTickets()
    );

    console.log('[FloatingIconManager] Refreshing unread count from cache:', {
      hasCachedData: !!cachedData,
      dataType: cachedData ? Object.keys(cachedData) : null,
      hasMessages: cachedData && 'chatMessages' in cachedData,
      messageCount: cachedData && 'chatMessages' in cachedData ? (cachedData as any).chatMessages.length : 0
    });

    if (!cachedData || !('chatMessages' in cachedData)) {
      console.log('[FloatingIconManager] No cached data or no chatMessages, setting count to 0');
      await updateFloatingIconUnreadCount(0);
      return;
    }

    // Compute total unread count
    const totalUnread = (cachedData as any).chatMessages.reduce(
      (sum: number, ticket: any) => sum + (ticket.unreadCount || 0),
      0
    );

    console.log('[FloatingIconManager] Computed total unread:', totalUnread, 'from', (cachedData as any).chatMessages.length, 'tickets');
    await updateFloatingIconUnreadCount(totalUnread);
  } catch (error) {
    console.error('[FloatingIconManager] Failed to refresh unread count:', error);
    console.error('[FloatingIconManager] Error stack:', error instanceof Error ? error.stack : 'N/A');
  }
}
