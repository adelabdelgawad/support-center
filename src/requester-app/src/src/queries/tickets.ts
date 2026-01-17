/**
 * TanStack Solid Query hooks for tickets data fetching
 *
 * Benefits:
 * - Automatic caching between navigations
 * - Background refetching
 * - Optimistic updates
 * - Deduplication of requests
 *
 * Query Keys:
 * - ['tickets', 'all-user-tickets'] - All tickets for the user (unfiltered)
 * - ['tickets', 'detail', ticketId] - Single ticket details
 * - ['messages', ticketId] - Chat messages for a ticket
 *
 * ===========================================================================
 * RESPONSIBILITY BOUNDARY (fix-chat-navigation.md)
 * ===========================================================================
 *
 * The useAllUserTickets() hook is used by the TICKETS PAGE only.
 * It fetches ticket LIST metadata - NOT individual chat messages.
 *
 * CRITICAL: This module MUST NOT:
 * - Call getMessagesCursor() or getMessages() for ticket list purposes
 * - Call chatSyncService.updateBackendSequence() for multiple tickets
 * - Invoke any chat sync operations from ticket list context
 *
 * Backend sequence updates happen ONLY in:
 * - use-chat-sync.ts (when a specific chat is opened)
 *
 * This prevents the "SQLite write queue storm" that occurred when
 * backend sequences were updated for ALL tickets on page load.
 * ===========================================================================
 */

import { createQuery, createMutation, useQueryClient, createInfiniteQuery } from "@tanstack/solid-query";
import { createMemo, type Accessor } from "solid-js";
import {
  getRequestById,
  createRequest,
  getAllUserTickets,
  getPaginatedRequests,
} from "@/api/requests";
import { getMessages, getMessagesCursor } from "@/api/messages";
import type { GetMessagesCursorResponse } from "@/api/messages";
import { ticketCache } from "@/lib/ticket-cache";
// NOTE: chatSyncService import REMOVED - backend sequences are now updated only in chat route
import type {
  TicketFilterParams,
  ChatPageResponse,
  ChatMessageListItem,
  TicketListItem,
  RequestStatusCount,
  CreateServiceRequest,
  ChatMessage,
  ServiceRequest,
  PaginatedResponse,
} from "@/types";
import type { GetMessagesResponse } from "@/api/messages";

// =============================================================================
// Data Transformations
// =============================================================================

/**
 * Convert ChatMessageListItem from API to TicketListItem for UI
 */
function convertToTicketListItem(item: ChatMessageListItem): TicketListItem {
  return {
    id: item.id,
    subject: item.title,
    description: "",
    statusId: item.statusId,
    status: item.status,
    statusColor: item.statusColor,
    countAsSolved: item.countAsSolved,
    chatStatus: item.unreadCount > 0 ? "unread" : "read",
    technicianName: item.technicianName,
    lastMessage: item.lastMessage,
    lastMessageAt: item.lastMessageAt,
    unreadCount: item.unreadCount,
    // Use createdAt if available, otherwise fall back to lastMessageAt
    createdAt: new Date(item.createdAt || item.lastMessageAt || Date.now()),
    updatedAt: new Date(item.lastMessageAt || Date.now()),
  };
}

/**
 * Sort tickets by creation date (newest first)
 */
function sortTicketsByTime(tickets: TicketListItem[]): TicketListItem[] {
  return [...tickets].sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return timeB - timeA; // Newest first
  });
}

/**
 * Apply client-side filters to tickets
 */
function filterTickets(
  tickets: TicketListItem[],
  filters: TicketFilterParams
): TicketListItem[] {
  let filtered = [...tickets];

  // Apply status filter
  if (filters.statusFilter !== undefined && filters.statusFilter !== null) {
    filtered = filtered.filter((ticket) => ticket.statusId === filters.statusFilter);
  }

  // Apply read filter
  if (filters.readFilter === "unread") {
    filtered = filtered.filter((ticket) => ticket.unreadCount > 0);
  } else if (filters.readFilter === "read") {
    filtered = filtered.filter((ticket) => ticket.unreadCount === 0);
  }

  return filtered;
}

/**
 * Compute status counts from all tickets
 */
