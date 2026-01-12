'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { apiClient, getClientErrorMessage as getErrorMessage } from '@/lib/fetch/client';
import type { ChatMessage, SenderInfo } from '@/lib/signalr/types';
import type { PermissionResult } from '@/lib/utils/messaging-permissions';

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
 * Upload result for a single file
 */
export interface AttachmentUploadResult {
  success: boolean;
  type: 'screenshot' | 'file';
  filename: string;
  screenshot_file_name?: string;
  stored_filename?: string;
  original_filename?: string;
  file_size?: number;
  mime_type?: string;
  file_id?: number;
  message?: string;
  error?: string;
}

/**
 * Upload response from the server
 */
export interface AttachmentUploadResponse {
  message: string;
  results: AttachmentUploadResult[];
}

/**
 * Options for the useChatMutations hook
 */
export interface UseChatMutationsOptions {
  requestId: string;
  currentUserId?: number | string; // Support both for backward compatibility
  currentUser?: {
    id: number | string; // Support both for backward compatibility
    username: string;
    fullName?: string | null;
    email?: string | null;
  };
  messagingPermission?: PermissionResult;
  sendChatMessageViaWebSocket?: (content: string, currentUser?: { id: string; username: string; fullName?: string | null; email?: string | null }) => string | null;
  addOptimisticMessage?: (message: ChatMessage) => void;
  updateMessageStatus?: (tempId: string, status: 'pending' | 'sent' | 'failed', errorMessage?: string) => void;
  onMessageSent?: (message: ChatMessage) => void;
  onAttachmentsUploaded?: (response: AttachmentUploadResponse) => void;
  onError?: (error: Error) => void;
}

/**
 * Mutation state for tracking loading/error states
 */
interface MutationState {
  isSending: boolean;
  isUploading: boolean;
  lastError: Error | null;
  failedMessages: Map<string, FailedMessageInfo>;
}

/**
 * Create an optimistic message for immediate UI feedback
 */
