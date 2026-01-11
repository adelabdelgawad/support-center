/**
 * ChatList Component - SolidJS version
 *
 * WhatsApp-style chat list container with infinite scroll support
 */

import { Show, For, onMount, onCleanup, createSignal } from "solid-js";
import { Inbox, Loader2 } from "lucide-solid";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatListItem } from "./chat-list-item";
import { useLanguage } from "@/context/language-context";
import type { TicketListItem, RequestStatusCount } from "@/types";

interface ChatListProps {
  tickets: (TicketListItem & {
    matchType?: "subject" | "message" | "both";
    matchedMessageId?: string;
    matchedMessageExcerpt?: string;
  })[];
  requestStatuses: RequestStatusCount[];
  onSelectTicket: (ticket: TicketListItem & { matchedMessageId?: string }) => void;
  activeTicketId?: string;
  isLoading?: boolean;
  isFetchingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  totalCount?: number;
  /** Whether we're in search mode (showing search results) */
  isSearchMode?: boolean;
}

/**
 * Empty state for when no chats are available
 */
function EmptyState() {
  return (
    <div class="flex flex-col items-center justify-center h-full p-8 text-center bg-card">
      <div class="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
        <Inbox class="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 class="text-lg font-medium mb-2 text-foreground">No Conversations</h3>
      <p class="text-sm text-muted-foreground max-w-xs">
        You don't have any support conversations yet. Create a new request to get started.
      </p>
    </div>
  );
}

/**
 * Loading skeleton for chat list
 */
function LoadingSkeleton() {
  return (
    <div class="space-y-1 bg-card">
      <For each={[1, 2, 3, 4, 5]}>
        {(_) => (
          <div class="flex items-center p-4 animate-pulse border-b border-border">
            {/* Avatar skeleton */}
            <div class="w-12 h-12 rounded-full bg-secondary me-3" />

            {/* Content skeleton */}
            <div class="flex-1">
              <div class="flex justify-between items-center mb-2">
                <div class="h-4 bg-secondary rounded w-2/3" />
                <div class="h-3 bg-secondary rounded w-12" />
              </div>
              <div class="h-3 bg-secondary rounded w-3/4" />
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

/**
 * Loading indicator for fetching more tickets
 */
function LoadMoreIndicator() {
  const { language } = useLanguage();
  const text = language() === "ar" ? "جاري تحميل المزيد..." : "Loading more tickets...";

  return (
    <div class="flex items-center justify-center py-4 bg-card">
      <Loader2 class="h-5 w-5 animate-spin text-accent" />
      <span class="ms-2 text-sm text-foreground">{text}</span>
    </div>
  );
}

/**
 * Main ChatList component
 */
export function ChatList(props: ChatListProps) {
  const { language } = useLanguage();
  let loadMoreTrigger: HTMLDivElement | undefined;
  const [observer, setObserver] = createSignal<IntersectionObserver | null>(null);

  // Set up Intersection Observer for infinite scroll
  onMount(() => {
    if (!loadMoreTrigger || !props.onLoadMore) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        // Trigger load more when the element is visible and we have more data
        if (entry.isIntersecting && props.hasMore && !props.isFetchingMore) {
          props.onLoadMore?.();
        }
      },
      {
        root: null, // Use viewport as root
        rootMargin: "200px", // Trigger 200px before reaching the element
        threshold: 0.1,
      }
    );

    obs.observe(loadMoreTrigger);
    setObserver(obs);
  });

  // Cleanup observer
  onCleanup(() => {
    const obs = observer();
    if (obs) {
      obs.disconnect();
    }
  });

  return (
    <div class="h-full">
      <Show
        when={!props.isLoading}
        fallback={<LoadingSkeleton />}
      >
        <Show
          when={props.tickets.length > 0}
          fallback={<EmptyState />}
        >
          <ScrollArea class="h-full w-full bg-card">
          <div class="divide-y divide-border">
            <For each={props.tickets}>
              {(ticket) => (
                <ChatListItem
                  ticket={ticket}
                  requestStatuses={props.requestStatuses}
                  onClick={props.onSelectTicket}
                  isActive={ticket.id === props.activeTicketId}
                  isSearchMode={props.isSearchMode}
                  matchType={ticket.matchType}
                  matchedMessageExcerpt={ticket.matchedMessageExcerpt}
                />
              )}
            </For>

            {/* Load more trigger for infinite scroll */}
            <Show when={props.hasMore}>
              <div ref={loadMoreTrigger} class="h-1" />
              <Show when={props.isFetchingMore}>
                <LoadMoreIndicator />
              </Show>
            </Show>

            {/* Show total count */}
            <Show when={!props.hasMore && props.totalCount !== undefined && props.tickets.length > 0}>
              <div class="py-4 text-center text-sm text-muted-foreground bg-secondary/50">
                {language() === "ar"
                  ? `عرض جميع ${props.totalCount} طلب`
                  : `Showing all ${props.totalCount} ticket${props.totalCount !== 1 ? 's' : ''}`
                }
              </div>
            </Show>
          </div>
        </ScrollArea>
      </Show>
    </Show>
    </div>
  );
}

export default ChatList;
