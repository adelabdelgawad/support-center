/**
 * Tickets Route - List of service requests
 *
 * SolidJS version of the tickets page with:
 * - Server-side search with deep linking
 * - Client-side filtering
 * - TanStack Solid Query for data fetching
 * - WebSocket for real-time updates
 */

import { createSignal, createEffect, createMemo, onCleanup, onMount, Show } from "solid-js";
import { useNavigate, useSearchParams } from "@solidjs/router";
import { useNotificationSignalR } from "@/signalr";
import {
  useAllUserTickets,
  useCreateTicket,
  useUpdateTicketInCache,
  useSearchTickets,
  type SearchParams,
} from "@/queries";
import {
  FilterBar,
  NewRequestFab,
  NewRequestModal,
  SearchInput,
} from "@/components/ticket";
import { ChatLayout } from "@/components/chat-layout";
import { ChatList } from "@/components/chat-list";
import type { TicketListItem, TicketFilterParams } from "@/types";
import { requestNotificationPermission } from "@/lib/notifications";

export default function TicketsPage() {
  console.log(`[TicketsPage] 🚀 COMPONENT MOUNTING at ${new Date().toISOString()}`);

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // TODO: Refactor WebSocket usage - old useWebSocket() hook removed
  // Need to handle ticket_update messages via GlobalWebSocket or NotificationWebSocket
  // const { onMessage, isConnected } = useWebSocket();

  // SignalR notification for real-time chat notifications
  const notificationWs = useNotificationSignalR();

  onMount(() => {
    console.log(`[TicketsPage] ✅ COMPONENT MOUNTED`);
  });

  onCleanup(() => {
    console.log(`[TicketsPage] 🔚 COMPONENT UNMOUNTING`);
  });

  // UI state
  const [showNewRequestModal, setShowNewRequestModal] = createSignal(false);

  // Search state - initialized from URL params
  const [searchQuery, setSearchQuery] = createSignal(searchParams.q || "");

  // Determine if search is active (query has at least 1 character)
  const isSearchActive = () => searchQuery().length > 0;

  // Derive filters from URL search params (reactive) - must be before searchParamsForQuery
  const currentFilters = createMemo((): TicketFilterParams => ({
    statusFilter: searchParams.status_filter ? Number(searchParams.status_filter) : undefined,
    readFilter: searchParams.read_filter as "read" | "unread" | undefined,
  }));

  // Build search params for the query (reactive)
  const searchParamsForQuery = createMemo((): SearchParams | null => {
    const query = searchQuery();
    if (!query || query.length < 1) return null;

    // Convert filters to search API format
    const filters = currentFilters();
    let statusFilter: "all" | "open" | "solved" = "all";
    if (filters.statusFilter !== undefined) {
      // We need to determine if the status is "solved" or "open"
      // For simplicity, we'll just pass "all" for now and let the backend handle it
      // In a real scenario, you'd map statusFilter ID to "open"/"solved" based on status metadata
      statusFilter = "all"; // TODO: Map statusFilter ID to open/solved
    }

    let readFilter: "all" | "read" | "unread" = "all";
    if (filters.readFilter === "unread") {
      readFilter = "unread";
    } else if (filters.readFilter === "read") {
      readFilter = "read";
    }

    return {
      query,
      statusFilter,
      readFilter,
    };
  });

  // Search query hook
  const searchResults = useSearchTickets(searchParamsForQuery);

  // Update URL when search query changes
  createEffect(() => {
    const query = searchQuery();
    setSearchParams({
      ...searchParams,
      q: query || undefined, // Remove param if empty
    });
  });

  // TODO: Re-enable WebSocket connection logging after refactoring
  // createEffect(() => {
  //   console.log("[TicketsPage] WebSocket connected:", isConnected());
  // });

  // Log notification WebSocket connection status
  createEffect(() => {
    console.log("[TicketsPage] Notification WebSocket connected:", notificationWs.isConnected());
  });

  // TanStack Query for fetching ALL tickets with client-side filtering
  const ticketsQuery = useAllUserTickets(currentFilters);

  // TanStack Query mutation for creating tickets
  const createTicketMutation = useCreateTicket();

  // Cache updater for WebSocket messages
  const updateTicketInCache = useUpdateTicketInCache();

  // Delayed skeleton state - only show skeleton if loading takes > 300ms
  // This prevents flashing skeleton when data loads quickly from cache
  const [showSkeleton, setShowSkeleton] = createSignal(false);
  let skeletonTimer: ReturnType<typeof setTimeout> | null = null;

  // Track loading state with delay to prevent flash
  createEffect(() => {
    if (ticketsQuery.isLoading) {
      // Start timer - show skeleton only if loading takes > 300ms
      skeletonTimer = setTimeout(() => {
        setShowSkeleton(true);
      }, 300);
    } else {
      // Clear timer and hide skeleton when done loading
      if (skeletonTimer) {
        clearTimeout(skeletonTimer);
        skeletonTimer = null;
      }
      setShowSkeleton(false);
    }
  });

  onCleanup(() => {
    if (skeletonTimer) {
      clearTimeout(skeletonTimer);
    }
  });

  // Extract data from transformed query response
  const allTicketListItems = () => ticketsQuery.data?.ticketListItems ?? [];
  const requestStatuses = () => ticketsQuery.data?.requestStatuses ?? [];
  const totalCount = () => ticketsQuery.data?.totalCount ?? 0;
  const filteredTotalCount = () => ticketsQuery.data?.filteredTotalCount ?? 0;
  const unreadCount = () => ticketsQuery.data?.unreadCount ?? 0;

  // DEBUG: Log unreadCount changes
  createEffect(() => {
    const count = unreadCount();
    const isLoading = ticketsQuery.isLoading;
    const isFetching = ticketsQuery.isFetching;
    console.log(`[TicketsPage] 📊 UNREAD COUNT CHANGED: ${count}`, {
      isLoading,
      isFetching,
      ticketCount: allTicketListItems().length,
      timestamp: new Date().toISOString(),
    });
  });

  // Use search results when search is active, otherwise use all tickets
  const ticketListItems = () => {
    if (isSearchActive() && searchResults.ticketListItems.length > 0) {
      return searchResults.ticketListItems;
    }
    if (isSearchActive()) {
      // Search is active but no results yet (or empty results)
      return searchResults.ticketListItems;
    }
    return allTicketListItems();
  };

  // Loading state considers both queries
  const isSearchLoading = () => isSearchActive() && (searchResults.isLoading || searchResults.isFetching);

  // Request notification permission on mount
  onMount(async () => {
    await requestNotificationPermission();
  });

  // NOTE: Notification handling for cache updates (incrementUnread, lastMessage, etc.)
  // is now handled EXCLUSIVELY by FloatingIconSync component, which is always mounted.
  // This prevents the issue where tickets.tsx would unmount when viewing a chat,
  // causing new messages to not increment the unread count.
  //
  // See: src/components/floating-icon-sync.tsx handleNewMessageNotification()

  // Handle filter change - update URL without triggering fetch
  const handleFilterChange = (filters: TicketFilterParams) => {
    setSearchParams({
      status_filter: filters.statusFilter?.toString() ?? "",
      read_filter: filters.readFilter ?? "",
    });
  };

  // Handle ticket selection - navigate to chat
  // Extended signature to support deep linking from search results
  const handleSelectTicket = (ticket: TicketListItem & { matchedMessageId?: string }) => {
    // Mark as read in cache (optimistic UI update)
    updateTicketInCache(ticket.id, { unreadCount: 0, chatStatus: "read" });

    // Navigate to chat, preserving current filters
    const filters = currentFilters();

    // Build URL with optional deep link params
    let url = `/tickets/${ticket.id}/chat?status_filter=${filters.statusFilter ?? ""}&read_filter=${filters.readFilter ?? ""}`;

    // Add message ID for deep linking if coming from search
    if (ticket.matchedMessageId) {
      url += `&messageId=${ticket.matchedMessageId}&highlight=true`;
    }

    navigate(url);
  };

  // Handle new request submission
  const handleCreateRequest = async (title: string, requestTypeId?: number) => {
    try {
      const result = await createTicketMutation.mutateAsync({
        title,
        requestTypeId
      });
      if (result) {
        setShowNewRequestModal(false);
        // Navigate to the new ticket's chat
        navigate(`/tickets/${result.id}/chat`);
      }
    } catch (err) {
      console.error("Failed to create ticket:", err);
    }
  };

  // Error message extraction
  const errorMessage = () => {
    const error = ticketsQuery.error;
    return error instanceof Error ? error.message : error ? String(error) : null;
  };

  const mutationError = () => {
    const error = createTicketMutation.error;
    return error instanceof Error ? error.message : null;
  };

  return (
    <ChatLayout
      variant="single"
      filterBar={
        <>
          {/* Search Input */}
          <SearchInput
            value={searchQuery()}
            onSearch={setSearchQuery}
            isLoading={isSearchLoading()}
            class="mb-3"
          />

          {/* Filter Bar - hide when search is active for cleaner UI */}
          <Show when={!isSearchActive() && requestStatuses().length > 0}>
            <FilterBar
              requestStatuses={requestStatuses()}
              currentFilters={currentFilters()}
              totalCount={totalCount()}
              filteredTotalCount={filteredTotalCount()}
              unreadCount={unreadCount()}
              isLoading={ticketsQuery.isFetching && !ticketsQuery.isLoading}
              onFilterChange={handleFilterChange}
            />
          </Show>

          {/* Search results summary */}
          <Show when={isSearchActive() && searchResults.data}>
            <div class="text-sm text-muted-foreground mt-2">
              {searchResults.data!.total === 0
                ? "No results found"
                : `${searchResults.data!.total} result${searchResults.data!.total === 1 ? "" : "s"} found`}
            </div>
          </Show>
        </>
      }
    >
      {/* Error banner with refresh button */}
      {errorMessage() && (
        <div class="mx-4 mt-4 p-3 rounded-lg flex items-center justify-between gap-2 bg-destructive/10 border border-destructive/20">
          <div class="flex items-center gap-2">
            <svg
              class="h-4 w-4 text-destructive shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span class="text-sm text-destructive">{errorMessage()}</span>
          </div>
          <button
            onClick={() => ticketsQuery.refetch()}
            disabled={ticketsQuery.isFetching}
            class="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-destructive/20 text-destructive hover:bg-destructive/30 focus:outline-none focus:ring-2 focus:ring-destructive/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg
              class={`h-3.5 w-3.5 ${ticketsQuery.isFetching ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {ticketsQuery.isFetching ? 'Retrying...' : 'Retry'}
          </button>
        </div>
      )}

      {/* Chat List - shows skeleton only if loading takes > 300ms (prevents flash) */}
      <ChatList
        tickets={ticketListItems()}
        requestStatuses={requestStatuses()}
        onSelectTicket={handleSelectTicket}
        isLoading={showSkeleton() || isSearchLoading()}
        isSearchMode={isSearchActive()}
      />

      {/* Floating Action Button */}
      <NewRequestFab
        onClick={() => setShowNewRequestModal(true)}
        disabled={createTicketMutation.isPending}
      />

      {/* New Request Modal */}
      <NewRequestModal
        isOpen={showNewRequestModal()}
        onClose={() => setShowNewRequestModal(false)}
        onSubmit={handleCreateRequest}
        isSubmitting={createTicketMutation.isPending}
        error={mutationError()}
      />
    </ChatLayout>
  );
}
