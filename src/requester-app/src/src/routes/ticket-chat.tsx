/**
 * Chat Route - Real-time chat for a specific ticket
 *
 * SolidJS version with:
 * - TanStack Solid Query for messages
 * - WebSocket for real-time updates
 * - File attachments and screenshot capture
 */

import { createSignal, createEffect, createMemo, onCleanup, Show, For, createResource, untrack } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import { useUser } from "@/stores";
import { authStore } from "@/stores/auth-store";
import { useLanguage } from "@/context/language-context";
import { useNotification } from "@/context/notification-context";
import { useNotificationSignalR } from "@/signalr";
// PHASE 3: Image providers are now lazy-loaded via LazyImageProviders wrapper
import { useImageViewer } from "@/context/image-viewer-context";
import { useImageCache } from "@/context/image-cache-context";
import { LazyImageProviders } from "@/context/lazy-image-providers";
import { useUpdateTicketInCache, useTicketFromCache, useTicketDetail, useTicketMessagesCursor } from "@/queries";
import type { GetMessagesCursorResponse } from "@/api/messages";
import { sendMessage as sendMessageApi, markMessagesAsRead, getMessagesCursor } from "@/api/messages";
import { useRealTimeChatRoom } from "@/signalr";
import { useChatMutations } from "@/hooks/use-chat-mutations";
import { refreshUnreadCountFromAPI } from "@/lib/floating-icon-manager";
import { messageCache } from "@/lib/message-cache";
import { ImageViewer } from "@/components/image-viewer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";

/**
 * Messages skeleton - shows placeholder message bubbles while loading
 * Better perceived performance than a centered spinner
 */
function MessagesSkeleton() {
  return (
    <div class="flex-1 p-4 space-y-4 animate-pulse">
      {/* Incoming message skeleton */}
      <div class="flex justify-start">
        <div class="max-w-[75%] rounded-2xl rounded-bl-sm bg-secondary/60 p-3">
          <div class="h-3 w-32 bg-secondary rounded mb-2" />
          <div class="h-3 w-48 bg-secondary rounded" />
        </div>
      </div>
      {/* Outgoing message skeleton */}
      <div class="flex justify-end">
        <div class="max-w-[75%] rounded-2xl rounded-br-sm bg-primary/20 p-3">
          <div class="h-3 w-40 bg-primary/30 rounded mb-2" />
          <div class="h-3 w-24 bg-primary/30 rounded" />
        </div>
      </div>
      {/* Another incoming */}
      <div class="flex justify-start">
        <div class="max-w-[75%] rounded-2xl rounded-bl-sm bg-secondary/60 p-3">
          <div class="h-3 w-56 bg-secondary rounded" />
        </div>
      </div>
      {/* Another outgoing */}
      <div class="flex justify-end">
        <div class="max-w-[75%] rounded-2xl rounded-br-sm bg-primary/20 p-3">
          <div class="h-3 w-36 bg-primary/30 rounded mb-2" />
          <div class="h-3 w-52 bg-primary/30 rounded mb-2" />
          <div class="h-3 w-20 bg-primary/30 rounded" />
        </div>
      </div>
    </div>
  );
}
import { formatDateTime, cn } from "@/lib/utils";
import { preloadTicketsRoute } from "@/lib/route-preloader";
import { ArrowLeft, Send, Wifi, WifiOff, Camera, X, Image, Clock, ArrowDown, FileText, Download } from "lucide-solid";
import type { ChatMessage } from "@/types";
import { invoke } from "@tauri-apps/api/core";
import { RuntimeConfig } from "@/lib/runtime-config";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