function computeStatusCounts(
  allTickets: TicketListItem[],
  requestStatuses: RequestStatusCount[]
): RequestStatusCount[] {
  const statusCountMap = new Map<number, number>();

  allTickets.forEach((ticket) => {
    const statusId = ticket.statusId;
    if (statusId !== undefined && statusId !== null) {
      statusCountMap.set(statusId, (statusCountMap.get(statusId) || 0) + 1);
    }
  });

  return requestStatuses.map((status) => ({
    ...status,
    count: statusCountMap.get(status.id) || 0,
  }));
}

/**
 * Transformed ticket page data for UI consumption
 */
export interface TransformedTicketPageData {
  ticketListItems: TicketListItem[];
  requestStatuses: RequestStatusCount[];
  totalCount: number;
  filteredTotalCount: number;
  unreadCount: number;
}

/**
 * Transform raw API response to UI-friendly format
 */
function transformTicketPageData(response: ChatPageResponse): TransformedTicketPageData {
  const ticketListItems = response.chatMessages.map(convertToTicketListItem);
  const sortedTickets = sortTicketsByTime(ticketListItems);

  const unreadCount = sortedTickets.reduce(
    (sum, t) => sum + (t.unreadCount || 0),
    0
  );

  return {
    ticketListItems: sortedTickets,
    requestStatuses: response.requestStatus || [],
    totalCount: sortedTickets.length,
    filteredTotalCount: sortedTickets.length,
    unreadCount,
  };
}

// =============================================================================
// Query Keys Factory
// =============================================================================

export const ticketKeys = {
  all: ["tickets"] as const,
  allUserTickets: () => [...ticketKeys.all, "all-user-tickets"] as const,
  detail: (id: string) => [...ticketKeys.all, "detail", id] as const,
};

export const messageKeys = {
  all: ["messages"] as const,
  list: (ticketId: string) => [...messageKeys.all, ticketId] as const,
};

// =============================================================================
// Tickets Queries
// =============================================================================

/**
 * Hook to fetch ALL tickets for the current user (no server-side filtering)
 * This fetches all tickets once and applies filters client-side
 *
 * INSTANT STARTUP: Uses IndexedDB cache for instant initial render
 *
 * @param filters - Accessor for client-side filters to apply
 * @returns Filtered ticket page data
 */
