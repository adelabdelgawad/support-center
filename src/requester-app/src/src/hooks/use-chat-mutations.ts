/**
 * Chat Mutations Hook for Requester App
 *
 * Handles HTTP-based message sending with:
 * - Optimistic updates via SignalR hook
 * - HTTP POST to persist messages
 * - Status updates (pending -> sent or failed)
 * - Retry mechanism for failed messages
 *
 * This matches the IT app's ideal configuration.
 *
 * IMPORTANT: Authentication is checked directly from authStore to avoid
 * timing issues where props might be stale during component mount.
 * See: https://github.com/adelabdelgawad/support_center/issues/XXX
 */

import { createSignal, createMemo } from 'solid-js';
import { authStore } from '@/stores/auth-store';
import { RuntimeConfig } from '@/lib/runtime-config';
import type { ChatMessage } from '@/types';

/**
 * Failed message info for retry support
 */
export interface FailedMessageInfo {
  tempId: string;
  content: string;
  errorMessage: string;
  timestamp: number;
}

/**
 * Options for the useChatMutations hook
 */
export interface UseChatMutationsOptions {
  requestId: string;
  currentUserId?: string | number;
  currentUser?: {
    id: string | number;
    username: string;
    fullName?: string | null;
  };
  sendOptimisticMessage?: (content: string) => string | null;
  updateMessageStatus?: (tempId: string, status: 'pending' | 'sent' | 'failed', errorMessage?: string) => void;
  onMessageSent?: (message: ChatMessage) => void;
  onError?: (error: Error) => void;
}

/**
 * Hook to manage chat message mutations with optimistic updates
 *
 * This hook works alongside useSignalRChatRoom:
 * - SignalR hook handles real-time message delivery and state
 * - This hook handles HTTP POST operations for sending messages
 *
 * Features:
 * - Uses SignalR's sendMessage for optimistic UI
 * - HTTP POST to backend for persistence
 * - Status updates on success/failure
 * - Retry mechanism for failed messages
 */
