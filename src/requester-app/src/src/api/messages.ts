/**
 * Chat Messages API
 *
 * This module handles chat message operations for service requests.
 *
 * Endpoints used (matching Next.js implementation):
 * - GET /chat/messages/request/{requestId} - Get messages for a request
 * - POST /chat/messages - Send a new message
 * - POST /chat/{requestId}/mark-read - Mark messages as read
 *
 * Note: Real-time messages are handled via WebSocket (see websocket.ts)
 * This API is used for loading initial message history.
 *
 * PAGINATION MODES:
 * 1. Cursor-based (RECOMMENDED): Uses `limit` + optional `beforeSequence`
 *    - Initial load: limit=100 returns the latest 100 messages
 *    - Load more: limit=200&beforeSequence=X returns 200 older messages
 * 2. Offset-based (legacy): Uses `page` + `pageSize`
 *
 * IMPORTANT: The endpoint uses path parameter for request_id, NOT query param.
 * Response is an array directly (not wrapped), with metadata in headers:
 * - X-Total-Count: Total messages in chat
 * - X-Oldest-Sequence: Cursor for next "load more" request
 * - X-Has-More: "true" if there are older messages
 *
 * ===========================================================================
 * ROUTE CONTEXT GUARD (fix-chat-navigation.md)
 * ===========================================================================
 * Message fetch operations MUST only occur when:
 * - The chat route is actively mounted
 * - getGlobalChatRouteState() returns true
 *
 * Any fetch attempt from outside the chat route will be BLOCKED and logged.
 * This prevents accidental over-fetching from tickets page lifecycle.
 * ===========================================================================
 */

import apiClient, { getErrorMessage } from "./client";
import { deduplicatedFetch } from "@/lib/request-deduplicator";
import { getGlobalChatRouteState } from "@/context/chat-route-context";
import type { ChatMessage, CreateChatMessage } from "@/types";

/**
 * Check if error is an AbortError (request was cancelled)
 */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

// ============================================================================
// LEGACY OFFSET-BASED PAGINATION (kept for backwards compatibility)
// ============================================================================

export interface GetMessagesParams {
  requestId: string;
  page?: number;
  pageSize?: number;
}

export interface GetMessagesResponse {
  messages: ChatMessage[];
  total: number;
  page: number;
  perPage: number;
}

// ============================================================================
// CURSOR-BASED PAGINATION (RECOMMENDED for chat)
// ============================================================================

export interface GetMessagesCursorParams {
  requestId: string;
  /** Number of messages to load (default: 100 for initial, 200 for load more) */
  limit: number;
  /** Load messages older than this sequence number (cursor from previous response) */
  beforeSequence?: number;
  /** Load messages created AFTER this message ID (for incremental sync) */
  afterMessageId?: string;
}

export interface GetMessagesCursorResponse {
  messages: ChatMessage[];
  /** Total messages in the chat */
  total: number;
  /** Sequence number of oldest message in response (use as cursor for "load more") */
  oldestSequence: number | null;
  /** Whether there are older messages to load */
  hasMore: boolean;
}

/**
 * Internal function that performs the actual API call.
 * Used by the deduplicated wrapper.
 *
 * GUARD (fix-chat-navigation.md): Blocks fetch if not on chat route
 */
async function fetchMessagesCursor(
  params: GetMessagesCursorParams,
  signal?: AbortSignal
): Promise<GetMessagesCursorResponse> {
  // ===========================================================================
  // INVARIANT CHECK: Block message fetches outside chat route
  // ===========================================================================
  const isChatRoute = getGlobalChatRouteState();
  if (!isChatRoute) {
    console.error(
      `[INVARIANT VIOLATION] Chat message fetch attempted outside chat route!`,
      `\n  requestId: ${params.requestId.substring(0, 8)}...`,
      `\n  isChatRoute: ${isChatRoute}`,
      `\n  Stack trace:`,
      new Error().stack
    );
    // Return empty response instead of fetching
    return {
      messages: [],
      total: 0,
      oldestSequence: null,
      hasMore: false,
    };
  }

  console.log(`[messages.ts] ✅ fetchMessagesCursor allowed (on chat route) for ${params.requestId.substring(0, 8)}`);

  const queryParams: Record<string, number | string> = {
    limit: params.limit,
  };

  if (params.beforeSequence !== undefined) {
    queryParams.before_sequence = params.beforeSequence;
  }

  // Support for incremental sync: fetch messages after a specific message ID
  if (params.afterMessageId !== undefined) {
    queryParams.after_message_id = params.afterMessageId;
  }

  const response = await apiClient.get<ChatMessage[]>(
    `/chat/messages/request/${params.requestId}`,
    {
      params: queryParams,
      signal,
    }
  );

  // Parse headers for pagination metadata
  const total = parseInt(response.headers["x-total-count"] || "0", 10);
  const oldestSequenceStr = response.headers["x-oldest-sequence"];
  const oldestSequence = oldestSequenceStr ? parseInt(oldestSequenceStr, 10) : null;
  const hasMore = response.headers["x-has-more"] === "true";

  return {
    messages: response.data,
    total,
    oldestSequence,
    hasMore,
  };
}

/**
 * Get chat messages with cursor-based pagination (RECOMMENDED)
 *
 * Deterministic pagination that handles real-time updates correctly:
 * - Initial load: Returns the last 100 messages (newest)
 * - Load more: Returns 200 older messages using cursor
 *
 * Features request deduplication:
 * - Identical concurrent requests return the same promise
 * - Recent results are cached for 2 seconds to prevent re-fetching
 *
 * @param params - Request ID and cursor pagination options
 * @param signal - Optional AbortSignal for cancelling the request
 * @returns Messages array with cursor metadata
 */