export function useAllUserTickets(filters?: Accessor<TicketFilterParams | undefined>) {
  // Get cached data synchronously for instant render (ONLY for first app startup)
  const cachedData = ticketCache.getCachedTicketsSync();

  // Fetch all tickets (without filters)
  const query = createQuery(() => ({
    queryKey: ticketKeys.allUserTickets(),
    queryFn: async ({ signal }) => {
      // CRITICAL: Capture the optimistic version BEFORE fetching
      // This allows us to detect if any optimistic updates happened during the fetch
      const versionAtFetchStart = getGlobalOptimisticVersion();

      const data = await getAllUserTickets(signal);

      // Check if any optimistic updates happened DURING the fetch
      const versionAfterFetch = getGlobalOptimisticVersion();
      const hadOptimisticUpdatesDuringFetch = versionAfterFetch > versionAtFetchStart;

      // CRITICAL: Preserve optimistic updates using the module-level tracking map
      // This is more reliable than getQueryData which may return stale data inside queryFn
      if (data && data.chatMessages) {
        // Apply optimistic updates - these are tracked separately and are reliable
        data.chatMessages = data.chatMessages.map(ticket => {
          const optimisticUnread = getOptimisticUpdate(ticket.id);
          const serverUnread = ticket.unreadCount || 0;

          if (optimisticUnread !== null) {
            // We have an optimistic update for this ticket - ALWAYS preserve it
            // The optimistic update is newer than any server response could be
            if (optimisticUnread !== serverUnread) {
              return { ...ticket, unreadCount: optimisticUnread };
            } else {
              // Server caught up - but only clear if no updates happened during fetch
              // This prevents race conditions where mark-as-read completes during refetch
              if (!hadOptimisticUpdatesDuringFetch) {
                clearOptimisticUpdate(ticket.id);
              }
            }
          }

          return ticket;
        });
      }

      // Persist to cache for next startup (fire-and-forget)
      if (data && data.chatMessages.length > 0) {
        ticketCache.cacheTickets(data).catch((err) => {
          console.warn("[useAllUserTickets] Failed to cache tickets:", err);
        });

        // NOTE: Backend sequence updates REMOVED from tickets page (fix-chat-navigation.md)
        // Problem: Updating backendSeq for ALL tickets caused SQLite write queue storm
        // (50 tickets × ~30ms each = 1.5s blocking navigation)
        // Solution: backendSeq is now updated ONLY when a specific chat is opened
        // The chat sync service validates sequences on-demand in onChatOpen()
      }

      return data;
    },
    // INSTANT STARTUP: Use cached data for immediate render
    initialData: cachedData || undefined,
    initialDataUpdatedAt: cachedData ? Date.now() - 30 * 1000 : undefined, // Mark as slightly stale to trigger refetch
    staleTime: 30 * 1000, // 30 seconds - balance between fresh data and performance
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
    refetchOnMount: 'always', // Always check for updates but show cached data first
    placeholderData: (previousData) => previousData, // Show cached data while refetching
    retry: 2, // Retry failed requests twice
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
  }));

  // Apply client-side filtering and transformation (reactive)
  const transformedData = createMemo(() => {
    if (!query.data) return null;

    // Transform the raw data
    const allData = transformTicketPageData(query.data);

    // Apply client-side filters
    const currentFilters = filters?.();

    // Apply status filter only (for filteredTotalCount)
    let statusFilteredTickets = allData.ticketListItems;
    if (currentFilters?.statusFilter !== undefined && currentFilters?.statusFilter !== null) {
      statusFilteredTickets = allData.ticketListItems.filter(
        (ticket) => ticket.statusId === currentFilters.statusFilter
      );
    }

    // Apply all filters (status + read)
    const filteredTickets = currentFilters
      ? filterTickets(allData.ticketListItems, currentFilters)
      : allData.ticketListItems;

    // Compute counts based on filtered tickets
    const filteredUnreadCount = filteredTickets.reduce(
      (sum, t) => sum + (t.unreadCount || 0),
      0
    );

    // Update status counts based on ALL tickets (not filtered)
    const updatedStatuses = computeStatusCounts(
      allData.ticketListItems,
      allData.requestStatuses
    );

    return {
      ticketListItems: filteredTickets,
      requestStatuses: updatedStatuses,
      totalCount: allData.ticketListItems.length, // Total of ALL tickets (no filters)
      filteredTotalCount: statusFilteredTickets.length, // Total after status filter only
      unreadCount: filteredUnreadCount,
    };
  });

  return {
    get data() { return transformedData(); },
    get isLoading() { return query.isLoading; },
    get isFetching() { return query.isFetching; },
    get error() { return query.error; },
    refetch: query.refetch,
  };
}

/**
 * Hook to fetch a single ticket by ID
 */
export function useTicketDetail(ticketId: Accessor<string>, enabled: Accessor<boolean> = () => true) {
  return createQuery(() => ({
    queryKey: ticketKeys.detail(ticketId()),
    queryFn: ({ signal }) => getRequestById(ticketId(), signal), // Pass signal for request cancellation
    enabled: enabled() && !!ticketId(),
    staleTime: 60 * 1000, // 1 minute
    gcTime: 10 * 60 * 1000, // 10 minutes
    placeholderData: (previousData) => previousData, // Show cached data while refetching
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  }));
}

/**
 * Hook to create a new ticket
 */
export function useCreateTicket() {
  const queryClient = useQueryClient();

  return createMutation(() => ({
    mutationFn: (data: CreateServiceRequest) => createRequest(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ticketKeys.allUserTickets() });
    },
  }));
}

// =============================================================================
// Messages Queries
// =============================================================================

/**
 * Hook to fetch chat messages for a ticket (LEGACY - offset-based)
 * @deprecated Use useTicketMessagesCursor for new code
 */
