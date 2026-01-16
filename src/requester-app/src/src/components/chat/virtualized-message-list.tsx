/**
 * Virtualized Message List Component for Requester App
 *
 * Uses @tanstack/solid-virtual for efficient rendering of large chat histories.
 * Features:
 * - Dynamic row heights for variable-height messages (text, images, files)
 * - measureElement for accurate height calculation
 * - Overscan of 10 items for smooth scrolling
 * - Scroll position restoration per chat
 * - Paginated IndexedDB reads (100 at a time)
 *
 * T047: Create virtualized message list component
 * T050: Implement scroll position restoration
 * T052: Implement paginated IndexedDB reads
 */

import {
  createSignal,
  createEffect,
  createMemo,
  For,
  Show,
  onMount,
  onCleanup,
  Index,
  Component,
  JSX,
  batch
} from "solid-js";
import { createVirtualizer } from "@tanstack/solid-virtual";
import type { ChatMessage } from "@/types";
import { messageCache } from "@/lib/message-cache";

// ============================================================================
// Types
// ============================================================================

export interface VirtualizedMessageListProps {
  /** Current ticket ID for scroll position tracking */
  ticketId: string;
  /** All messages to display (sorted chronologically) */
  messages: ChatMessage[];
  /** Grouped messages for rendering */
  groupedMessages: [string, ChatMessage[]][];
  /** Current user ID for determining message ownership */
  currentUserId: string | undefined;
  /** Render function for a single message bubble */
  renderMessage: (message: ChatMessage, isOwnMessage: boolean, showSender: boolean, messageIndex: number, dateMessages: ChatMessage[]) => JSX.Element;
  /** Render function for date separator */
  renderDateSeparator: (date: string) => JSX.Element;
  /** Whether list is currently loading more messages */
  isLoadingMore: boolean;
  /** Whether there are more messages to load */
  hasMoreMessages: boolean;
  /** Callback when user scrolls near top to load more */
  onLoadMore: () => void;
  /** Optional: Estimated row height for initialization */
  estimatedRowHeight?: number;
  /** Optional: Overscan count (items rendered outside viewport) */
  overscan?: number;
}

// ============================================================================
// Constants
// ============================================================================

// Estimated heights for different message types (in pixels)
const ESTIMATED_HEIGHTS = {
  textMessage: 60,          // Average text-only message
  textWithImage: 280,        // Text + screenshot thumbnail
  imageOnly: 250,            // Screenshot only
  fileAttachment: 80,        // File attachment button
  systemMessage: 40,         // Centered system status message
  dateSeparator: 40,         // Date group separator
  padding: 16,              // Container padding
} as const;

// Number of messages to load per chunk from IndexedDB
const PAGINATION_CHUNK_SIZE = 100;

// Scroll position storage key prefix
const SCROLL_POS_KEY_PREFIX = "chat_scroll_pos_";

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Estimate message height based on content type
 */
function estimateMessageHeight(message: ChatMessage): number {
  // System message
  if (message.isSystemMessage || message.senderId === null || message.content.includes("|")) {
    return ESTIMATED_HEIGHTS.systemMessage;
  }

  // Image/screenshot message
  if (message.isScreenshot && message.screenshotFileName) {
    // Text with image vs image only
    const hasExtraText =
      message.content &&
      !message.content.includes("📷") &&
      message.content.trim() !== "Screenshot";
    return hasExtraText
      ? ESTIMATED_HEIGHTS.textWithImage
      : ESTIMATED_HEIGHTS.imageOnly;
  }

  // File attachment
  if (message.fileName && !message.fileMimeType?.startsWith("image/")) {
    return ESTIMATED_HEIGHTS.fileAttachment;
  }

  // Text message - estimate based on content length
  const textLength = message.content?.length || 0;
  const baseHeight = ESTIMATED_HEIGHTS.textMessage;
  const extraLines = Math.floor(textLength / 50); // ~50 chars per line
  return baseHeight + (extraLines * 20); // 20px per extra line
}

/**
 * Flatten grouped messages into a virtual list with metadata
 * Each message item includes its index within the date group and the date group itself
 */
