/**
 * TanStack Solid Query hook for ticket search
 *
 * Provides server-side search with:
 * - Text search in ticket titles and message content
 * - Status and read status filtering
 * - Pagination
 * - Deep linking support via matched message info
 *
 * Query Key: ['search', 'tickets', { query, statusFilter, readFilter, page, perPage }]
 */

import { createQuery } from "@tanstack/solid-query";
import { createMemo, type Accessor } from "solid-js";
import {
  searchTickets,
  type SearchParams,
  type SearchResponse,
  type TicketSearchResult,
} from "@/api/search";
import type { TicketListItem } from "@/types";

// =============================================================================
// Query Keys Factory
// =============================================================================

export const searchKeys = {
  all: ["search"] as const,
  tickets: (params: SearchParams) =>
    [...searchKeys.all, "tickets", params] as const,
};

// =============================================================================
// Data Transformations
// =============================================================================

/**
 * Convert search result to TicketListItem for UI compatibility
 * This allows search results to be displayed using the same ChatListItem component
 */
export function convertSearchResultToTicketListItem(
  result: TicketSearchResult
): TicketListItem & {
  matchType: "subject" | "message" | "both";
  matchedMessageId?: string;
  matchedMessageExcerpt?: string;
} {
  return {
    // Standard TicketListItem fields
    id: result.ticketId,
    subject: result.subject,
    description: "",
    statusId: result.statusId,
    status: result.status,
    statusColor: result.statusColor,
    countAsSolved: result.countAsSolved,
    chatStatus: result.unreadCount > 0 ? "unread" : "read",
    technicianName: undefined,
    lastMessage: result.lastMessage,
    lastMessageAt: result.lastMessageAt,
    unreadCount: result.unreadCount,
    createdAt: new Date(), // Not available in search results
    updatedAt: new Date(), // Not available in search results

    // Search-specific fields for deep linking
    matchType: result.matchType,
    matchedMessageId: result.matchedMessage?.id,
    matchedMessageExcerpt: result.matchedMessage?.excerpt,
  };
}

// =============================================================================
// Search Query Hook
// =============================================================================

/**
 * Hook to search tickets by title and message content
 *
 * @param params - Accessor that returns search parameters or null to disable
 * @returns Query result with search response
 *
 * @example
 * ```tsx
 * const [searchQuery, setSearchQuery] = createSignal("");
 *
 * const searchParams = createMemo(() => {
 *   const query = searchQuery();
 *   if (!query || query.length < 1) return null;
 *   return { query, statusFilter: "all", readFilter: "all" };
 * });
 *
 * const searchResults = useSearchTickets(searchParams);
 *
 * return (
 *   <Show when={searchResults.data}>
 *     {(data) => (
 *       <For each={data().results}>
 *         {(result) => <ChatListItem ticket={convertSearchResultToTicketListItem(result)} />}
 *       </For>
 *     )}
 *   </Show>
 * );
 * ```
 */
export function useSearchTickets(params: Accessor<SearchParams | null>) {
  const query = createQuery(() => ({
    queryKey: params() ? searchKeys.tickets(params()!) : searchKeys.all,
    queryFn: ({ signal }) => {
      const p = params();
      if (!p) throw new Error("Search params required");
      return searchTickets(p, signal);
    },
    // Only enable when we have a valid query
    enabled: !!params()?.query && params()!.query.length > 0,
    // Stale time: 30 seconds - search results don't need to be super fresh
    staleTime: 30 * 1000,
    // Cache time: 5 minutes
    gcTime: 5 * 60 * 1000,
    // Show previous data while fetching new results (prevents flicker)
    placeholderData: (previousData) => previousData,
    // Retry failed requests
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  }));

  // Transform results to TicketListItem format for UI
  const ticketListItems = createMemo(() => {
    if (!query.data?.results) return [];
    return query.data.results.map(convertSearchResultToTicketListItem);
  });

  return {
    // Raw query data
    get data() {
      return query.data;
    },
    // Transformed results for UI
    get ticketListItems() {
      return ticketListItems();
    },
    // Loading states
    get isLoading() {
      return query.isLoading;
    },
    get isFetching() {
      return query.isFetching;
    },
    // Error handling
    get error() {
      return query.error;
    },
    // Refetch function
    refetch: query.refetch,
  };
}

// Re-export types for convenience
export type { SearchParams, SearchResponse, TicketSearchResult } from "@/api/search";