export function useTicketMessages(
  ticketId: Accessor<string>,
  options?: {
    page?: number;
    pageSize?: number | Accessor<number>;
    enabled?: Accessor<boolean>;
    initialData?: GetMessagesResponse | null;
  }
) {
  const { page = 1, enabled = () => true, initialData } = options ?? {};

  return createQuery<GetMessagesResponse>(() => {
    // Compute pageSize inside the reactive function so it updates when the signal changes
    const pageSize = typeof options?.pageSize === 'function' ? options.pageSize() : (options?.pageSize || 20);

    return {
      queryKey: [...messageKeys.list(ticketId()), { page, pageSize }],
      queryFn: ({ signal }) =>
        getMessages({
          requestId: ticketId(),
          page,
          pageSize,
        }, signal), // Pass signal for request cancellation
      enabled: enabled() && !!ticketId(),
      // Use initialData from cache if provided (enables instant render)
      initialData: initialData || undefined,
      staleTime: 30 * 1000, // 30 seconds - messages are handled by WebSocket for real-time updates
      gcTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
      placeholderData: (previousData) => previousData,
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    };
  });
}

/**
 * Hook to fetch chat messages with cursor-based pagination (RECOMMENDED)
 *
 * Deterministic pagination optimized for chat UX:
 * - Initial load: Returns the last 100 messages (newest)
 * - Load more: Fetches 200 older messages using cursor
 *
 * Benefits:
 * - No duplicate/missing messages when new messages arrive
 * - Stable scroll position when prepending older messages
 * - Efficient database queries using sequence_number index
 */
export function useTicketMessagesCursor(
  ticketId: Accessor<string>,
  options?: {
    /** Limit for initial load (default: 100) */
    initialLimit?: number;
    /** Limit for load more requests (default: 200) */
    loadMoreLimit?: number;
    /** Cursor for loading older messages */
    beforeSequence?: Accessor<number | undefined>;
    enabled?: Accessor<boolean>;
    /** Initial data from cache for instant render */
    initialData?: GetMessagesCursorResponse | null;
  }
) {
  const {
    initialLimit = 100,
    loadMoreLimit = 200,
    beforeSequence,
    enabled = () => true,
    initialData,
  } = options ?? {};

  return createQuery<GetMessagesCursorResponse>(() => {
    const cursor = beforeSequence?.();
    const limit = cursor !== undefined ? loadMoreLimit : initialLimit;

    return {
      queryKey: [...messageKeys.list(ticketId()), "cursor", { limit, beforeSequence: cursor }],
      queryFn: ({ signal }) =>
        getMessagesCursor({
          requestId: ticketId(),
          limit,
          beforeSequence: cursor,
        }, signal),
      enabled: enabled() && !!ticketId(),
      initialData: initialData || undefined,
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      placeholderData: (previousData) => previousData,
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    };
  });
}

// =============================================================================
// Optimistic Update Tracking
// =============================================================================

/**
 * Track tickets that have been optimistically updated (e.g., marked as read).
 * This is used to preserve optimistic updates when server returns stale data.
 *
 * Key: ticketId
 * Value: { unreadCount, timestamp, version }
 *
 * The version number increases monotonically and ensures newer updates
 * are never overwritten by older server responses.
 */
interface OptimisticUpdate {
  unreadCount: number;
  timestamp: number;
  version: number;
}

const optimisticUpdates = new Map<string, OptimisticUpdate>();

// Global version counter - increases on every optimistic update
// This prevents race conditions where server data arrives after local updates
let globalOptimisticVersion = 0;

// Clear old optimistic updates after 120 seconds (extended TTL for slower networks)
// This gives more time for the HTTP mark-as-read to complete and sync to server
const OPTIMISTIC_UPDATE_TTL = 120 * 1000;

function cleanupOldOptimisticUpdates() {
  const now = Date.now();
  for (const [ticketId, update] of optimisticUpdates.entries()) {
    if (now - update.timestamp > OPTIMISTIC_UPDATE_TTL) {
      optimisticUpdates.delete(ticketId);
    }
  }
}

/**
 * Record an optimistic update for a ticket
 * Returns the version number of this update for tracking
 */
export function recordOptimisticUpdate(ticketId: string, unreadCount: number): number {
  cleanupOldOptimisticUpdates();
  globalOptimisticVersion++;
  const version = globalOptimisticVersion;
  optimisticUpdates.set(ticketId, { unreadCount, timestamp: Date.now(), version });
  return version;
}

/**
 * Get optimistic update for a ticket (if any)
 */
