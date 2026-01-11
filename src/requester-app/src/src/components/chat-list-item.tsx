/**
 * ChatListItem Component - SolidJS version
 *
 * WhatsApp-inspired conversation list item with:
 * - Unread badge indicator
 * - New message highlight animation
 * - Avatar with initials
 * - Timestamp display
 */

import { Show, createSignal, createEffect, onCleanup } from "solid-js";
import { cn } from "@/lib/utils";
import { preloadChatRoute } from "@/lib/route-preloader";
import { usePrefetchMessages } from "@/queries";
import { useLanguage } from "@/context/language-context";
import { parseLastMessage } from "@/lib/system-message";
import { Badge } from "@/components/ui/badge";
import type { TicketListItem, RequestStatus, RequestStatusCount } from "@/types";

interface ChatListItemProps {
  ticket: TicketListItem & { matchedMessageId?: string };
  requestStatuses: RequestStatusCount[];
  onClick: (ticket: TicketListItem & { matchedMessageId?: string }) => void;
  isActive?: boolean;
  /** Whether we're in search mode (showing search results) */
  isSearchMode?: boolean;
  /** Where the match was found: subject, message, or both */
  matchType?: "subject" | "message" | "both";
  /** Excerpt from the matched message with context */
  matchedMessageExcerpt?: string;
}

/**
 * Generate avatar initials from ticket title
 */
function getAvatarInitials(title: string): string {
  return title
    .split(" ")
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Format timestamp for chat list - WhatsApp style
 * Converts UTC timestamps to local timezone for display
 */
function formatChatTimestamp(dateString?: string): string {
  if (!dateString) return "";

  // Normalize timestamp: assume UTC if no timezone specified
  let normalizedDateString = dateString;
  if (!dateString.endsWith('Z') && !dateString.includes('+') && !dateString.includes('-', 10)) {
    normalizedDateString = dateString + 'Z';
  }

  const date = new Date(normalizedDateString);
  if (isNaN(date.getTime())) return "";

  const now = new Date();
  const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

  if (diffInHours < 24) {
    // Within 24 hours: show time in HH:MM format (local timezone)
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } else {
    // Older than 24 hours: show date (local timezone)
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }
}

/**
 * Get avatar background color based on title hash
 * Uses theme-aware avatar colors that adapt to light/dark mode
 */
function getAvatarColor(title: string): string {
  const colors = [
    "avatar-red",
    "avatar-blue",
    "avatar-green",
    "avatar-yellow",
    "avatar-purple",
    "avatar-pink",
    "avatar-indigo",
    "avatar-teal",
  ];

  const hash = title.split("").reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);

  return colors[Math.abs(hash) % colors.length];
}

/**
 * Map database color names to CSS colors
 */
function mapStatusColor(color?: string): string {
  if (!color) return "#8B6F47"; // Default brown color

  const colorMap: Record<string, string> = {
    yellow: "#EAB308",
    blue: "#3B82F6",
    green: "#22C55E",
    red: "#EF4444",
    orange: "#F97316",
    purple: "#A855F7",
    pink: "#EC4899",
    gray: "#6B7280",
    grey: "#6B7280",
    indigo: "#6366F1",
    teal: "#14B8A6",
    cyan: "#06B6D4",
  };

  return colorMap[color.toLowerCase()] || color;
}

/**
 * Get status display name and color by looking up statusId in requestStatuses array
 */
function getStatusInfo(
  statusId: number,
  requestStatuses: RequestStatusCount[],
  language: string
): { name: string; color?: string } {
  const status = requestStatuses.find((s) => s.id === statusId);
  if (!status) {
    return { name: "Unknown", color: undefined };
  }
  return {
    name: language === "ar" ? status.nameAr : status.nameEn,
    color: status.color,
  };
}

