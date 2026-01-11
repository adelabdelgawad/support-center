/**
 * Search API Client
 *
 * This module handles ticket search operations with deep linking support.
 *
 * Endpoints used:
 * - GET /search/tickets - Search tickets by title and message content
 */

import apiClient, { getErrorMessage } from "./client";

/**
 * Check if error is an AbortError (request was cancelled)
 */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

// ============================================================================
// Types
// ============================================================================

/**
 * Search request parameters
 */
export interface SearchParams {
  /** Search query string (min 1, max 100 chars) */
  query: string;
  /** Status filter: all, open, or solved */
  statusFilter?: "all" | "open" | "solved";
  /** Read status filter: all, read, or unread */
  readFilter?: "all" | "read" | "unread";
  /** Page number (1-indexed) */
  page?: number;
  /** Results per page (1-100) */
  perPage?: number;
}

/**
 * Matched message details for deep linking (future use)
 */
export interface MatchedMessage {
  /** Message UUID for deep linking */
  id: string;
  /** Full message content */
  content: string;
  /** Excerpt with context around the match (~100 chars) */
  excerpt: string;
  /** Message sequence number for ordering */
  sequenceNumber: number;
  /** Message creation timestamp (ISO 8601) */
  createdAt: string;
  /** Sender display name (or "Support Agent" for technicians) */
  senderName?: string;
}

/**
 * Single search result with deep link information
 */
export interface TicketSearchResult {
  /** Service request UUID */
  ticketId: string;
  /** Request title/subject */
  subject: string;
  /** Status display name */
  status: string;
  /** Status ID for filtering */
  statusId: number;
  /** Status color for UI (e.g., "#22c55e") */
  statusColor?: string;
  /** Whether status is considered solved/closed */
  countAsSolved: boolean;
  /** Number of unread messages */
  unreadCount: number;
  /** Last message preview text */
  lastMessage?: string;
  /** Last message timestamp (ISO 8601) */
  lastMessageAt?: string;
  /** Assigned technician name */
  technicianName?: string;
  /** Where match was found: "subject", "message", or "both" */
  matchType: "subject" | "message" | "both";
  /** Most recent matched message (for deep linking) - future use */
  matchedMessage?: MatchedMessage;
}

/**
 * Search response with pagination
 */
export interface SearchResponse {
  /** List of matching tickets */
  results: TicketSearchResult[];
  /** Total number of matching tickets */
  total: number;
  /** Current page number */
  page: number;
  /** Results per page */
  perPage: number;
  /** Total number of pages */
  totalPages: number;
}

// ============================================================================
// Backend Response Types (raw API format)
// ============================================================================

/**
 * Raw chat message item from backend /search/tickets endpoint
 * Backend uses camelCase due to HTTPSchemaModel
 */
interface BackendChatMessageItem {
  id: string;
  title: string;
  statusId: number;
  status: string;
  statusColor?: string;
  countAsSolved: boolean;
  technicianName?: string | null;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  unreadCount: number;
}

/**
 * Raw response from backend /search/tickets endpoint
 * This is ChatPageResponse format
 */
interface BackendSearchResponse {
  requestStatus: unknown[];
  chatMessagesCount: unknown;
  chatMessages: BackendChatMessageItem[];
  statuses: unknown[];
}

// ============================================================================
// Response Transformation
// ============================================================================

/**
 * Transform backend chat message item to frontend TicketSearchResult
 */
function transformToTicketSearchResult(
  item: BackendChatMessageItem
): TicketSearchResult {
  return {
    ticketId: item.id,
    subject: item.title,
    status: item.status,
    statusId: item.statusId,
    statusColor: item.statusColor,
    countAsSolved: item.countAsSolved,
    unreadCount: item.unreadCount,
    lastMessage: item.lastMessage ?? undefined,
    lastMessageAt: item.lastMessageAt ?? undefined,
    technicianName: item.technicianName ?? undefined,
    // Default to "subject" since backend doesn't provide matchType yet
    matchType: "subject",
    matchedMessage: undefined,
  };
}

/**
 * Transform backend response to frontend SearchResponse format
 */
function transformBackendResponse(
  backendResponse: BackendSearchResponse,
  page: number,
  perPage: number
): SearchResponse {
  const results = backendResponse.chatMessages.map(transformToTicketSearchResult);
  const total = results.length;
  const totalPages = Math.ceil(total / perPage) || 1;

  return {
    results,
    total,
    page,
    perPage,
    totalPages,
  };
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Search tickets by title and message content.
 *
 * This function provides server-side search with:
 * - Text search in ticket titles and chat message content (ILIKE)
 * - Status filtering (all/open/solved)
 * - Read status filtering (all/read/unread)
 * - Pagination
 *
 * Each result includes matched message info for deep linking.
 *
 * @param params - Search parameters
 * @param signal - Optional AbortSignal for cancelling the request
 * @returns Search response with matching tickets and pagination
 *
 * @example
 * ```ts
 * const results = await searchTickets({
 *   query: "password",
 *   statusFilter: "open",
 *   readFilter: "unread",
 * });
 *
 * // Navigate to matched message
 * if (results.results[0]?.matchedMessage) {
 *   const { ticketId, matchedMessage } = results.results[0];
 *   navigate(`/tickets/${ticketId}/chat?messageId=${matchedMessage.id}&highlight=true`);
 * }
 * ```
 */
export async function searchTickets(
  params: SearchParams,
  signal?: AbortSignal
): Promise<SearchResponse> {
  try {
    const page = params.page || 1;
    const perPage = params.perPage || 50;

    const response = await apiClient.get<BackendSearchResponse>("/search/tickets", {
      params: {
        q: params.query,
        status_filter: params.statusFilter || "all",
        read_filter: params.readFilter || "all",
        page,
        per_page: perPage,
      },
      signal,
    });

    // Transform backend ChatPageResponse to frontend SearchResponse format
    return transformBackendResponse(response.data, page, perPage);
  } catch (error) {
    // Don't throw error for aborted requests
    if (isAbortError(error)) {
      throw error; // Re-throw cancel error for caller to handle
    }
    throw new Error(getErrorMessage(error));
  }
}