// ============================================================================
// Date Separator Component
// ============================================================================
function DateSeparator(props: { date: string }) {
  const { language } = useLanguage();
  return (
    <div class="flex justify-center my-4">
      <div class="bg-secondary text-muted-foreground text-xs px-3 py-1 rounded-full" dir={language() === "ar" ? "rtl" : "ltr"}>
        {props.date}
      </div>
    </div>
  );
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format file size in bytes to human-readable string
 */
function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

/**
 * Check if MIME type is an image type
 */
function isImageMimeType(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false;
  return mimeType.startsWith("image/");
}

// ============================================================================
// Message Bubble Component
// ============================================================================
function MessageBubble(props: {
  message: ChatMessage;
  isOwnMessage: boolean;
  showSender?: boolean;
  onImageClick?: () => void;
  onBlobUrlReady?: (messageId: string, blobUrl: string) => void;
  onImageLoad?: (messageId: string) => void;
  onImageLoadStart?: (messageId: string) => void;
  onRetry?: (tempId: string) => void;
  // FIX: Accept initial dimensions from parent to survive component re-creation
  initialImageDimensions?: { width: number; height: number } | null;
  onImageDimensionsStored?: (messageId: string, dimensions: { width: number; height: number }) => void;
}) {
  const { language } = useLanguage();
  const imageCache = useImageCache();
  const [imageError, setImageError] = createSignal(false);

  // FIX: Preserve image dimensions to prevent layout shift on re-render
  // When the component re-renders due to message list changes, the image
  // may briefly lose its dimensions causing scroll position to jump
  // Initialize from parent's persisted dimensions if available
  const [imageDimensions, setImageDimensions] = createSignal<{ width: number; height: number } | null>(
    props.initialImageDimensions ?? null
  );

  // Detect if this is a system message (explicit flag, senderId is null, OR content includes '|')
  const isSystemMessage = () => {
    // Check explicit flag from backend first
    if (props.message.isSystemMessage) return true;

    const hasPipe = props.message.content.includes("|");
    const noSender = props.message.senderId === null;
    const isSystem = noSender || hasPipe;

    return isSystem;
  };

  // Track if we've notified about image loading start
  const [hasNotifiedLoadStart, setHasNotifiedLoadStart] = createSignal(false);

  // Use createResource for reactive image loading with global cache
  // This automatically handles loading/error states and caching
  const [imageBlobUrl] = createResource(
    () => {
      // Only fetch if this is a screenshot with a filename
      if (props.message.isScreenshot && props.message.screenshotFileName) {
        return props.message.screenshotFileName;
      }
      return null;
    },
    async (filename) => {
      if (!filename) return null;

      // Notify parent that image loading started (only once)
      if (!hasNotifiedLoadStart()) {
        props.onImageLoadStart?.(props.message.id);
        setHasNotifiedLoadStart(true);
      }

      try {
        // Get image URL from cache (will fetch if not cached)
        const blobUrl = await imageCache.getImageUrl(filename);

        // Notify parent that blob URL is ready (for image viewer)
        props.onBlobUrlReady?.(props.message.id, blobUrl);

        return blobUrl;
      } catch (error) {
        console.error(`[MessageBubble] Failed to load image: ${filename}`, error);
        setImageError(true);
        return null;
      }
    }
  );

  // Generate external URL for opening in new tab
  const externalUrl = () => {
    if (!props.message.screenshotFileName) return null;
    const token = authStore.state.token;
    const apiUrl = RuntimeConfig.getServerAddress();
    return `${apiUrl}/screenshots/by-filename/${props.message.screenshotFileName}?token=${token}`;
  };

  // Check if this message has a file attachment (non-image)
  const hasFileAttachment = () => {
    // Has fileName but is NOT an image MIME type
    return props.message.fileName && !isImageMimeType(props.message.fileMimeType);
  };

  // Generate download URL for file attachment
  const fileDownloadUrl = () => {
    if (!props.message.fileName) return null;
    const token = authStore.state.token;
    const apiUrl = RuntimeConfig.getServerAddress();
    // Use the stored filename (which includes the unique prefix) for download
    return `${apiUrl}/chat-files/by-filename/${encodeURIComponent(props.message.fileName)}?token=${token}`;
  };

  // Handle file download
  const handleFileDownload = async () => {
    const url = fileDownloadUrl();
    if (!url) return;

    try {
      // Open download URL in system browser or trigger download
      window.open(url, '_blank');
    } catch (error) {
      console.error('[MessageBubble] Failed to download file:', error);
    }
  };

  // Render system message
  const renderSystemMessage = () => {
    const parsedContent = parseSystemMessage(props.message.content, language());
    return (
      <div class="flex justify-center my-4">
        <div class="bg-accent/10 dark:bg-accent/20 border border-accent/20 dark:border-accent/30 text-accent dark:text-accent-foreground text-xs px-3 py-2 rounded-full max-w-[75%] text-center">
          {parsedContent}
        </div>
      </div>
    );
  };

  // Render regular message
  const renderRegularMessage = () => {
    return (
      <div
        class={cn(
          "flex flex-col gap-1 mb-2 w-full",
          props.isOwnMessage ? "items-end" : "items-start"
        )}
        dir="ltr"
      >
        {/* Sender name for messages from others */}
        <Show when={!props.isOwnMessage && props.showSender}>
          <span class="text-xs font-medium text-muted-foreground px-3 mb-1">
            {/* Show actual sender name for all messages */}
            {props.message.sender?.fullName || props.message.sender?.username || "Unknown"}
            <Show when={props.message.sender?.isTechnician}>
              <Badge variant="outline" class="ms-2 text-[10px] border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400">
                {useLanguage().t("chat.support")}
              </Badge>
            </Show>
          </span>
        </Show>

        {/* Message bubble */}
        <div
          class={cn(
            "max-w-[75%] rounded-lg px-3 py-2 relative shadow-sm",
            props.isOwnMessage
              ? "bg-chat-own-message text-foreground rounded-br-sm"
              : "bg-chat-other-message text-foreground rounded-bl-sm"
          )}
          dir={language() === "ar" ? "rtl" : "ltr"}
        >
        {/* Screenshot thumbnail - Container with stable dimensions to prevent layout shift */}
        <Show when={props.message.isScreenshot}>
          {/* FIX: Wrapper with stable dimensions - uses persisted dimensions or default 200x150 */}
          {/* This ensures placeholder and image have SAME size, preventing scroll jump */}
          <div
            style={{
              width: imageDimensions()
                ? `${Math.min(imageDimensions()!.width, 200)}px`
                : "200px",
              height: imageDimensions()
                ? `${Math.round(imageDimensions()!.height * (Math.min(imageDimensions()!.width, 200) / imageDimensions()!.width))}px`
                : "150px",
            }}
            class="relative overflow-hidden rounded bg-muted"
          >
            <Show when={imageBlobUrl() && !imageError()} fallback={
              <Show when={!imageError()} fallback={
                <div class="flex items-center justify-center gap-2 text-sm text-muted-foreground w-full h-full">
                  <Image class="h-5 w-5" />
                </div>
              }>
                <div class="flex items-center justify-center w-full h-full">
                  <Spinner size="sm" />
                </div>
              </Show>
            }>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  props.onImageClick?.();
                }}
                class="block hover:opacity-80 transition-opacity w-full h-full"
                type="button"
              >
                <img
                  src={imageBlobUrl()!}
                  alt="Screenshot"
                  class="w-full h-full object-cover rounded cursor-pointer shadow-sm"
                  onError={() => setImageError(true)}
                  onLoad={(e) => {
                    // FIX: Store image dimensions for layout preservation on re-render
                    const img = e.currentTarget;
                    if (img.naturalWidth && img.naturalHeight) {
                      const dims = { width: img.naturalWidth, height: img.naturalHeight };
                      setImageDimensions(dims);
                      // FIX: Notify parent to store dimensions persistently
                      // This survives component re-creation (optimistic→server replacement)
                      props.onImageDimensionsStored?.(props.message.id, dims);
                    }
                    // Notify parent that image has loaded and may have changed height
                    props.onImageLoad?.(props.message.id);
                  }}
                  loading="lazy"
                  decoding="async"
                />
              </button>
            </Show>
          </div>
        </Show>

        {/* File attachment (non-image files from IT agents) */}
        <Show when={hasFileAttachment()}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleFileDownload();
            }}
            class="flex items-center gap-3 p-3 bg-muted/50 hover:bg-muted rounded-lg transition-colors w-full text-left group"
            type="button"
            title={`Download ${props.message.fileName}`}
          >
            {/* File icon */}
            <div class="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText class="h-5 w-5 text-primary" />
            </div>

            {/* File info */}
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-foreground truncate">
                {props.message.fileName}
              </p>
              <p class="text-xs text-muted-foreground">
                {formatFileSize(props.message.fileSize)}
              </p>
            </div>

            {/* Download icon */}
            <div class="flex-shrink-0 opacity-50 group-hover:opacity-100 transition-opacity">
              <Download class="h-4 w-4 text-muted-foreground" />
            </div>
          </button>
        </Show>

        {/* Message text - only show if NOT default screenshot text */}
        <Show when={!props.message.isScreenshot || (props.message.content && !props.message.content.includes("📷") && props.message.content.trim() !== "Screenshot")}>
          <p class="whitespace-pre-wrap break-words text-sm" classList={{ "mt-2": props.message.isScreenshot || !!hasFileAttachment() }}>
            {props.message.content}
          </p>
        </Show>
      </div>

      {/* Timestamp and Status */}
      <div class="flex items-center gap-1 px-1">
        <span class="text-[10px] text-muted-foreground font-normal">
          {formatDateTime(props.message.createdAt)}
        </span>

        {/* Status indicator for own messages only */}
        <Show when={props.isOwnMessage}>
          <Show when={props.message.status === 'pending'}>
            <Clock class="h-3 w-3 text-muted-foreground animate-pulse" title="Sending..." />
          </Show>
          <Show when={props.message.status === 'failed'}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (props.message.tempId && props.onRetry) {
                  // Retry is called - the hook will handle status updates
                  props.onRetry(props.message.tempId);
                }
              }}
              class="text-[10px] text-destructive hover:text-destructive/80 hover:underline cursor-pointer"
              title="Click to retry"
              type="button"
            >
              ↻ Retry
            </button>
          </Show>
        </Show>
      </div>
    </div>
    );
  };

  return (
    <Show when={isSystemMessage()} fallback={renderRegularMessage()}>
      {renderSystemMessage()}
    </Show>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse bilingual format "English|Arabic" and return correct language version
 */
function parseSystemMessage(content: string, language: "en" | "ar"): string {
  const parts = content.split("|");
  if (parts.length === 2) {
    return language === "en" ? parts[0].trim() : parts[1].trim();
  }
  return content;
}

/**
 * Sort messages chronologically (oldest first)
 * Priority: sequenceNumber > createdAt > id
 */
function sortMessages(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((a, b) => {
    // 1. If both have sequence numbers, sort by sequence (ascending = oldest first)
    if (a.sequenceNumber !== undefined && b.sequenceNumber !== undefined) {
      return a.sequenceNumber - b.sequenceNumber;
    }

    // 2. Always fall back to timestamp comparison
    // This ensures correct chronological order regardless of sequence number status
    const dateA = new Date(a.createdAt).getTime();
    const dateB = new Date(b.createdAt).getTime();
    if (dateA !== dateB) {
      return dateA - dateB;
    }

    // 3. Final fallback: compare by ID for stable sort
    return a.id.localeCompare(b.id);
  });
}

// Main chat component (not exported - wrapped below)
function TicketChatPageInner() {
  const params = useParams();
  const navigate = useNavigate();
  const user = useUser();
  const { t, language } = useLanguage();

  const ticketId = () => params.ticketId;

  /**
   * Get localized status name based on active language
   */
  const getTicketStatusName = (): string => {
    const currentTicket = ticket();
    if (!currentTicket?.status) return "";
    // status can be string or RequestStatus object
    if (typeof currentTicket.status === 'string') return currentTicket.status;
    const lang = language();
    return lang === "ar"
      ? currentTicket.status.nameAr || currentTicket.status.name
      : currentTicket.status.nameEn || currentTicket.status.name;
  };

  // Notification system
  const { showNotification } = useNotification();

  // Notification WebSocket for suppressing notifications while viewing this chat
  const notificationWs = useNotificationSignalR();

  // Cache updaters
  const updateTicketInCache = useUpdateTicketInCache();

  // Get ticket from cache for immediate display
  const cachedTicket = useTicketFromCache(ticketId);

  // Fetch ticket details directly (will load if cache is empty)
  const ticketDetailQuery = useTicketDetail(ticketId);

  // Use fetched data if available, otherwise fallback to cache
  const ticket = createMemo(() => {
    // Priority 1: Use fetched ticket data (has full details)
    if (ticketDetailQuery.data) {
      return {
        id: ticketDetailQuery.data.id,
        title: ticketDetailQuery.data.title,
        statusId: ticketDetailQuery.data.statusId,
        status: ticketDetailQuery.data.status,
        statusColor: ticketDetailQuery.data.status?.color,
        // Include countAsSolved from the full status object
        countAsSolved: ticketDetailQuery.data.status?.countAsSolved ?? false,
        technicianName: undefined,
        lastMessage: undefined,
        lastMessageAt: ticketDetailQuery.data.updatedAt,
        unreadCount: 0,
      };
    }

    // Priority 2: Use cached ticket (immediate display while fetching)
    return cachedTicket();
  });

  // Local override for solved state (set immediately when task_status_changed is received)
  // This bypasses cache delay and provides instant UI feedback
  // IMPORTANT: Must be defined BEFORE useRealTimeChatRoom which uses isTicketSolved
  const [forceSolved, setForceSolved] = createSignal(false);

  // Check if ticket is solved (status has countAsSolved = true)
  // IMPORTANT: Must be defined BEFORE useRealTimeChatRoom which uses isTicketSolved
  const isTicketSolved = createMemo(() => {
    // Check local override first (immediate WebSocket update)
    if (forceSolved()) return true;

    const t = ticket();
    if (!t) return false;

    // Check direct countAsSolved field first (available from both cache and API)
    if (t.countAsSolved === true) return true;

    // Fallback: Check status object if it exists and is not a string
    if (t.status && typeof t.status !== 'string') {
      return t.status.countAsSolved ?? false;
    }

    return false;
  });

  // SignalR real-time chat
  const [localMessages, setLocalMessages] = createSignal<ChatMessage[]>([]);
  const [lastSequence, setLastSequence] = createSignal(0);
  const [wsSubscribed, setWsSubscribed] = createSignal(false);

  // Use SignalR chat room hook
  const realTimeChat = useRealTimeChatRoom(() => ticketId(), {
    enabled: !isTicketSolved(),
    onInitialState: (state) => {
      // CRITICAL: Don't override messages if we already have them from HTTP GET
      if (httpMessagesLoaded() && messages().length > 0) {
        setLastSequence(state.latestSequence);
      } else {
        setLocalMessages(state.messages || []);
        setLastSequence(state.latestSequence);
      }

      // Note: Mark-as-read is handled by a dedicated effect that triggers when messages load
      // This prevents duplicate calls and ensures read status is synced via HTTP first

      setWsSubscribed(true);
      setWsConnectedTime(performance.now());
    },
    onNewMessage: (message) => {
      handleNewMessage(message);
    },
    onTaskStatusChanged: (data) => {
      handleTaskStatusChanged(data);
    },
  });

  // Chat mutations hook for HTTP-based message sending
  const chatMutations = useChatMutations({
    requestId: ticketId(),
    currentUserId: user()?.id,
    currentUser: user() ? {
      id: user()!.id,
      username: user()!.username,
      fullName: user()!.fullName,
    } : undefined,
    sendOptimisticMessage: realTimeChat.sendMessage,
    updateMessageStatus: realTimeChat.updateMessageStatus,
    onError: (error) => {
      console.error('[Chat] Message send error:', error.message);
    },
  });

  // OPTIMIZATION: Use a stable merged messages signal
  // Instead of creating a new Map/Array on every access (which caused flicker),
  // we track the merged result in a signal and only update when sources change
  const [mergedMessages, setMergedMessages] = createSignal<ChatMessage[]>([]);

  // Track previous message count to detect new messages vs replacements
  let prevMessageCount = 0;

  // Scroll threshold constant - used in coordinator and handleScroll
  const SCROLL_THRESHOLD = 50;

  // Scroll timeout guard - prevents multiple timeout scheduling
  let scrollTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // ============================================================================
  // SINGLE SCROLL COORDINATOR - All scroll decisions route through here
  // ============================================================================
  // This eliminates multiple independent scroll authorities that caused flicker
  // when images loaded. All scroll triggers now DELEGATE to this coordinator.

  // Source of truth for "is user at bottom" - captured once per scroll event
  const [isAtBottomRef, setIsAtBottomRef] = createSignal(true);

  // Lock to prevent concurrent scroll operations
  let scrollLock = false;

  // Scroll coordinator - the ONLY function that should actually scroll
  // NOTE: 'resize' removed - IT app doesn't have ResizeObserver
  type ScrollReason = 'initial' | 'new-message' | 'image-load' | 'user-click';

  const requestScroll = (
    reason: ScrollReason,
    options: {
      force?: boolean;      // Force scroll regardless of isAtBottom (for initial, user-click)
      smooth?: boolean;     // Use smooth scrolling
      wasAtBottom?: boolean; // Snapshot of isAtBottom at time of event
    } = {}
  ): void => {
    const { force = false, smooth = false, wasAtBottom } = options;
    const container = scrollContainerRef;

    // Guard: no container or scrollHeight not ready
    if (!container || container.scrollHeight === 0) {
      return;
    }

    // Guard: scroll lock active (another scroll in progress)
    if (scrollLock) {
      return;
    }

    // Determine if we should scroll
    const atBottom = wasAtBottom ?? isAtBottomRef();
    const shouldScroll = force || atBottom;

    if (!shouldScroll) {
      return;
    }

    // Acquire lock
    scrollLock = true;
    isScrollingProgrammatically = true;

    // Perform scroll
    if (smooth) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    } else {
      container.scrollTop = container.scrollHeight;
    }

    // Update state
    setIsAtBottomRef(true);
    setIsOnBottom(true);
    setNewMessagesWhileScrolledUp(0);

    // Release lock after scroll completes
    const releaseDelay = smooth ? 300 : 16;
    setTimeout(() => {
      scrollLock = false;
      isScrollingProgrammatically = false;
    }, releaseDelay);
  };

  // Sync merged messages when either source changes
  // This avoids creating new arrays on every messages() access
  // NOTE: This effect only UPDATES DATA - scroll decisions are delegated to coordinator
  createEffect(() => {
    const signalRMsgs = realTimeChat.messages();
    const localMsgs = localMessages();

    // Merge and deduplicate - only run when sources change
    const messageMap = new Map<string, ChatMessage>();
    for (const msg of localMsgs) {
      messageMap.set(msg.id, msg);
    }
    for (const msg of signalRMsgs) {
      messageMap.set(msg.id, msg);
    }

    const newMessages = Array.from(messageMap.values());
    const messageCountChanged = newMessages.length !== prevMessageCount;

    // Check if array actually changed to avoid unnecessary re-renders
    const currentMessages = mergedMessages();
    const hasActualChange = messageCountChanged ||
      newMessages.some((msg, idx) => {
        const current = currentMessages[idx];
        if (!current) return true;
        return current.id !== msg.id ||
               current.status !== msg.status ||
               current.content !== msg.content;
      });

    // Only update if there's an actual change
    if (!hasActualChange) {
      return;
    }

    prevMessageCount = newMessages.length;
    setMergedMessages(newMessages);

    // NOTE: Scroll logic REMOVED from merge effect to match IT app behavior
    // IT app triggers scroll from onNewMessage callback, not from state changes
    // This prevents duplicate scroll triggers
  });

  // Stable reference to messages
  const messages = mergedMessages;

  const setMessages = setLocalMessages;

  // Performance timing - track navigation to ready time
  const [navigationStartTime, setNavigationStartTime] = createSignal<number>(0);
  const [httpGetCompleteTime, setHttpGetCompleteTime] = createSignal<number | null>(null);
  const [wsConnectedTime, setWsConnectedTime] = createSignal<number | null>(null);
  const [cacheLoadTime, setCacheLoadTime] = createSignal<number | null>(null);

  // CACHE-FIRST: Load messages from IndexedDB immediately
  // This provides instant rendering for previously visited chats
  const [cachedMessagesResource] = createResource(
    ticketId,
    async (id) => {
      try {
        const cachedMessages = await messageCache.getCachedMessages(id);

        if (cachedMessages.length > 0) {
          return { messages: cachedMessages, total: cachedMessages.length };
        } else {
          return null;
        }
      } catch (error) {
        console.error(`[Chat] Cache load failed:`, error);
        return null;
      }
    }
  );

  // DEDICATED SCROLL EFFECT: This effect is SEPARATE from data loading
  // It runs AFTER SolidJS has reconciled the DOM, ensuring scrollHeight is accurate
  // FIX: Don't wait for images - scroll immediately like text-only chats
  // Image dimensions are preserved via min-width/min-height to prevent layout shift
  createEffect(() => {
    // Read reactive dependencies
    const msgCount = messages().length;
    const scrollDone = initialScrollDone();

    // Calculate shouldTrigger
    const shouldTrigger = msgCount > 0 && !hasPerformedInitialScroll && !scrollDone;

    // Only trigger if:
    // 1. We have messages rendered
    // 2. Initial scroll not done
    // 3. No timeout already scheduled (prevents multiple scroll attempts)
    if (shouldTrigger && !scrollTimeoutId) {
      // Use setTimeout with small delay to ensure DOM is fully painted
      // This is more reliable than RAF for SolidJS batch updates
      scrollTimeoutId = setTimeout(() => {
        scrollTimeoutId = null;
        if (!hasPerformedInitialScroll) {
          performInitialScroll();
        }
      }, 50);
    }
  });

  // ============================================================================
  // CURSOR-BASED PAGINATION STATE
  // ============================================================================
  // Initial load: 100 messages (newest)
  // Load more: 200 messages at a time (older)
  const INITIAL_LOAD_LIMIT = 100;
  const LOAD_MORE_LIMIT = 200;

  // Cursor for loading older messages (sequence number of oldest loaded message)
  const [loadMoreCursor, setLoadMoreCursor] = createSignal<number | undefined>(undefined);

  // Track if we're loading more (to prevent double-fetches)
  const [isLoadingMore, setIsLoadingMore] = createSignal(false);

  // Track if there are more messages to load
  const [hasMoreMessages, setHasMoreMessages] = createSignal(true);

  // Use cursor-based pagination query for initial load
  // NOTE: We only use this for initial load. "Load more" is handled separately
  // to properly manage scroll position and message merging
  const cachedMessagesQuery = useTicketMessagesCursor(ticketId, {
    initialLimit: INITIAL_LOAD_LIMIT,
    loadMoreLimit: LOAD_MORE_LIMIT,
    enabled: () => true,
    // Use cached messages as initialData for instant render
    get initialData() {
      const cacheData = cachedMessagesResource();
      if (!cacheData) return undefined;
      // Convert cache format to cursor response format
      return {
        messages: cacheData.messages,
        total: cacheData.total,
        oldestSequence: cacheData.messages[0]?.sequenceNumber ?? null,
        hasMore: cacheData.total > cacheData.messages.length,
      } as GetMessagesCursorResponse;
    }
  });

  // Track if messages have been loaded from HTTP GET (not cache)
  const [httpMessagesLoaded, setHttpMessagesLoaded] = createSignal(false);

  // SPLIT LOADING STATES:
  // - isHydrating: waiting for ANY data (cache or HTTP) to render
  // - isRealtimeConnecting: WebSocket connection status (non-blocking)
  const isHydrating = () => {
    // If we have messages from any source, hydration is complete
    if (messages().length > 0) return false;

    // If cache is loaded and has messages, hydration is complete
    const cacheData = cachedMessagesResource();
    if (cacheData && cacheData.messages && cacheData.messages.length > 0) {
      return false;
    }

    // If HTTP GET is loading and cache didn't provide data, we're hydrating
    if (cachedMessagesQuery.isLoading) return true;

    // Otherwise, hydration is complete (either cache miss or HTTP done)
    return false;
  };

  // Connection indicator based purely on SignalR state
  // Simplified to avoid race conditions with derived states
  const isRealtimeConnecting = () => {
    // Only show "connecting" during initial load when SignalR is not yet connected
    // After initial load, rely on isConnected for stable indicator
    if (!realTimeChat.isConnected() && realTimeChat.isLoading()) {
      return true;
    }
    return false;
  };

  // Legacy compatibility: keep isLoadingMessages for backwards compatibility
  const isLoadingMessages = isHydrating;

  // Reset state when ticket changes
  createEffect(() => {
    const id = ticketId();
    if (id) {
      const startTime = performance.now();
      setNavigationStartTime(startTime);
      setHttpGetCompleteTime(null);
      setWsConnectedTime(null);
      setCacheLoadTime(null);
      setHttpMessagesLoaded(false);
      setMessages([]);
      setLoadingImages(new Set());
      setMessageImageDimensions(new Map()); // FIX: Reset dimensions map for new ticket
      setInitialScrollDone(false);
      // Reset cursor pagination state
      setLoadMoreCursor(undefined);
      setIsLoadingMore(false);
      setHasMoreMessages(true);
      // Reset initial scroll tracking for new chat
      hasPerformedInitialScroll = false;
      initialScrollRetryCount = 0;
      // Clear any pending scroll timeout to prevent stale scrolls
      if (scrollTimeoutId) {
        clearTimeout(scrollTimeoutId);
        scrollTimeoutId = null;
      }
      // Reset scroll state for new chat
      // isAtBottomRef is source of truth for coordinator, isOnBottom for UI
      setIsAtBottomRef(true);
      setIsOnBottom(true);
      // Reset scroll lock
      scrollLock = false;
    }
  });

  // Initialize messages from cache immediately, then from HTTP GET
  createEffect(() => {
    const id = ticketId();
    const cacheData = cachedMessagesResource();
    const queryData = cachedMessagesQuery.data;

    // PRIORITY 1: Show cached messages immediately (sub-10ms)
    if (cacheData && cacheData.messages.length > 0 && messages().length === 0) {
      setCacheLoadTime(performance.now());

      setMessages(cacheData.messages);

      // Check if there are screenshot messages that need to load images
      const hasScreenshots = cacheData.messages.some(msg => msg.isScreenshot && msg.screenshotFileName);

      if (hasScreenshots) {
        // Set a timeout fallback in case images take too long or fail to load
        setTimeout(() => {
          if (!hasPerformedInitialScroll) {
            setLoadingImages(new Set()); // Clear stuck images to trigger reactive scroll effect
          }
        }, 500);
      }
    }

    // PRIORITY 2: Update with fresh HTTP GET data and cache it
    const fetchedMessages = queryData?.messages;
    if (queryData && fetchedMessages) {
      const isFirstLoad = !httpMessagesLoaded();

      // Use untrack() to read messages without creating a reactive dependency
      // This prevents infinite loops when we later call setMessages()
      const currentMessages = untrack(() => messages());

      // For refetch, ONLY update if HTTP has messages we don't have (by ID)
      // Don't update just because counts differ (we might have MORE from WebSocket)
      const currentMessageIds = new Set(currentMessages.map(m => m.id));
      const httpHasNewMessages = fetchedMessages.some(m => !currentMessageIds.has(m.id));

      // Only update on first load OR if HTTP has new messages we don't have
      // Remove count comparison - it causes unnecessary updates when WS has added messages
      const shouldUpdate = isFirstLoad || httpHasNewMessages;

      if (shouldUpdate) {
        const completeTime = performance.now();

        if (isFirstLoad) {
          setHttpGetCompleteTime(completeTime);

          // Update cursor pagination state from initial response
          if (queryData.oldestSequence !== null) {
            setLoadMoreCursor(queryData.oldestSequence);
          }
          setHasMoreMessages(queryData.hasMore);
        }

        if (fetchedMessages.length > 0) {

          // FIX: ALWAYS merge messages instead of replacing
          // This prevents:
          // 1. Losing cached older messages when HTTP returns only latest N
          // 2. Race condition where HTTP GET returns stale data without WS-delivered messages
          // 3. Scroll position reset when content shrinks (70 cached → 20 HTTP)
          if (isFirstLoad) {
            // First load: merge cache and HTTP data
            // Cache might have older messages; HTTP has fresher data for recent messages
            setMessages(prev => {
              // If no cached messages, just use HTTP
              if (prev.length === 0) {
                return fetchedMessages;
              }

              // Merge: HTTP messages are fresher for recent data
              const messageMap = new Map<string, ChatMessage>();

              // Add cached messages first (older messages that HTTP might not include)
              for (const msg of prev) {
                messageMap.set(msg.id, msg);
              }

              // Add/update with HTTP messages (fresher data, might have updates)
              for (const msg of fetchedMessages) {
                messageMap.set(msg.id, msg);
              }

              const merged = Array.from(messageMap.values());

              return merged;
            });
          } else {
            // Refetch: merge to preserve WS-delivered messages while adding any HTTP-only messages
            setMessages(prev => {
              const messageMap = new Map<string, ChatMessage>();

              // Add all previous messages first (includes WS-delivered messages)
              for (const msg of prev) {
                messageMap.set(msg.id, msg);
              }

              // Add HTTP messages that we don't have yet
              // Don't overwrite existing messages (WS-delivered might have newer status)
              for (const msg of fetchedMessages) {
                if (!messageMap.has(msg.id)) {
                  messageMap.set(msg.id, msg);
                }
              }

              const merged = Array.from(messageMap.values());

              return merged;
            });
          }

          // CACHE WRITE: Save fresh messages to IndexedDB for next visit
          messageCache.cacheMessages(id, fetchedMessages).catch((err) =>
            console.warn('[Chat] Failed to cache messages:', err)
          );

          // Scroll handling moved to dedicated reactive effect
          // Only set timeout fallback for screenshots
          if (!hasPerformedInitialScroll) {
            const hasScreenshots = fetchedMessages.some(msg => msg.isScreenshot && msg.screenshotFileName);

            if (hasScreenshots && loadingImages().size > 0) {
              // Set timeout fallback for stuck images
              setTimeout(() => {
                if (!hasPerformedInitialScroll) {
                  setLoadingImages(new Set()); // Clear to trigger reactive scroll effect
                }
              }, 500);
            }
          }
        }

        if (isFirstLoad) {
          setHttpMessagesLoaded(true);
        }
      }
    }
  });

  // Group messages by date for WhatsApp-style separators
  const groupedMessages = createMemo(() => {
    // First, ensure messages are sorted chronologically
    const sortedMsgs = sortMessages(messages());

    // Group by date
    const groups: { [key: string]: ChatMessage[] } = {};
    sortedMsgs.forEach((message) => {
      const date = new Date(message.createdAt).toDateString();
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(message);
    });

    // Return array of [date, messages] sorted by date chronologically
    return Object.entries(groups).sort(([dateA], [dateB]) => {
      return new Date(dateA).getTime() - new Date(dateB).getTime();
    });
  });

  // Check if we should show sender
  const shouldShowSender = (message: ChatMessage, index: number, allMessages: ChatMessage[]) => {
    const currentUser = user();
    if (message.senderId === currentUser?.id) return false;
    const prevMessage = allMessages[index - 1];
    if (!prevMessage) return true;
    return prevMessage.senderId !== message.senderId;
  };

  // Image viewer for screenshots
  const imageViewer = useImageViewer();

  // Store blob URLs by message ID for the image viewer
  const [messageBlobUrls, setMessageBlobUrls] = createSignal<Map<string, string>>(new Map());

  // FIX: Store image dimensions by message ID to survive component re-creation
  // When message list re-renders (optimistic→server replacement), components lose local state
  // This persistent map preserves dimensions to prevent layout shift and scroll jump
  const [messageImageDimensions, setMessageImageDimensions] = createSignal<Map<string, { width: number; height: number }>>(new Map());

  // Collect all screenshot images from messages for the viewer
  const screenshotImages = createMemo(() => {
    const msgs = messages();
    const urls = messageBlobUrls();
    return msgs
      .filter((msg) => msg.isScreenshot && msg.screenshotFileName && urls.has(msg.id))
      .map((msg) => ({
        id: msg.id,
        url: urls.get(msg.id)!,
        messageId: msg.id,
        createdAt: msg.createdAt,
        caption: msg.content !== "📷 Screenshot" && msg.content !== "Screenshot" ? msg.content : undefined,
      }));
  });

  // Handle image click - open viewer at the clicked image
  const handleImageClick = (messageId: string) => {
    const images = screenshotImages();
    const index = images.findIndex((img) => img.messageId === messageId);
    if (index !== -1) {
      imageViewer.openViewer(images, index);
    }
  };

  // Handle blob URL ready - store in map for image viewer
  const handleBlobUrlReady = (messageId: string, blobUrl: string) => {
    setMessageBlobUrls((prev) => {
      const newMap = new Map(prev);
      newMap.set(messageId, blobUrl);
      return newMap;
    });
  };

  // Handle image load start - track which images are loading
  const handleImageLoadStart = (messageId: string) => {
    setLoadingImages((prev) => {
      const newSet = new Set(prev);
      newSet.add(messageId);
      return newSet;
    });
  };

  // Handle storing image dimensions persistently
  const handleImageDimensionsStored = (messageId: string, dimensions: { width: number; height: number }) => {
    setMessageImageDimensions((prev) => {
      // Skip if already stored (no need to trigger re-render)
      if (prev.has(messageId)) return prev;
      const newMap = new Map(prev);
      newMap.set(messageId, dimensions);
      return newMap;
    });
  };

  // Handle image load complete - DELEGATES to scroll coordinator
  // Matches IT app pattern: only scroll if at bottom AND latest message
  const handleImageLoad = (messageId: string) => {
    // Remove from loading set
    setLoadingImages((prev) => {
      const newSet = new Set(prev);
      newSet.delete(messageId);
      return newSet;
    });

    const allMessages = messages();
    if (allMessages.length === 0) return;

    // Match IT app behavior: only scroll on image load if:
    // 1. Initial scroll is done
    // 2. User is at bottom
    // 3. Image is from the latest message
    if (!hasPerformedInitialScroll) return;
    if (!isAtBottomRef()) return;

    const sortedMessages = sortMessages(allMessages);
    const latestMessage = sortedMessages[sortedMessages.length - 1];

    if (latestMessage?.id === messageId) {
      requestAnimationFrame(() => {
        requestScroll('image-load', { wasAtBottom: true });
      });
    }
  };

  // Local state for input and sending
  const [newMessage, setNewMessage] = createSignal("");
  const [isSending, setIsSending] = createSignal(false);
  const [sendError, setSendError] = createSignal<string | null>(null);

  // Screenshot preview state
  const [pendingScreenshot, setPendingScreenshot] = createSignal<{
    file: File;
    previewUrl: string;
  } | null>(null);

  // Refs
  let scrollContainerRef: HTMLDivElement | undefined;
  let textareaRef: HTMLTextAreaElement | undefined;

  // NOTE: ResizeObserver REMOVED to match IT app behavior
  // IT app does NOT have ResizeObserver - scroll decisions are made through:
  // - Initial scroll
  // - New message
  // - Image load (latest only)
  // This eliminates a source of competing scroll authorities

  // Scroll-aware state - used for UI (scroll button visibility)
  // isAtBottomRef (defined earlier) is the source of truth for scroll coordinator
  const [isOnBottom, setIsOnBottom] = createSignal(false);

  // Track new messages received while scrolled up (for badge count)
  const [newMessagesWhileScrolledUp, setNewMessagesWhileScrolledUp] = createSignal(0);

  // Programmatic scroll flag - prevents scroll loops
  let isScrollingProgrammatically = false;

  // Debounce scroll handler using requestAnimationFrame
  let scrollCheckScheduled = false;

  // Track images being loaded for initial scroll timing
  const [loadingImages, setLoadingImages] = createSignal<Set<string>>(new Set());
  const [initialScrollDone, setInitialScrollDone] = createSignal(false);

  // NEW: Track if we've performed the ONE guaranteed initial scroll for this chat
  // This is a ref (not signal) because we don't need reactivity, just state tracking
  let hasPerformedInitialScroll = false;
  let initialScrollRetryCount = 0;
  const MAX_INITIAL_SCROLL_RETRIES = 15; // ~250ms at 60fps

  // NOTE: Stabilization period REMOVED to match IT app behavior
  // IT app relies on the simpler guards: hasPerformedInitialScroll + isAtBottom + latestMessage
  // Without ResizeObserver, the root cause of flicker is eliminated

  /**
   * Check if scroll container is ready for scrolling
   * Container is ready when: exists, has content, and is rendered (scrollHeight > clientHeight or has messages)
   */
  const isContainerReady = (): boolean => {
    const container = scrollContainerRef;
    if (!container) return false;

    const { scrollHeight, clientHeight } = container;
    const msgCount = messages().length;

    // Container ready if: has scroll content OR has messages rendered
    // scrollHeight > 0 means DOM is painted
    return scrollHeight > 0 && (scrollHeight > clientHeight || msgCount > 0);
  };

  /**
   * Perform the ONE guaranteed initial scroll when chat opens
   * Uses RAF retry with setTimeout fallback to wait for container readiness
   * DELEGATES to scroll coordinator with force=true
   */
  const performInitialScroll = () => {
    // Already done for this chat session
    if (hasPerformedInitialScroll) {
      return;
    }

    const container = scrollContainerRef;

    // Guard: no container
    if (!container) {
      if (initialScrollRetryCount < MAX_INITIAL_SCROLL_RETRIES) {
        initialScrollRetryCount++;
        setTimeout(performInitialScroll, 16);
      } else {
        hasPerformedInitialScroll = true;
        setInitialScrollDone(true);
        setIsAtBottomRef(true);
      }
      return;
    }

    const { scrollHeight } = container;

    // Guard: scrollHeight === 0 means DOM not painted yet
    if (scrollHeight === 0) {
      if (initialScrollRetryCount < MAX_INITIAL_SCROLL_RETRIES) {
        initialScrollRetryCount++;
        setTimeout(performInitialScroll, 32);
      } else {
        hasPerformedInitialScroll = true;
        setInitialScrollDone(true);
        setIsAtBottomRef(true);
      }
      return;
    }

    // Container is ready - DELEGATE to scroll coordinator with force=true
    // Mark as complete BEFORE scrolling to prevent re-entry
    hasPerformedInitialScroll = true;
    setInitialScrollDone(true);

    // Delegate to coordinator - force=true, instant (no smooth)
    requestScroll('initial', { force: true, smooth: false });
  };

  // Simplified scrollToBottom - DELEGATES to scroll coordinator
  // This is now just a convenience wrapper
  const scrollToBottom = (smooth: boolean = true, force: boolean = false) => {
    requestScroll(force ? 'user-click' : 'new-message', { force, smooth, wasAtBottom: isAtBottomRef() });
  };

  /**
   * Handle loading more (older) messages with cursor-based pagination
   *
   * KEY FEATURE: Scroll position preservation
   * - Capture scroll position BEFORE prepending messages
   * - After prepending, adjust scrollTop to maintain visual position
   * - This prevents the jarring "jump to top" effect
   */
  const handleLoadMoreMessages = async () => {
    const cursor = loadMoreCursor();
    const id = ticketId();

    if (!cursor || !id || isLoadingMore()) {
      return;
    }

    setIsLoadingMore(true);

    try {
      // Capture scroll position BEFORE loading more
      const container = scrollContainerRef;
      const scrollHeightBefore = container?.scrollHeight ?? 0;
      const scrollTopBefore = container?.scrollTop ?? 0;

      // Fetch older messages using cursor-based pagination
      const response = await getMessagesCursor({
        requestId: id,
        limit: LOAD_MORE_LIMIT,
        beforeSequence: cursor,
      });

      if (response.messages.length > 0) {
        // Prepend older messages to the beginning
        setMessages(prev => {
          // Merge with existing messages (dedupe by ID)
          const messageMap = new Map<string, ChatMessage>();

          // Add older messages first
          for (const msg of response.messages) {
            messageMap.set(msg.id, msg);
          }

          // Add existing messages (these are newer)
          for (const msg of prev) {
            messageMap.set(msg.id, msg);
          }

          const merged = Array.from(messageMap.values());

          return merged;
        });

        // SCROLL POSITION PRESERVATION:
        // After prepending, the new content pushes everything down.
        // We need to adjust scrollTop to maintain the user's visual position.
        requestAnimationFrame(() => {
          if (container) {
            const scrollHeightAfter = container.scrollHeight;
            const heightDiff = scrollHeightAfter - scrollHeightBefore;

            // Adjust scroll position to compensate for prepended content
            container.scrollTop = scrollTopBefore + heightDiff;
          }
        });

        // Update cache with all messages
        const allMessages = untrack(() => messages());
        messageCache.cacheMessages(id, allMessages).catch((err) =>
          console.warn('Failed to update message cache:', err)
        );
      }

      // Update pagination state
      if (response.oldestSequence !== null) {
        setLoadMoreCursor(response.oldestSequence);
      }
      setHasMoreMessages(response.hasMore);

    } catch (error) {
      console.error('Error loading more messages:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Track scroll position - UPDATES SINGLE SOURCE OF TRUTH (isAtBottomRef)
  // This is the ONLY place where isAtBottomRef is updated from user scrolling
  // Debounced with requestAnimationFrame for performance
  const handleScroll = () => {
    // Ignore programmatic scrolls to prevent loops
    if (isScrollingProgrammatically) {
      return;
    }

    // Don't update scroll state during initial load
    if (!initialScrollDone()) {
      return;
    }

    // Debounce: only schedule one check per animation frame
    if (scrollCheckScheduled) {
      return;
    }

    scrollCheckScheduled = true;

    requestAnimationFrame(() => {
      scrollCheckScheduled = false;

      const container = scrollContainerRef;
      if (!container) return;

      const { scrollTop, scrollHeight, clientHeight } = container;
      const currentBottom = scrollTop + clientHeight;
      const isAtBottom = currentBottom >= scrollHeight - SCROLL_THRESHOLD;

      // Update BOTH signals - isAtBottomRef is the source of truth for coordinator
      // isOnBottom is kept for UI display (scroll button visibility)
      const prevIsAtBottom = isAtBottomRef();
      if (prevIsAtBottom !== isAtBottom) {
        setIsAtBottomRef(isAtBottom);
        setIsOnBottom(isAtBottom);
      }

      // Reset new messages counter if user manually scrolled to bottom
      if (isAtBottom) {
        setNewMessagesWhileScrolledUp(0);
      }
    });
  };

  // Set active chat to suppress notifications for this ticket while viewing
  createEffect(() => {
    const id = ticketId();
    if (id) {
      notificationWs.setActiveChat(id);
    }

    onCleanup(() => {
      notificationWs.setActiveChat(null);
    });
  });

  // Auto-mark messages as read when chat opens (HTTP-first approach)
  // Uses a ref to track which ticket was last marked, preventing duplicate calls
  let lastMarkedTicketId: string | null = null;
  createEffect(() => {
    const id = ticketId();
    const msgCount = messages().length;

    // Only proceed if we have a ticket and messages
    if (!id || msgCount === 0) {
      return;
    }

    // Skip if already marked for this ticket
    if (lastMarkedTicketId === id) {
      return;
    }

    // Mark this ticket as processed
    lastMarkedTicketId = id;

    // Update cache immediately for responsive UI
    updateTicketInCache(id, {
      unreadCount: 0,
      chatStatus: "read"
    });

    // Call HTTP endpoint for persistence (fire-and-forget)
    markMessagesAsRead(id)
      .then(() => {
        // Refresh global unread count after marking as read
        refreshUnreadCountFromAPI();
      })
      .catch((err) => console.warn("markMessagesAsRead failed:", err));
  });

  // Handler for new messages from SignalR
  // IMPORTANT: SignalR context already handles adding messages to its own state
  // We only need to:
  // 1. Cache the message to IndexedDB
  // 2. Update sequence number
  // 3. Handle scroll behavior
  // DO NOT add to localMessages - this would cause duplicate merge and flicker
  const handleNewMessage = (message: ChatMessage) => {
    // Check if this is an optimistic message replacement
    const isOptimisticReplacement = message.clientTempId &&
      messages().some(m => m.tempId === message.clientTempId || m.id === message.clientTempId);

    // Cache the message to IndexedDB (fire-and-forget)
    if (message.clientTempId && isOptimisticReplacement) {
      messageCache.replaceOptimisticMessage(message.clientTempId, {
        ...message,
        status: 'sent'
      }).catch(() => {});
    } else {
      // Check for duplicate before caching
      if (!messages().some(m => m.id === message.id)) {
        messageCache.addMessage({ ...message, status: 'sent' }).catch(() => {});
      }
    }

    if (typeof message.sequenceNumber === 'number') {
      setLastSequence(message.sequenceNumber);
    }

    // For optimistic replacements, delegate to coordinator with force (user's own message)
    if (isOptimisticReplacement) {
      requestAnimationFrame(() => {
        requestScroll('new-message', { force: true, smooth: false });
      });
      return;
    }

    // Capture at-bottom state BEFORE any DOM updates
    const wasAtBottom = isAtBottomRef();

    // DELEGATE to coordinator - it decides if scroll happens based on wasAtBottom
    requestAnimationFrame(() => {
      requestScroll('new-message', { smooth: true, wasAtBottom });
    });

    // Increment counter if message from other user while scrolled up
    const currentUser = user();
    const isFromOtherUser = currentUser && message.senderId !== currentUser.id;
    if (!wasAtBottom && isFromOtherUser) {
      setNewMessagesWhileScrolledUp(prev => prev + 1);
    }
  };

  // Handler for task status changes from SignalR
  const handleTaskStatusChanged = (data: any) => {
    if (data.countAsSolved) {
      setForceSolved(true);

      updateTicketInCache(ticketId(), {
        statusId: data.statusId,
      });

      // Add fallback system message
      const fallbackSystemMessage: ChatMessage = {
        id: `fallback-solved-${data.taskId}-${Date.now()}`,
        requestId: data.taskId,
        senderId: null,
        sender: null,
        content: "Request has been solved|تم حل الطلب",
        sequenceNumber: lastSequence() + 1,
        isScreenshot: false,
        screenshotFileName: null,
        isRead: true,
        isReadByCurrentUser: true,
        createdAt: data.closedAt || new Date().toISOString(),
        updatedAt: null,
        readAt: null,
        readReceipt: null,
        status: 'sent' as const
      };

      const existingSolvedMessage = messages().find(
        (m) => m.senderId === null && (m.content.includes("solved") || m.content.includes("تم حل"))
      );

      if (!existingSolvedMessage) {
        setMessages((prev) => [...prev, fallbackSystemMessage]);
        setLastSequence(fallbackSystemMessage.sequenceNumber);

        // Delegate to coordinator
        requestAnimationFrame(() => {
          requestScroll('new-message', { smooth: true, wasAtBottom: isAtBottomRef() });
        });
      }
    }
  };

  // ============================================================================
  // Screenshot Capture
  // ============================================================================

  const handleScreenshotCapture = async () => {
    if (isSending()) return;

    try {
      let file: File | null = null;

      // Try Tauri native capture first
      try {
        showNotification("📸 Capturing screenshot...", "info", 1000);

        // Call Tauri command to capture screen instantly
        const base64Image = await invoke<string>("capture_screen");

        // Convert base64 to File
        const byteString = atob(base64Image);
        const byteArray = new Uint8Array(byteString.length);
        for (let i = 0; i < byteString.length; i++) {
          byteArray[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([byteArray], { type: "image/png" });
        file = new File([blob], `screenshot-${Date.now()}.png`, { type: "image/png" });
      } catch (tauriError) {
        // Not in Tauri or Tauri command failed
        showNotification("Screenshot failed, trying clipboard...", "warning", 2000);

        // Fallback: Try reading from clipboard (web or if Tauri failed)
        try {
          const clipboardItems = await navigator.clipboard.read();
          for (const item of clipboardItems) {
            const imageType = item.types.find((t) => t.startsWith("image/"));
            if (imageType) {
              const blob = await item.getType(imageType);
              file = new File([blob], `screenshot-${Date.now()}.png`, { type: imageType });
              break;
            }
          }
          if (!file) {
            throw new Error("No screenshot found in clipboard");
          }
        } catch (clipboardError) {
          const errorMsg = "No screenshot found. Take a screenshot (Print Screen), then click this button again.";
          setSendError(errorMsg);
          showNotification(errorMsg, "warning", 4000);
          return;
        }
      }

      if (!file) {
        throw new Error("Failed to capture screenshot");
      }

      // CREATE PREVIEW INSTEAD OF SENDING IMMEDIATELY
      const previewUrl = URL.createObjectURL(file);
      setPendingScreenshot({ file, previewUrl });

      showNotification("Screenshot captured! Add a message and click send.", "success", 2000);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to capture screenshot";
      setSendError(errorMsg);
      showNotification(errorMsg, "error", 4000);
    }
  };

  // ============================================================================
  // Message Sending
  // ============================================================================

  // Upload screenshot to backend
  const uploadScreenshot = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);

    const token = authStore.state.token;
    const apiUrl = RuntimeConfig.getServerAddress();
    // request_id as query parameter, not form data
    // Use Tauri HTTP plugin to bypass CORS and ACL restrictions
    const response = await tauriFetch(`${apiUrl}/screenshots/upload?request_id=${ticketId()}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Screenshot upload failed');
    }

    const data = await response.json();
    return data.screenshot.filename;
  };

  const handleSendMessage = async (e: Event) => {
    e.preventDefault();

    const content = newMessage().trim();
    const screenshot = pendingScreenshot();

    // Require either content or screenshot
    if (!content && !screenshot) return;
    if (isSending() || chatMutations.isSending()) return;

    // Guard: Don't send if ticket is solved
    if (isTicketSolved()) {
      showNotification(t("chat.resolved"), "warning", 3000);
      return;
    }

    setIsSending(true);
    setSendError(null);

    try {
      let screenshotFileName: string | undefined;

      // Upload screenshot first if present
      if (screenshot) {
        screenshotFileName = await uploadScreenshot(screenshot.file);
        URL.revokeObjectURL(screenshot.previewUrl);
      }

      // Prepare message content
      const messageContent = content || (screenshot ? "Screenshot" : "");

      if (screenshot) {
        // Use REST API directly for screenshot messages (no optimistic update)
        await sendMessageApi({
          requestId: ticketId(),
          content: messageContent,
          isScreenshot: true,
          screenshotFileName,
        });

        // Delegate to coordinator with force (user's own message)
        requestAnimationFrame(() => {
          requestScroll('new-message', { force: true, smooth: false });
        });

        setNewMessage("");
        setPendingScreenshot(null);
        showNotification("Message sent!", "success", 1500);
        requestAnimationFrame(() => {
          textareaRef?.focus();
        });
      } else {
        // IMMEDIATELY clear input BEFORE starting send
        setNewMessage("");
        requestAnimationFrame(() => {
          textareaRef?.focus();
        });

        // Use chatMutations for text messages with optimistic update + HTTP persistence
        chatMutations.sendMessage(messageContent).catch(() => {
          // Error is already handled in chatMutations (marks message as failed)
        });

        // Delegate to coordinator with force (user's own message)
        requestAnimationFrame(() => {
          requestScroll('new-message', { force: true, smooth: false });
        });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to send message";

      // Detect "closed/solved" error from backend
      if (errorMsg.toLowerCase().includes("closed") || errorMsg.toLowerCase().includes("solved")) {
        setForceSolved(true);
        showNotification(t("chat.resolved"), "warning", 4000);
      } else {
        setSendError(errorMsg);
        showNotification(errorMsg, "error", 4000);
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  return (
    <div class="flex h-screen flex-col bg-chat-background">
      {/* Header - Force LTR layout, allow RTL text */}
      <header class="flex items-center gap-4 bg-chat-header text-white px-4 py-3 shadow-sm" dir="ltr">
        <Button
          variant="ghost"
          size="icon"
          class="text-white hover:bg-white/10"
          onMouseEnter={preloadTicketsRoute}
          onClick={() => navigate("/tickets")}
        >
          <ArrowLeft class="h-4 w-4" />
        </Button>
        <div class="flex-1 min-w-0" dir={language() === "ar" ? "rtl" : "ltr"}>
          <h1 class="font-semibold truncate">
            <Show when={ticket()?.title} fallback={
              <span class="inline-block h-5 w-48 bg-white/20 rounded animate-pulse" />
            }>
              {ticket()?.title}
            </Show>
          </h1>
          <p class="text-xs text-white/70 truncate">Ticket #{ticketId().slice(0, 8)}</p>
        </div>
        <div class="flex items-center gap-2">
          {/* Connection status indicator - icon only, no text */}
          {/* During hydration, the main content area shows a prominent spinner */}
          {/* Hide for solved tickets (no WebSocket connection needed) */}
          <Show when={!isHydrating() && !isTicketSolved()}>
            <Show when={isRealtimeConnecting()}>
              {/* WebSocket connecting - subtle spinner */}
              <div class="flex items-center justify-center h-6 w-6" title="Connecting to real-time chat...">
                <Spinner size="sm" class="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
            </Show>
            <Show when={!isRealtimeConnecting()}>
              {/* SignalR status - icon only */}
              <Show when={realTimeChat.isConnected()} fallback={
                <div class="flex items-center justify-center h-6 w-6" title="Disconnected">
                  <WifiOff class="h-4 w-4 text-warning" />
                </div>
              }>
                <div class="flex items-center justify-center h-6 w-6" title="Connected to real-time chat">
                  <Wifi class="h-4 w-4 text-success" />
                </div>
              </Show>
            </Show>
          </Show>
        </div>
      </header>

      {/* Messages area */}
      <div
        ref={(el) => (scrollContainerRef = el)}
        onScroll={handleScroll}
        class="flex-1 relative overflow-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-transparent hover:scrollbar-thumb-foreground/20 active:scrollbar-thumb-foreground/30 scrollbar-thumb-rounded-full"
        style={{ "overflow-anchor": "auto" }}
      >
        {/* Load more messages button - shown at top when there are older messages */}
        <Show when={hasMoreMessages() && loadMoreCursor() !== undefined}>
          <div class="flex justify-center p-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleLoadMoreMessages}
              disabled={isLoadingMore()}
            >
              {isLoadingMore() ? (
                <>
                  <Spinner size="sm" class="mr-2" />
                  Loading...
                </>
              ) : (
                <>Load {LOAD_MORE_LIMIT} older messages</>
              )}
            </Button>
          </div>
        </Show>

        {/* Show messages if available, or loading spinner */}
        <div>
        <Show when={messages().length > 0} fallback={
          <Show when={isLoadingMessages()} fallback={
            <div class="flex h-full flex-col items-center justify-center text-center p-4">
              <p class="text-muted-foreground">{t("chat.emptyState")}</p>
              <p class="text-sm text-muted-foreground">
                {t("chat.emptyStateDesc")}
              </p>
            </div>
          }>
            {/* Skeleton placeholder for loading state - better perceived performance */}
            <MessagesSkeleton />
          </Show>
        }>
          <div class="p-4 space-y-4">
            <For each={groupedMessages()}>
              {([date, dateMessages], dateIndex) => (
                <div data-date={date}>
                  <DateSeparator date={date} />
                  <For each={dateMessages}>
                    {(message, messageIndex) => (
                      <MessageBubble
                        message={message}
                        isOwnMessage={message.senderId === user()?.id}
                        showSender={messageIndex() === 0 || dateMessages[messageIndex() - 1]?.senderId !== message.senderId}
                        onImageClick={() => handleImageClick(message.id)}
                        onBlobUrlReady={handleBlobUrlReady}
                        onImageLoad={handleImageLoad}
                        onImageLoadStart={handleImageLoadStart}
                        onRetry={(tempId) => chatMutations.retryMessage(tempId)}
                        initialImageDimensions={messageImageDimensions().get(message.id)}
                        onImageDimensionsStored={handleImageDimensionsStored}
                      />
                    )}
                  </For>
                </div>
              )}
            </For>
          </div>
        </Show>
        </div>

        {/* Floating "Scroll to Bottom" button - appears when user scrolls up */}
        <Show when={!isOnBottom() && messages().length > 0}>
          <div class="sticky bottom-4 left-0 right-0 flex justify-center pointer-events-none">
            <button
              type="button"
              onClick={() => {
                scrollToBottom(true, true);
              }}
              class="pointer-events-auto bg-accent-400 hover:bg-accent-500 text-white shadow-lg rounded-full px-4 py-2 flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
              title="Scroll to bottom"
            >
              <ArrowDown class="h-4 w-4" />
              <Show when={newMessagesWhileScrolledUp() > 0}>
                <span class="text-xs font-medium">
                  {newMessagesWhileScrolledUp()} new
                </span>
              </Show>
              <Show when={newMessagesWhileScrolledUp() === 0}>
                <span class="text-xs font-medium">
                  Scroll to bottom
                </span>
              </Show>
            </button>
          </div>
        </Show>
      </div>

      {/* Error banner for send errors */}
      <Show when={sendError()}>
        <div class="border-t bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {sendError()}
        </div>
      </Show>

      {/* Message input */}
      <div class="border-t border-border bg-card p-4">
        {/* Show solved banner if ticket is solved */}
        <Show when={isTicketSolved()}>
          <div class="mb-3 rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 px-3 py-2 text-sm text-amber-700 dark:text-amber-300 text-center">
            This request has been resolved. No further messages can be sent.
          </div>
        </Show>

        {/* Screenshot Preview */}
        <Show when={pendingScreenshot()}>
          <div class="mb-3 bg-secondary rounded-lg p-3 border border-border">
            <div class="flex items-start gap-3">
              {/* Thumbnail */}
              <img
                src={pendingScreenshot()!.previewUrl}
                alt="Screenshot preview"
                class="w-20 h-20 object-cover rounded border border-border shadow-sm"
              />

              {/* Info */}
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-foreground">Screenshot ready to send</p>
                <p class="text-xs text-muted-foreground mt-1 truncate">
                  {pendingScreenshot()!.file.name}
                </p>
                <p class="text-xs text-muted-foreground mt-0.5">
                  {(pendingScreenshot()!.file.size / 1024).toFixed(1)} KB
                </p>
              </div>

              {/* Remove button */}
              <button
                type="button"
                onClick={() => {
                  const screenshot = pendingScreenshot();
                  if (screenshot) {
                    URL.revokeObjectURL(screenshot.previewUrl);
                  }
                  setPendingScreenshot(null);
                }}
                class="p-1.5 hover:bg-destructive/10 rounded text-destructive transition-colors"
                title="Remove screenshot"
              >
                <X class="h-4 w-4" />
              </button>
            </div>
          </div>
        </Show>

        <form onSubmit={handleSendMessage} class="flex items-center gap-3">
          {/* Screenshot button */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="h-10 w-10 text-muted-foreground hover:text-foreground hover:bg-secondary flex items-center justify-center"
            onClick={handleScreenshotCapture}
            disabled={isTicketSolved()}
            title="Capture desktop screenshot instantly"
          >
            <Camera class="h-5 w-5" />
          </Button>

          {/* Message textarea - NOT disabled during sending to allow rapid messages */}
          <Textarea
            ref={(el) => (textareaRef = el)}
            value={newMessage()}
            onInput={(e) => setNewMessage(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            placeholder={isTicketSolved() ? t("chat.resolved") : t("chat.inputPlaceholder")}
            class="min-h-[44px] resize-none flex-1 rounded-full border-border bg-secondary text-foreground placeholder:text-muted-foreground focus:border-border focus:bg-card"
            disabled={isTicketSolved()}
            rows={1}
          />

          {/* Send button - only disabled when no content or ticket solved */}
          <Button
            type="submit"
            size="icon"
            class="h-10 w-10 rounded-full bg-accent-400 hover:bg-accent-500 text-white shadow-sm"
            disabled={isTicketSolved() || (!newMessage().trim() && !pendingScreenshot())}
          >
            <Show when={isSending()} fallback={<Send class="h-4 w-4" />}>
              <Spinner size="sm" />
            </Show>
          </Button>
        </form>
      </div>

      {/* Image Viewer - full-screen overlay for screenshots */}
      <ImageViewer />
    </div>
  );
}


// PHASE 3: Exported component wrapped with lazy-loaded image providers
// This ensures ImageCache and ImageViewer providers only load when chat page opens
export default function TicketChatPage() {
  return (
    <LazyImageProviders>
      <TicketChatPageInner />
    </LazyImageProviders>
  );
}