function flattenGroupedMessages(
  groupedMessages: [string, ChatMessage[]][]
): Array<{ type: "separator" | "message"; data: ChatMessage | string; messageIndex?: number; dateMessages?: ChatMessage[] }> {
  const flattened: Array<{ type: "separator" | "message"; data: ChatMessage | string; messageIndex?: number; dateMessages?: ChatMessage[] }> = [];

  for (const [date, dateMessages] of groupedMessages) {
    // Add date separator
    flattened.push({ type: "separator", data: date });

    // Add messages for this date with their index
    for (let i = 0; i < dateMessages.length; i++) {
      flattened.push({
        type: "message",
        data: dateMessages[i],
        messageIndex: i,
        dateMessages: dateMessages
      });
    }
  }

  return flattened;
}

/**
 * Save scroll position to sessionStorage
 */
function saveScrollPosition(ticketId: string, scrollTop: number): void {
  try {
    sessionStorage.setItem(`${SCROLL_POS_KEY_PREFIX}${ticketId}`, String(scrollTop));
  } catch (error) {
    console.warn("[VirtualizedList] Failed to save scroll position:", error);
  }
}

/**
 * Load scroll position from sessionStorage
 */
function loadScrollPosition(ticketId: string): number {
  try {
    const saved = sessionStorage.getItem(`${SCROLL_POS_KEY_PREFIX}${ticketId}`);
    return saved ? parseInt(saved, 10) : -1;
  } catch (error) {
    console.warn("[VirtualizedList] Failed to load scroll position:", error);
    return -1;
  }
}

/**
 * Clear scroll position for a ticket
 */
function clearScrollPosition(ticketId: string): void {
  try {
    sessionStorage.removeItem(`${SCROLL_POS_KEY_PREFIX}${ticketId}`);
  } catch (error) {
    console.warn("[VirtualizedList] Failed to clear scroll position:", error);
  }
}

// ============================================================================
// Main Component
// ============================================================================