export function getOptimisticUpdate(ticketId: string): number | null {
  const update = optimisticUpdates.get(ticketId);
  if (!update) return null;

  // Check if expired
  if (Date.now() - update.timestamp > OPTIMISTIC_UPDATE_TTL) {
    optimisticUpdates.delete(ticketId);
    return null;
  }

  return update.unreadCount;
}

/**
 * Clear optimistic update for a ticket (when server confirms)
 */
export function clearOptimisticUpdate(ticketId: string) {
  optimisticUpdates.delete(ticketId);
}

/**
 * Get the current global optimistic version
 * Used to track if cache has been updated since a server request started
 */
export function getGlobalOptimisticVersion(): number {
  return globalOptimisticVersion;
}

/**
 * Check if a server response should be applied based on version
 * Returns true if the response is from after the last optimistic update
 */
export function shouldApplyServerResponse(requestStartVersion: number): boolean {
  // If no optimistic updates happened since the request started, apply the response
  return globalOptimisticVersion === requestStartVersion;
}

// =============================================================================
// Cache Manipulation Utilities
// =============================================================================

/**
 * Utility to add a message to the cache (for WebSocket updates)
 */
export function useAddMessageToCache() {
  const queryClient = useQueryClient();

  return (ticketId: string, message: ChatMessage) => {
    queryClient.setQueryData(
      [...messageKeys.list(ticketId), { page: 1, pageSize: 50 }],
      (old: GetMessagesResponse | undefined) => {
        if (!old) return old;

        // Check for duplicates
        if (old.messages.some((m) => m.id === message.id)) {
          return old;
        }

        return {
          ...old,
          messages: [...old.messages, message],
          total: old.total + 1,
        };
      }
    );
  };
}

/**
 * Utility to update ticket in cache (for WebSocket updates)
 *
 * This function updates both:
 * 1. TanStack Query cache (for reactive UI updates)
 * 2. IndexedDB cache (for persistence across page reloads)
 */
export function useUpdateTicketInCache() {
  const queryClient = useQueryClient();

  return (
    ticketId: string,
    updates: Partial<{
      status: string;
      statusColor: string;
      technicianName: string;
      lastMessage: string;
      lastMessageAt: string;
      unreadCount: number;
      chatStatus: "read" | "unread";
      incrementUnread?: boolean; // Flag to increment instead of setting
    }>
  ) => {
    // Track the computed unreadCount for IndexedDB sync
    let computedUnreadCount: number | undefined;

    queryClient.setQueryData(
      ticketKeys.allUserTickets(),
      (old: ChatPageResponse | undefined) => {
        if (!old?.chatMessages) {
          return old;
        }

        const updated = {
          ...old,
          chatMessages: old.chatMessages.map((ticket) => {
            if (ticket.id !== ticketId) return ticket;

            // Handle unread count increment
            const newUnreadCount = updates.incrementUnread
              ? (ticket.unreadCount || 0) + (updates.unreadCount || 1)
              : updates.unreadCount !== undefined
                ? updates.unreadCount
                : ticket.unreadCount;

            // Store computed count for IndexedDB sync
            computedUnreadCount = newUnreadCount;

            // CRITICAL: Record this as an optimistic update
            // This will be used by useAllUserTickets to preserve this value
            // even when server returns stale data
            recordOptimisticUpdate(ticketId, newUnreadCount);

            const updatedTicket = {
              ...ticket,
              ...updates,
              unreadCount: newUnreadCount,
            };

            // Remove the incrementUnread flag from the final object
            delete (updatedTicket as any).incrementUnread;

            return updatedTicket;
          }),
        };

        return updated;
      }
    );

    // Sync to IndexedDB cache (fire-and-forget)
    // This ensures the persisted cache stays in sync with TanStack Query cache
    const indexedDBUpdates: Partial<ChatMessageListItem> = {};
    if (updates.lastMessage !== undefined) indexedDBUpdates.lastMessage = updates.lastMessage;
    if (updates.lastMessageAt !== undefined) indexedDBUpdates.lastMessageAt = updates.lastMessageAt;
    if (computedUnreadCount !== undefined) indexedDBUpdates.unreadCount = computedUnreadCount;
    if (updates.status !== undefined) indexedDBUpdates.status = updates.status;
    if (updates.statusColor !== undefined) indexedDBUpdates.statusColor = updates.statusColor;
    if (updates.technicianName !== undefined) indexedDBUpdates.technicianName = updates.technicianName;

    if (Object.keys(indexedDBUpdates).length > 0) {
      ticketCache.updateTicket(ticketId, indexedDBUpdates).catch((err) => {
        console.warn("[useUpdateTicketInCache] Failed to sync to IndexedDB:", err);
      });
    }

    // Note: setQueryData automatically notifies all observers
    // No need to invalidate - that would trigger isFetching state
  };
}