export async function getMessagesCursor(
  params: GetMessagesCursorParams,
  signal?: AbortSignal
): Promise<GetMessagesCursorResponse> {
  // Build deduplication key from request parameters
  const dedupeKey = `messages:${params.requestId}:${params.limit}:${params.beforeSequence ?? "latest"}:${params.afterMessageId ?? "none"}`;

  try {
    // Use deduplication wrapper to prevent concurrent identical requests
    return await deduplicatedFetch(dedupeKey, () =>
      fetchMessagesCursor(params, signal)
    );
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Get chat messages for a service request (LEGACY - offset-based)
 *
 * Endpoint: GET /chat/messages/request/{request_id}
 * Query params: page, per_page
 * Response: ChatMessage[] (array directly, not wrapped)
 * Total count in X-Total-Count header
 *
 * @deprecated Use getMessagesCursor for new code
 * @param params - Request ID and pagination options
 * @param signal - Optional AbortSignal for cancelling the request
 * @returns Messages array with pagination metadata
 */
export async function getMessages(
  params: GetMessagesParams,
  signal?: AbortSignal
): Promise<GetMessagesResponse> {
  // ===========================================================================
  // INVARIANT CHECK: Block message fetches outside chat route
  // ===========================================================================
  const isChatRoute = getGlobalChatRouteState();
  if (!isChatRoute) {
    console.error(
      `[INVARIANT VIOLATION] Legacy getMessages() called outside chat route!`,
      `\n  requestId: ${params.requestId.substring(0, 8)}...`,
      `\n  isChatRoute: ${isChatRoute}`,
      `\n  Stack trace:`,
      new Error().stack
    );
    // Return empty response instead of fetching
    return {
      messages: [],
      total: 0,
      page: params.page || 1,
      perPage: params.pageSize || 50,
    };
  }

  console.log(`[messages.ts] ✅ getMessages allowed (on chat route) for ${params.requestId.substring(0, 8)}`);

  try {
    const page = params.page || 1;
    const perPage = params.pageSize || 50;

    // Use path parameter for request_id (matches Next.js and backend)
    const response = await apiClient.get<ChatMessage[]>(
      `/chat/messages/request/${params.requestId}`,
      {
        params: {
          page,
          per_page: perPage,
        },
        signal, // Add signal support for request cancellation
      }
    );

    // Total count comes from X-Total-Count header
    const total = parseInt(response.headers["x-total-count"] || "0", 10);

    return {
      messages: response.data,
      total,
      page,
      perPage,
    };
  } catch (error) {
    // Don't throw error for aborted requests
    if (isAbortError(error)) {
      throw error; // Re-throw cancel error for caller to handle
    }
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Send a new chat message
 *
 * Endpoint: POST /chat/messages
 * Payload: { request_id, content }
 * Note: sender_id is auto-populated from JWT on backend
 *
 * @param data - Message content and metadata
 * @param signal - Optional AbortSignal for cancelling the request
 * @returns Created chat message
 */
export async function sendMessage(
  data: CreateChatMessage,
  signal?: AbortSignal
): Promise<ChatMessage> {
  try {
    // Convert camelCase to snake_case for backend
    const payload = {
      request_id: data.requestId,
      content: data.content,
      is_screenshot: data.isScreenshot,
      screenshot_file_name: data.screenshotFileName,
    };
    const response = await apiClient.post<ChatMessage>("/chat/messages", payload, {
      signal, // Add signal support for request cancellation
    });
    return response.data;
  } catch (error) {
    // Don't throw error for aborted requests
    if (isAbortError(error)) {
      throw error; // Re-throw cancel error for caller to handle
    }
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Mark chat as read for a request
 *
 * Endpoint: POST /chat/{requestId}/mark-read (matches Next.js)
 * Response: { requestId, userId, markedAt, previousUnread }
 *
 * @param requestId - Request UUID
 * @param signal - Optional AbortSignal for cancelling the request
 */
export async function markMessagesAsRead(
  requestId: string,
  signal?: AbortSignal
): Promise<void> {
  try {
    await apiClient.post(`/chat/${requestId}/mark-read`, {}, {
      signal, // Add signal support for request cancellation
    });
  } catch (error) {
    // Don't throw error for aborted requests
    if (isAbortError(error)) {
      throw error; // Re-throw cancel error for caller to handle
    }
    throw new Error(getErrorMessage(error));
  }
}

/**
 * Helper to create a text message payload
 * @param requestId - Request UUID
 * @param content - Message text
 * @returns CreateChatMessage object
 */
export function createTextMessage(
  requestId: string,
  content: string
): CreateChatMessage {
  return {
    requestId,
    content,
  };
}

/**
 * Get total unread message count across all chats
 *
 * Endpoint: GET /chat/total-unread
 * Response: { totalUnread: number }
 *
 * @returns Total unread count
 */
export async function getTotalUnreadCount(): Promise<number> {
  try {
    const response = await apiClient.get<{ totalUnread: number }>("/chat/total-unread");
    return response.data.totalUnread;
  } catch (error) {
    console.error('[getTotalUnreadCount] Internal Server Error total unread count:', error);
    return 0; // Return 0 on error instead of throwing
  }
}