export const VirtualizedMessageList: Component<VirtualizedMessageListProps> = (props) => {
  // Parent container ref
  let parentRef: HTMLDivElement | undefined;

  // Track whether we've restored scroll position
  const [scrollPositionRestored, setScrollPositionRestored] = createSignal(false);

  // Flatten messages for virtual list
  const virtualItems = createMemo(() =>
    flattenGroupedMessages(props.groupedMessages)
  );

  // Estimate total list height for scroll restoration
  const estimatedTotalHeight = createMemo(() => {
    return virtualItems().reduce((total, item) => {
      if (item.type === "separator") {
        return total + ESTIMATED_HEIGHTS.dateSeparator;
      }
      return total + estimateMessageHeight(item.data as ChatMessage);
    }, 0);
  });

  // Create virtualizer with dynamic measurement support
  const virtualizer = createVirtualizer({
    get count() {
      return virtualItems().length;
    },
    getScrollElement: () => parentRef,
    estimateSize: (index) => {
      const item = virtualItems()[index];
      if (!item) return props.estimatedRowHeight || ESTIMATED_HEIGHTS.textMessage;

      if (item.type === "separator") {
        return ESTIMATED_HEIGHTS.dateSeparator;
      }

      return estimateMessageHeight(item.data as ChatMessage);
    },
    overscan: props.overscan ?? 10,
    // Enable dynamic resizing for accurate measurements
    measureElement: (element) => {
      // TanStack Solid Virtual will call this to measure actual rendered size
      return element?.getBoundingClientRect().height ?? 0;
    },
  });

  // ============================================================================
  // Scroll Position Restoration (T050)
  // ============================================================================

  // Track last ticket ID to detect changes
  let lastTicketId = props.ticketId;

  // Reset restoration state when ticket changes
  createEffect(() => {
    const currentTicketId = props.ticketId;
    if (currentTicketId !== lastTicketId) {
      lastTicketId = currentTicketId;
      setScrollPositionRestored(false);
    }
  });

  // Restore scroll position when messages load
  createEffect(() => {
    const items = virtualItems();
    const restored = scrollPositionRestored();
    const ticketId = props.ticketId;

    // Only restore once per ticket session when we have items
    if (!restored && items.length > 0 && parentRef) {
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        if (!parentRef) return;

        const savedScrollTop = loadScrollPosition(ticketId);

        // If we have a saved position
        if (savedScrollTop >= 0) {
          // Check if saved position is still valid (not beyond content)
          if (savedScrollTop <= parentRef.scrollHeight) {
            parentRef.scrollTop = savedScrollTop;
          } else {
            // Content shrank, scroll to bottom
            parentRef.scrollTop = parentRef.scrollHeight;
          }
        } else {
          // No saved position - scroll to bottom for new chat
          parentRef.scrollTop = parentRef.scrollHeight;
        }

        setScrollPositionRestored(true);
      });
    }
  });

  // Save scroll position periodically and on unmount
  const saveCurrentScrollPosition = () => {
    if (parentRef && props.ticketId) {
      saveScrollPosition(props.ticketId, parentRef.scrollTop);
    }
  };

  // Save on unmount
  onCleanup(saveCurrentScrollPosition);

  // Also save periodically (every 2 seconds) in case of crashes
  const saveInterval = setInterval(saveCurrentScrollPosition, 2000);
  onCleanup(() => clearInterval(saveInterval));

  // ============================================================================
  // Load More on Scroll (T052)
  // ============================================================================

  // Handle scroll events for loading more messages
  const handleScroll = () => {
    if (!parentRef) return;

    // Save scroll position periodically
    saveScrollPosition(props.ticketId, parentRef.scrollTop);

    // Check if user scrolled near top (within 200px)
    const shouldLoadMore =
      props.hasMoreMessages &&
      !props.isLoadingMore &&
      parentRef.scrollTop < 200;

    if (shouldLoadMore) {
      props.onLoadMore();
    }
  };

  // ============================================================================
  // Dynamic Row Height Measurement (T047)
  // ============================================================================

  // Use Index for better performance with large lists
  // Each item will be measured after render for accurate virtualization

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div
      ref={parentRef}
      class="flex-1 relative overflow-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-transparent hover:scrollbar-thumb-foreground/20 active:scrollbar-thumb-foreground/30 scrollbar-thumb-rounded-full"
      style={{
        "overflow-anchor": "auto",
        height: "100%",
      }}
      onScroll={handleScroll}
      data-testid="virtualized-message-list"
    >
      {/* Load more indicator at top */}
      <Show when={props.hasMoreMessages}>
        <div
          class="flex justify-center p-4 bg-background/50 backdrop-blur-sm sticky top-0 z-10"
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: "relative",
          }}
        >
          <Show when={props.isLoadingMore}>
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <div class="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
              Loading more messages...
            </div>
          </Show>
        </div>
      </Show>

      {/* Virtual list container */}
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        <Index each={virtualizer.getVirtualItems()}>
          {(virtualRow) => {
            const row = virtualRow();
            const item = virtualItems()[row.index];

            if (!item) return null;

            // Render separator (date)
            if (item.type === "separator") {
              return (
                <div
                  data-index={row.index}
                  // Use the measureRef from TanStack Solid Virtual for dynamic sizing
                  ref={row.measureRef}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${row.start}px)`,
                  }}
                >
                  {props.renderDateSeparator(item.data as string)}
                </div>
              );
            }

            // Render message
            const message = item.data as ChatMessage;
            const isOwnMessage = message.senderId === props.currentUserId;

            // Determine if we should show sender name
            const msgIndex = item.messageIndex ?? 0;
            const dateMsgs = item.dateMessages ?? [];
            const showSender = !isOwnMessage && (msgIndex === 0 || dateMsgs[msgIndex - 1]?.senderId !== message.senderId);

            return (
              <div
                data-index={row.index}
                data-message-id={message.id}
                // Use the measureRef from TanStack Solid Virtual for dynamic sizing
                ref={row.measureRef}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${row.start}px)`,
                  padding: "8px 16px",
                }}
              >
                {props.renderMessage(message, isOwnMessage, showSender, msgIndex, dateMsgs)}
              </div>
            );
          }}
        </Index>
      </div>
    </div>
  );
};

// ============================================================================
// Re-exports
// ============================================================================

export {
  estimateMessageHeight,
  flattenGroupedMessages,
  saveScrollPosition,
  loadScrollPosition,
  clearScrollPosition,
  PAGINATION_CHUNK_SIZE,
  ESTIMATED_HEIGHTS,
};
