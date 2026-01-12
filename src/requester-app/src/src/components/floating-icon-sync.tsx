/**
 * Floating Icon Sync Component
 *
 * This component manages the floating icon badge and flash notifications.
 * It listens to SignalR events for new messages and updates the icon state accordingly.
 *
 * Features:
 * - Syncs unread count reactively with TanStack Query cache
 * - Listens for new message notifications via SignalR
 * - Triggers red flash on new messages
 * - Updates badge count in real-time using cache subscriptions
 *
 * ARCHITECTURE:
 * - Unread count is computed reactively by subscribing to TanStack Query cache changes
 * - This prevents race conditions between optimistic updates and server refetches
 * - The optimistic update tracking in tickets.ts ensures server data doesn't overwrite local changes
 *
 * Usage: Add to App.tsx as a child component (inside auth guard)
 */

import { createEffect, onCleanup, onMount, useContext } from "solid-js";
import { useNotificationSignalR, NotificationSignalRContext } from "@/signalr";
import { useQueryClient } from "@tanstack/solid-query";
import { ticketKeys, useUpdateTicketInCache, useAllUserTickets } from "@/queries";
import { authStore } from "@/stores/auth-store";
import type { ChatPageResponse } from "@/types";
import {
  updateFloatingIconUnreadCount,
  triggerFloatingIconFlash,
} from "@/lib/floating-icon-manager";
import { getNotificationPreferences } from "@/lib/notifications";

/**
 * Inner component that uses the SignalR context
 * Only rendered when context is available
 */
function FloatingIconSyncInner() {
  const queryClient = useQueryClient();
  const updateTicketInCache = useUpdateTicketInCache();

  // REACTIVE: Use the query hook to reactively track unread count changes
  // This ensures we always have the latest computed value from the cache
  // and automatically re-renders when the cache changes (including optimistic updates)
  const ticketsQuery = useAllUserTickets();

  // Track last sent count to avoid redundant Tauri IPC calls
  let lastSentCount = -1;

  // Debounce timer for batching rapid updates
  // This prevents flicker when multiple cache updates happen in quick succession
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const DEBOUNCE_MS = 50; // Small debounce to batch rapid updates

  // Use SignalR notification hook
  const notificationSignalR = useNotificationSignalR();

  /**
   * REACTIVE SYNC: Update floating icon whenever the query data changes
   * This is the SINGLE source of truth for the floating icon badge
   *
   * Benefits:
   * - No race conditions: reads directly from reactive query state
   * - Light debouncing: batches rapid updates (50ms) to prevent flicker
   * - Works with optimistic updates: query data already includes them
   * - No stale data: always reflects current cache state
   */
  createEffect(() => {
    // Access reactive data
    const data = ticketsQuery.data;

    // Compute total unread from the transformed data
    // This is already computed in useAllUserTickets, but we recalculate
    // from ticketListItems to ensure consistency with optimistic updates
    const totalUnread = data?.ticketListItems?.reduce(
      (sum, ticket) => sum + (ticket.unreadCount || 0),
      0
    ) ?? 0;

    // Skip redundant updates to avoid excessive IPC calls
    if (totalUnread === lastSentCount) {
      return;
    }

    // Clear any pending debounce timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // Debounce the update to prevent flicker from rapid cache changes
    // This is especially important during navigation when multiple refetches
    // and optimistic updates may occur in quick succession
    debounceTimer = setTimeout(() => {
      // Double-check the count hasn't already been sent (race protection)
      if (totalUnread !== lastSentCount) {
        lastSentCount = totalUnread;

        // Update the Tauri floating icon badge
        updateFloatingIconUnreadCount(totalUnread).catch((error) => {
          console.error("[FloatingIconSync] Failed to update unread count:", error);
        });
      }
      debounceTimer = null;
    }, DEBOUNCE_MS);
  });

  // Cleanup debounce timer on unmount
  onCleanup(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
  });

  /**
   * Handle new message notification from SignalR
   *
   * IMPORTANT: This component handles:
   * - Floating icon flash animation (for other users' messages)
   * - CACHE UPDATES with incrementUnread (CRITICAL - always mounted, so this works on all pages)
   *
   * The badge count update happens AUTOMATICALLY via the reactive effect above
   * when the cache is updated. No manual computeAndUpdateUnreadCount() needed.
   *
   * Desktop notifications are handled EXCLUSIVELY by NotificationSignalRContext
   * to prevent duplicate notifications and ensure consistent suppression logic.
   */
  function handleNewMessageNotification(notification: { requestId: string; message: any }) {
    const { requestId, message } = notification;

    // Check if this is the user's own message
    const currentUserId = String(authStore.state.user?.id || '');
    const messageSenderId = String(message.senderId || '');
    const isOwnMessage = currentUserId !== '' && currentUserId === messageSenderId;

    // Skip ALL processing for own messages
    if (isOwnMessage) {
      return;
    }

    // Check if user is currently viewing this chat
    // If viewing, the chat page will mark messages as read immediately
    // So we should NOT increment unread count to avoid race condition
    const currentActiveChat = notificationSignalR.activeChat();
    const isViewingThisChat = currentActiveChat === requestId;

    if (isViewingThisChat) {
      // User is viewing this chat - only update last message, don't increment unread
      try {
        updateTicketInCache(requestId, {
          lastMessage: message.content || '',
          lastMessageAt: message.createdAt,
          // DO NOT increment unread - chat page marks as read
        });
      } catch (error) {
        console.error('[FloatingIconSync] Failed to update cache (active chat):', error);
      }
      return;
    }

    // CRITICAL: Update ticket in cache with incrementUnread
    // This is the ONLY place that reliably increments unread count because
    // this component is ALWAYS MOUNTED (unlike tickets.tsx which unmounts on navigation)
    //
    // NOTE: The floating icon badge will update AUTOMATICALLY via the createEffect above
    // when this cache update triggers a re-render of useAllUserTickets
    try {
      updateTicketInCache(requestId, {
        lastMessage: message.content || '',
        lastMessageAt: message.createdAt,
        incrementUnread: true, // Increment unread count by 1
      });
    } catch (error) {
      console.error('[FloatingIconSync] Failed to update cache:', error);
    }

    // NO TIMEOUT NEEDED: The reactive effect will automatically update the badge
    // when the cache change propagates through TanStack Query

    // Check if notifications are enabled (controls flash animation too)
    const prefs = getNotificationPreferences();
    if (!prefs.notificationsEnabled) {
      return;
    }

    // Trigger red flash on floating icon for OTHER users' messages
    triggerFloatingIconFlash();
  }

  // Setup on mount: subscribe to notifications
  // The badge count sync is handled reactively via createEffect
  onMount(() => {
    // Subscribe to new message notifications ONCE (not in reactive effect)
    // This prevents duplicate subscriptions when window opens/focuses
    const unsubscribe = notificationSignalR.onNotification((notification) => {
      handleNewMessageNotification(notification);
    });

    // Cleanup subscription on unmount
    onCleanup(() => {
      unsubscribe();
    });
  });

  // This component doesn't render anything
  return null;
}

/**
 * Wrapper component that guards against missing context during HMR
 * Only renders the inner component when the context is available
 */
export function FloatingIconSync() {
  // Check if context is available (handles HMR edge cases)
  const context = useContext(NotificationSignalRContext);

  // Don't render if context is not available (happens during HMR transitions)
  if (!context) {
    return null;
  }

  return <FloatingIconSyncInner />;
}