export function useChatMutations(options: UseChatMutationsOptions) {
  const {
    requestId,
    currentUserId,
    currentUser,
    sendOptimisticMessage,
    updateMessageStatus,
    onMessageSent,
    onError,
  } = options;

  const [isSending, setIsSending] = createSignal(false);
  const [lastError, setLastError] = createSignal<Error | null>(null);
  const [failedMessages, setFailedMessages] = createSignal<Map<string, FailedMessageInfo>>(new Map());

  /**
   * Check if user can send messages
   *
   * CRITICAL: We read auth state directly from authStore instead of using
   * props (currentUserId/currentUser) because SolidJS destructures options
   * at hook creation time. When navigating to a new chat page (e.g., after
   * creating a request), the props might be captured before they're populated,
   * causing "Not authenticated" errors on the first message send.
   *
   * Reading from authStore ensures we always get the current auth state,
   * not a stale snapshot from when the hook was created.
   */
  const canSendMessage = createMemo(() => {
    // Primary check: Read directly from authStore for reliable auth state
    const authUser = authStore.state.user;
    const authToken = authStore.state.token;

    if (authUser && authToken) {
      return true;
    }

    // Fallback: Also check props for backwards compatibility
    // (in case authStore isn't ready but props are - shouldn't happen)
    return !!(currentUserId || currentUser);
  });

  /**
   * Send a message via HTTP POST with optimistic update support
   *
   * @param content - Message content to send
   * @param existingTempId - Optional tempId for retry (reuses existing optimistic message)
   * @returns Promise that resolves when message is sent
   */
  const sendMessage = async (content: string, existingTempId?: string): Promise<void> => {
    // Validate
    if (!content.trim()) {
      throw new Error('Message content cannot be empty');
    }

    if (!canSendMessage()) {
      // Log debug info for troubleshooting auth timing issues
      console.error('[useChatMutations] canSendMessage() returned false:', {
        'authStore.state.user': authStore.state.user ? 'present' : 'null',
        'authStore.state.token': authStore.state.token ? 'present' : 'null',
        'authStore.state.isAuthenticated': authStore.state.isAuthenticated,
        'authStore.state.isRehydrating': authStore.state.isRehydrating,
        currentUserId,
        currentUser: currentUser ? 'present' : 'undefined',
      });
      throw new Error('Not authenticated - please wait for authentication to complete');
    }

    // NOTE: Removed isSending() check to allow rapid concurrent message sends
    // Each message is tracked independently via its tempId for optimistic updates

    // Clear previous error (but don't block on isSending - allow concurrent sends)
    setLastError(null);
    setIsSending(true);

    let tempId: string | null = existingTempId || null;

    try {
      // Create optimistic message via SignalR if NOT a retry
      if (!existingTempId && sendOptimisticMessage) {
        tempId = sendOptimisticMessage(content.trim());
      } else if (existingTempId && updateMessageStatus) {
        // For retry: update status back to pending
        updateMessageStatus(existingTempId, 'pending');
      }

      console.log(`[useChatMutations] Sending message (tempId: ${tempId || 'none'})`);

      // HTTP POST to persist the message
      const apiUrl = RuntimeConfig.getServerAddress();
      const token = authStore.state.token;

      const response = await fetch(`${apiUrl}/chat/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          request_id: requestId,
          content: content.trim(),
          client_temp_id: tempId, // Send tempId so server can match optimistic message
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || errorData.message || 'Failed to send message');
      }

      const serverMessage = await response.json();
      console.log(`[useChatMutations] Message sent successfully (id: ${serverMessage.id})`);

      // CRITICAL: Update message status to 'sent' after HTTP success
      if (tempId && updateMessageStatus) {
        console.log(`[useChatMutations] Updating optimistic message status to 'sent'`);
        updateMessageStatus(tempId, 'sent');
      }

      // Clear from failed messages if this was a retry
      if (tempId) {
        setFailedMessages((prev) => {
          const newMap = new Map(prev);
          newMap.delete(tempId!);
          return newMap;
        });
      }

      if (onMessageSent) {
        onMessageSent(serverMessage);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error(`[useChatMutations] Send failed:`, error.message);

      // Mark message as failed in local state
      if (tempId) {
        // Track failed message for retry
        setFailedMessages((prev) => {
          const newMap = new Map(prev);
          newMap.set(tempId!, {
            tempId: tempId!,
            content: content.trim(),
            errorMessage: error.message,
            timestamp: Date.now(),
          });
          return newMap;
        });

        // Update message status to 'failed' in UI
        if (updateMessageStatus) {
          updateMessageStatus(tempId, 'failed', error.message);
        }
      }

      setLastError(error);

      if (onError) {
        onError(error);
      }

      throw error;
    } finally {
      setIsSending(false);
    }
  };

  /**
   * Retry a failed message
   *
   * @param tempId - The tempId of the failed message to retry
   * @returns Promise that resolves when retry completes
   */
  const retryMessage = async (tempId: string): Promise<void> => {
    const failed = failedMessages().get(tempId);
    if (!failed) {
      console.warn(`[useChatMutations] No failed message found for tempId: ${tempId}`);
      // Even if not in failedMessages map, try to update status to pending
      // This handles race conditions where the map hasn't been updated yet
      if (updateMessageStatus) {
        console.log(`[useChatMutations] Setting status to pending anyway for: ${tempId}`);
        updateMessageStatus(tempId, 'pending');
      }
      return;
    }

    console.log(`[useChatMutations] Retrying message (tempId: ${tempId})`);

    // CRITICAL: Update status to 'pending' IMMEDIATELY before async work
    // This ensures the UI updates right away when retry is clicked
    if (updateMessageStatus) {
      updateMessageStatus(tempId, 'pending');
    }

    try {
      await sendMessage(failed.content, tempId);
    } catch (err) {
      // Error is already handled in sendMessage, which will set status to 'failed'
      console.error(`[useChatMutations] Retry failed for: ${tempId}`, err);
    }
  };

  /**
   * Discard a failed message (remove from queue and optionally from UI)
   *
   * @param tempId - The tempId of the failed message to discard
   */
  const discardFailedMessage = (tempId: string): void => {
    setFailedMessages((prev) => {
      const newMap = new Map(prev);
      newMap.delete(tempId);
      return newMap;
    });
  };

  /**
   * Clear the last error
   */
  const clearError = () => {
    setLastError(null);
  };

  return {
    // State (accessors for SolidJS reactivity)
    isSending,
    lastError,
    failedMessages,

    // Permission helper
    canSendMessage,

    // Actions
    sendMessage,
    retryMessage,
    discardFailedMessage,
    clearError,
  };
}

/**
 * Type for the return value of useChatMutations hook
 */
export type UseChatMutationsReturn = ReturnType<typeof useChatMutations>;