/**
 * Utility to get a single ticket from cache by ID
 */
export function useTicketFromCache(ticketId: Accessor<string>) {
  const queryClient = useQueryClient();

  return createMemo(() => {
    const cached = queryClient.getQueryData<ChatPageResponse>(ticketKeys.allUserTickets());
    if (!cached?.chatMessages) return null;

    const ticket = cached.chatMessages.find((t) => t.id === ticketId());
    return ticket || null;
  });
}

/**
 * Prefetch ticket messages
 *
 * @deprecated REMOVED in fix-chat-navigation.md
 * This function was causing HTTP fetches to /chat/messages while on the tickets
 * page (via ChatListItem hover). Message loading now happens ONLY when the chat
 * route is mounted.
 *
 * If you're seeing this warning, you should NOT be using this function.
 * The route-level guard in messages.ts will block the request anyway.
 */
export function usePrefetchMessages() {
  const queryClient = useQueryClient();

  return (ticketId: string) => {
    // BLOCKED: Message prefetch is no longer allowed (fix-chat-navigation.md)
    console.warn(
      `[usePrefetchMessages] ⚠️ DEPRECATED - Message prefetch for ${ticketId.substring(0, 8)} blocked.`,
      `\nMessage fetches are only allowed when chat route is mounted.`,
      `\nThis function should be removed from all calling code.`
    );

    // DO NOT prefetch - this causes invariant violations
    // The getMessages call will be blocked by the route guard anyway
  };
}

// =============================================================================
// Infinite Scroll Queries
// =============================================================================

/**
 * Convert ServiceRequest to TicketListItem for infinite scroll
 */
function convertServiceRequestToTicketListItem(request: ServiceRequest): TicketListItem {
  return {
    id: request.id,
    subject: request.title,
    description: request.description || "",
    statusId: request.statusId,
    status: request.status || "",
    statusColor: undefined, // Will be populated from status object if available
    chatStatus: "read", // Default, will be updated by WebSocket
    technicianName: undefined,
    lastMessage: undefined,
    lastMessageAt: undefined,
    unreadCount: 0, // Will be updated by WebSocket
    createdAt: new Date(request.createdAt),
    updatedAt: new Date(request.updatedAt),
  };
}

/**
 * Hook for infinite scroll pagination of tickets
 * Fetches tickets in pages of 100 items
 */
export function useInfiniteTickets() {
  const query = createInfiniteQuery(() => ({
    queryKey: [...ticketKeys.all, "infinite"],
    queryFn: ({ pageParam = 1, signal }) => getPaginatedRequests({ page: pageParam, limit: 100 }, signal),
    initialPageParam: 1,
    getNextPageParam: (lastPage: PaginatedResponse<ServiceRequest>) => {
      // Check if there are more pages
      if (lastPage.page < lastPage.pages) {
        return lastPage.page + 1;
      }
      return undefined; // No more pages
    },
    staleTime: 30 * 1000, // 30 seconds - balance between fresh data and performance
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    placeholderData: (previousData) => previousData, // Show cached data while refetching
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  }));

  // Flatten pages and convert to TicketListItem
  const allTickets = createMemo(() => {
    if (!query.data) return [];

    return query.data.pages.flatMap((page) =>
      page.items.map(convertServiceRequestToTicketListItem)
    );
  });

  // Get total count from first page
  const totalCount = createMemo(() => {
    if (!query.data?.pages?.[0]) return 0;
    return query.data.pages[0].total;
  });

  return {
    get tickets() { return allTickets(); },
    get totalCount() { return totalCount(); },
    get isLoading() { return query.isLoading; },
    get isFetching() { return query.isFetching; },
    get isFetchingNextPage() { return query.isFetchingNextPage; },
    get hasNextPage() { return query.hasNextPage; },
    get error() { return query.error; },
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
  };
}