export function ChatListItem(props: ChatListItemProps) {
  const { language, t } = useLanguage();
  const hasUnread = () => props.ticket.unreadCount > 0;
  const initials = () => getAvatarInitials(props.ticket.subject);
  const avatarColor = () => getAvatarColor(props.ticket.subject);
  const timestamp = () => {
    // Use request creation time, not last message time
    const createdAt = props.ticket.createdAt;
    return formatChatTimestamp(
      typeof createdAt === 'string' ? createdAt : createdAt?.toISOString()
    );
  };

  // Parse last message with technician name replacement
  const displayMessage = () => {
    // In search mode with message match, show the excerpt
    if (props.isSearchMode && props.matchedMessageExcerpt) {
      return props.matchedMessageExcerpt;
    }

    const msg = props.ticket.lastMessage;
    if (!msg) return "";
    return parseLastMessage(
      msg,
      language(),
      props.ticket.technicianName,
      t("chat.supportAgent")
    );
  };

  // Get match type label for search results
  const matchTypeLabel = () => {
    if (!props.isSearchMode || !props.matchType) return null;
    if (props.matchType === "both") return t("search.matchInSubject") + " & " + t("search.matchInMessage");
    if (props.matchType === "subject") return t("search.matchInSubject");
    if (props.matchType === "message") return t("search.matchInMessage");
    return null;
  };

  // Prefetch messages on hover for instant navigation
  const prefetchMessages = usePrefetchMessages();

  // Track new message highlight
  const [isNewMessage, setIsNewMessage] = createSignal(false);
  const [prevUnreadCount, setPrevUnreadCount] = createSignal(props.ticket.unreadCount);

  // Detect new message by tracking unreadCount changes
  createEffect(() => {
    const currentUnread = props.ticket.unreadCount;
    const previous = prevUnreadCount();

    // If unread count decreased (marked as read), clear highlight immediately
    if (currentUnread < previous) {
      setPrevUnreadCount(currentUnread);
      setIsNewMessage(false);
      return;
    }

    if (currentUnread > previous && currentUnread > 0) {
      // New message arrived - trigger highlight animation
      setIsNewMessage(true);

      // Remove highlight after 2 seconds
      const timeout = setTimeout(() => {
        setIsNewMessage(false);
      }, 2000);

      onCleanup(() => clearTimeout(timeout));
    }

    setPrevUnreadCount(currentUnread);
  });

  return (
    <div
      onClick={() => props.onClick(props.ticket)}
      onMouseEnter={() => {
        // Preload route chunk + prefetch messages for instant navigation
        preloadChatRoute();
        prefetchMessages(props.ticket.id);
      }}
      class={cn(
        "flex items-center py-3 px-4 cursor-pointer transition-all duration-200 hover:bg-secondary/50 relative",
        props.isActive && "bg-secondary/50 border-s-4 border-accent",
        // Unread message background
        !props.isActive && hasUnread() && "bg-warning/10",
        // New message highlight animation
        isNewMessage() && "animate-pulse bg-accent/10 border-s-4 border-accent"
      )}
    >
      {/* Avatar */}
      <div
        class={cn(
          "w-12 h-12 rounded-full flex items-center justify-center text-white font-medium text-sm me-3 shadow-sm",
          avatarColor()
        )}
      >
        {initials()}
      </div>

      {/* Content - Two column layout */}
      <div class="flex-1 min-w-0 flex gap-2">
        {/* Left block: Title + Last message */}
        <div class="flex-1 min-w-0 flex flex-col gap-1">
          <h3
            class={cn(
              "font-medium truncate text-sm",
              hasUnread() ? "text-foreground font-bold" : "text-foreground/90"
            )}
          >
            {props.ticket.subject}
          </h3>
          <div class="flex items-center gap-2">
            <p
              class={cn(
                "text-sm text-muted-foreground truncate flex-1",
                props.isSearchMode && props.matchedMessageExcerpt && "italic"
              )}
            >
              {displayMessage() || "No messages yet"}
            </p>
            {/* Unread count badge - WhatsApp style */}
            <Show when={hasUnread()}>
              <span class="bg-accent text-accent-foreground text-xs font-bold px-2 py-0.5 rounded-full min-w-[18px] h-[18px] text-center flex-shrink-0 shadow-sm flex items-center justify-center">
                {props.ticket.unreadCount > 99 ? "99+" : props.ticket.unreadCount}
              </span>
            </Show>
          </div>
          {/* Match type indicator for search results */}
          <Show when={matchTypeLabel()}>
            <span class="text-xs text-accent mt-0.5 block">
              {matchTypeLabel()}
            </span>
          </Show>
        </div>

        {/* Right block: Timestamp + Status badge */}
        <div class="flex flex-col items-end gap-1 flex-shrink-0">
          {/* Timestamp */}
          <span class="text-xs text-muted-foreground whitespace-nowrap">{timestamp()}</span>
          {/* Status Badge */}
          <Show when={props.ticket.statusId !== undefined}>
            {(() => {
              const statusInfo = getStatusInfo(
                props.ticket.statusId,
                props.requestStatuses,
                language()
              );
              return (
                <Badge
                  class="text-xs px-2 py-0.5 border-none"
                  style={{
                    "background-color": mapStatusColor(statusInfo.color),
                    color: "#fff",
                  }}
                >
                  {statusInfo.name}
                </Badge>
              );
            })()}
          </Show>
        </div>
      </div>
    </div>
  );
}

export default ChatListItem;