function createOptimisticMessage(
  requestId: string,
  content: string,
  currentUser: UseChatMutationsOptions['currentUser']
): ChatMessage {
  const now = new Date().toISOString();
  const sender: SenderInfo | null = currentUser
    ? {
        id: String(currentUser.id),
        username: currentUser.username,
        fullName: currentUser.fullName || null,
        email: currentUser.email || null,
      }
    : null;

  return {
    id: `optimistic-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    requestId,
    senderId: currentUser?.id ? String(currentUser.id) : '',
    sender,
    content,
    sequenceNumber: Date.now(), // Temporary sequence for ordering
    isScreenshot: false,
    screenshotFileName: null,
    attachmentCount: 0,
    createdAt: now,
    updatedAt: null,
    attachments: [],
    isRead: false,
  };
}

/**
 * Hook to manage chat message mutations (send, upload) with optimistic updates
 *
 * This hook works alongside useChatWebSocket:
 * - WebSocket handles real-time message delivery and state
 * - This hook handles HTTP POST operations for sending messages
 *
 * Features:
 * - Optimistic message creation for immediate UI feedback
 * - Permission validation before sending
 * - Error handling with automatic state cleanup
 * - Abort support for ongoing requests
 *
 * @param options - Configuration options
 * @returns Mutation functions and state
 */
// Maximum number of failed messages to keep in memory (FIFO eviction)
const MAX_FAILED_MESSAGES = 100;

export function useChatMutations(options: UseChatMutationsOptions) {
  const {
    requestId,
    currentUserId,
    currentUser,
    messagingPermission,
    sendChatMessageViaWebSocket,
    addOptimisticMessage,
    updateMessageStatus,
    onMessageSent,
    onAttachmentsUploaded,
    onError,
  } = options;

  const [state, setState] = useState<MutationState>({
    isSending: false,
    isUploading: false,
    lastError: null,
    failedMessages: new Map(),
  });

  // Track ongoing requests for abort capability
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Check if the user can send messages
   */
  const canSendMessage = useCallback((): boolean => {
    if (!currentUserId || !currentUser) {
      return false;
    }
    if (messagingPermission && !messagingPermission.canMessage) {
      return false;
    }
    return true;
  }, [currentUserId, currentUser, messagingPermission]);

  /**
   * Get the reason why user cannot send messages
   */
  const getPermissionDeniedReason = useCallback((): string => {
    if (!currentUserId || !currentUser) {
      return 'Not authenticated';
    }
    if (messagingPermission && !messagingPermission.canMessage) {
      return messagingPermission.reason || 'You do not have permission to send messages';
    }
    return '';
  }, [currentUserId, currentUser, messagingPermission]);

  /**
   * Send a message via HTTP POST with optimistic update support
   *
   * @param content - Message content to send
   * @param existingTempId - Optional tempId for retry (reuses existing optimistic message)
   * @returns Promise that resolves when message is sent
   */
  const sendMessage = useCallback(
    async (content: string, existingTempId?: string): Promise<void> => {
      // Validate
      if (!content.trim()) {
        throw new Error('Message content cannot be empty');
      }

      if (!canSendMessage()) {
        const reason = getPermissionDeniedReason();
        throw new Error(reason);
      }

      if (state.isSending) {
        throw new Error('A message is already being sent');
      }

      // Clear previous error and start sending
      setState((prev) => ({ ...prev, isSending: true, lastError: null }));

      let tempId: string | null = existingTempId || null;

      try {
        // Create optimistic message via SignalR if NOT a retry
        if (!existingTempId && sendChatMessageViaWebSocket && currentUser) {
          // Convert currentUser to match WebSocket signature (string IDs)
          const wsUser = {
            id: String(currentUser.id),
            username: currentUser.username,
            fullName: currentUser.fullName || null,
            email: currentUser.email || null,
          };
          tempId = sendChatMessageViaWebSocket(content.trim(), wsUser);
        } else if (existingTempId && updateMessageStatus) {
          // For retry: update status back to pending
          updateMessageStatus(existingTempId, 'pending');
        }

        // Re-enable input immediately after optimistic update
        // This allows users to send multiple messages quickly without waiting for HTTP
        setState((prev) => ({ ...prev, isSending: false }));

        console.log(`[useChatMutations] Sending message (tempId: ${tempId || 'none'})`);

        // Create abort controller for this request (for cleanup on unmount)
        abortControllerRef.current = new AbortController();

        // ALWAYS send HTTP POST to persist the message
        // SignalR only creates optimistic local state - actual persistence is via HTTP
        const response = await fetch('/api/chat/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          signal: abortControllerRef.current.signal,
          body: JSON.stringify({
            request_id: requestId,
            sender_id: currentUser?.id,
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
        // This handles the case where SignalR broadcast fails or is delayed
        if (tempId && updateMessageStatus) {
          console.log(`[useChatMutations] Updating optimistic message status to 'sent'`);
          updateMessageStatus(tempId, 'sent');
        }

        // Clear from failed messages if this was a retry
        if (tempId) {
          setState((prev) => {
            const newFailed = new Map(prev.failedMessages);
            newFailed.delete(tempId!);
            return { ...prev, failedMessages: newFailed };
          });
        }

        if (onMessageSent) {
          onMessageSent(serverMessage);
        }
      } catch (err) {
        // Handle abort (component unmounted)
        if (err instanceof Error && err.name === 'AbortError') {
          console.log('[useChatMutations] Send message aborted');
          return;
        }

        const error = err instanceof Error ? err : new Error(getErrorMessage(err));
        console.error(`[useChatMutations] Send failed:`, error.message);

        // Mark message as failed in local state
        if (tempId) {
          // Track failed message for retry
          setState((prev) => {
            const newFailed = new Map(prev.failedMessages);

            // Evict oldest entry if at capacity (FIFO)
            if (newFailed.size >= MAX_FAILED_MESSAGES) {
              const oldestKey = newFailed.keys().next().value;
              if (oldestKey) {
                newFailed.delete(oldestKey);
                console.log(`[useChatMutations] Evicted oldest failed message (limit: ${MAX_FAILED_MESSAGES})`);
              }
            }

            newFailed.set(tempId!, {
              tempId: tempId!,
              content: content.trim(),
              errorMessage: error.message,
              timestamp: Date.now(),
            });
            return { ...prev, failedMessages: newFailed, lastError: error };
          });

          // Update message status to 'failed' in UI
          if (updateMessageStatus) {
            updateMessageStatus(tempId, 'failed', error.message);
          }
        } else {
          setState((prev) => ({ ...prev, lastError: error }));
        }

        if (onError) {
          onError(error);
        }

        throw error;
      } finally {
        setState((prev) => ({ ...prev, isSending: false }));
        abortControllerRef.current = null;
      }
    },
    [
      requestId,
      currentUser,
      state.isSending,
      canSendMessage,
      getPermissionDeniedReason,
      sendChatMessageViaWebSocket,
      updateMessageStatus,
      onMessageSent,
      onError,
    ]
  );

  /**
   * Send an attachment message (for screenshot or file uploads)
   *
   * @param uploadResult - Result from the upload API
   * @returns Promise that resolves when message is sent
   */
  const sendAttachmentMessage = useCallback(
    async (uploadResult: AttachmentUploadResult): Promise<void> => {
      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Upload failed');
      }

      if (!canSendMessage()) {
        const reason = getPermissionDeniedReason();
        throw new Error(reason);
      }

      console.log(`[useChatMutations] Sending attachment message:`, uploadResult);

      try {
        // Build message payload based on attachment type
        const payload: Record<string, unknown> = {
          request_id: requestId,
          sender_id: currentUser?.id,
        };

        if (uploadResult.type === 'screenshot') {
          // Screenshot message
          payload.content = '[Screenshot]';
          payload.is_screenshot = true;
          payload.screenshot_file_name = uploadResult.screenshot_file_name;
        } else {
          // File attachment message
          payload.content = `[File: ${uploadResult.original_filename || uploadResult.filename}]`;
          payload.is_screenshot = false;
          payload.file_name = uploadResult.original_filename || uploadResult.filename;
          payload.file_size = uploadResult.file_size;
          payload.file_mime_type = uploadResult.mime_type;
        }

        const response = await fetch('/api/chat/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || errorData.message || 'Failed to send attachment message');
        }

        const serverMessage = await response.json();
        console.log(`[useChatMutations] Attachment message sent (id: ${serverMessage.id})`);

        if (onMessageSent) {
          onMessageSent(serverMessage);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(getErrorMessage(err));
        console.error(`[useChatMutations] Send attachment message failed:`, error.message);
        throw error;
      }
    },
    [requestId, currentUser, canSendMessage, getPermissionDeniedReason, onMessageSent]
  );

  /**
   * Retry a failed message
   *
   * @param tempId - The tempId of the failed message to retry
   * @returns Promise that resolves when retry completes
   */
  const retryMessage = useCallback(
    async (tempId: string): Promise<void> => {
      const failedMessage = state.failedMessages.get(tempId);
      if (!failedMessage) {
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
        await sendMessage(failedMessage.content, tempId);
      } catch (err) {
        // Error is already handled in sendMessage, which will set status to 'failed'
        console.error(`[useChatMutations] Retry failed for: ${tempId}`, err);
      }
    },
    [state.failedMessages, sendMessage, updateMessageStatus]
  );

  /**
   * Discard a failed message (remove from queue and UI)
   *
   * @param tempId - The tempId of the failed message to discard
   */
  const discardFailedMessage = useCallback(
    (tempId: string): void => {
      setState((prev) => {
        const newFailed = new Map(prev.failedMessages);
        newFailed.delete(tempId);
        return { ...prev, failedMessages: newFailed };
      });
    },
    []
  );

  /**
   * Upload attachments
   *
   * @param files - Files to upload
   * @returns Promise that resolves with upload results when complete
   */
  const uploadAttachments = useCallback(
    async (files: File[]): Promise<AttachmentUploadResponse | null> => {
      if (files.length === 0) {
        return null;
      }

      if (!canSendMessage()) {
        const reason = getPermissionDeniedReason();
        throw new Error(reason);
      }

      if (state.isUploading) {
        throw new Error('An upload is already in progress');
      }

      // Clear previous error and start uploading
      setState((prev) => ({ ...prev, isUploading: true, lastError: null }));

      // Create abort controller for this request
      abortControllerRef.current = new AbortController();

      try {
        const formData = new FormData();
        files.forEach((file) => {
          formData.append('files', file);
        });

        const response = await fetch(`/api/chat/attachments/upload?request_id=${requestId}`, {
          method: 'POST',
          body: formData,
          credentials: 'include',
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || 'Failed to upload attachments');
        }

        const result: AttachmentUploadResponse = await response.json();

        // Notify callback
        if (onAttachmentsUploaded) {
          onAttachmentsUploaded(result);
        }

        return result;
      } catch (err) {
        // Handle abort
        if (err instanceof Error && err.name === 'AbortError') {
          console.log('Upload aborted');
          return null;
        }

        const error = err instanceof Error ? err : new Error(getErrorMessage(err));
        setState((prev) => ({ ...prev, lastError: error }));

        if (onError) {
          onError(error);
        }

        throw error;
      } finally {
        setState((prev) => ({ ...prev, isUploading: false }));
        abortControllerRef.current = null;
      }
    },
    [requestId, state.isUploading, canSendMessage, getPermissionDeniedReason, onAttachmentsUploaded, onError]
  );

  /**
   * Abort any ongoing request
   */
  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState((prev) => ({ ...prev, isSending: false, isUploading: false }));
  }, []);

  /**
   * Clear the last error
   */
  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, lastError: null }));
  }, []);

  // Cleanup: abort any ongoing requests when component unmounts
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  return {
    // State
    isSending: state.isSending,
    isUploading: state.isUploading,
    lastError: state.lastError,
    failedMessages: state.failedMessages,

    // Permission helpers
    canSendMessage: canSendMessage(),
    permissionDeniedReason: getPermissionDeniedReason(),

    // Actions
    sendMessage,
    sendAttachmentMessage,
    retryMessage,
    discardFailedMessage,
    uploadAttachments,
    abort,
    clearError,
  };
}

/**
 * Type for the return value of useChatMutations hook
 */
export type UseChatMutationsReturn = ReturnType<typeof useChatMutations>;
