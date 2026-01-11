"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { RightChatMessage, type MessageStatus } from './right-chat-message';
import { LeftChatMessage } from './left-chat-message';
import { PickRequestCard } from './pick-request-card';
import { useViewport } from '@/hooks/use-mobile';
import { ArrowDown } from 'lucide-react';
import { useRequestDetail } from '../_context/request-detail-context';

interface Message {
  id: string;
  author: string;
  authorInitials: string;
  timestamp: string;
  content: string;
  isCurrentUser: boolean;
  avatarUrl?: string;
  isScreenshot?: boolean;
  createdAt?: string;
  screenshotFileName?: string | null;
  /** File attachment fields */
  fileName?: string | null;
  fileSize?: number | null;
  fileMimeType?: string | null;
  status?: MessageStatus;
  tempId?: string;
}

interface TicketMessagesProps {
  messages: Message[];
  isLoading?: boolean;
  onRetryMessage?: (tempId: string) => void;
}

function MessageSkeleton({ isRight = false, isMobile = false }: { isRight?: boolean; isMobile?: boolean }) {
  return (
    <div className={`flex items-start ${isMobile ? 'gap-2' : 'gap-3'} ${isRight ? 'flex-row-reverse' : 'flex-row'}`}>
      <Skeleton className={`${isMobile ? 'h-8 w-8' : 'h-10 w-10'} rounded-full flex-shrink-0`} />
      <div className={`flex-1 min-w-0 ${isMobile ? 'max-w-[85%]' : 'max-w-[70%]'} ${isRight ? 'flex flex-col items-end' : ''}`}>
        <div className={`flex items-center gap-2 ${isMobile ? 'mb-1' : 'mb-2'} ${isRight ? 'flex-row-reverse' : 'flex-row'}`}>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className={`${isMobile ? 'h-16' : 'h-20'} w-full rounded-lg`} />
      </div>
    </div>
  );
}

// Constants matching Requester App
const SCROLL_THRESHOLD = 50; // pixels from bottom to consider "at bottom"
const MAX_INITIAL_SCROLL_RETRIES = 15; // ~250ms at 60fps

// No-op function for fallback (prevents useEffect dependency array size changes)
const noop = () => {};

export function TicketMessages({ messages, isLoading = false, onRetryMessage }: TicketMessagesProps) {
  const { isMobile } = useViewport();
  const containerRef = useRef<HTMLDivElement>(null);
  const context = useRequestDetail();
  const { canTakeRequest, registerScrollHandler } = context;
  // Fallback to noop to prevent useEffect dependency array size changes during HMR
  const registerForceScrollHandler = context.registerForceScrollHandler ?? noop;

  // Hydration fix: Defer PickRequestCard rendering until after client mount
  // canTakeRequest depends on client-side session which differs from server
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Find the index of the last requester (non-current-user) message
  // We'll insert the PickRequestCard after this message
  // Only compute when mounted to avoid hydration mismatch
  const lastRequesterMessageIndex = useMemo(() => {
    if (!isMounted || !canTakeRequest) return -1;
    // Find the last message from a non-current user (requester)
    for (let i = messages.length - 1; i >= 0; i--) {
      if (!messages[i].isCurrentUser) {
        return i;
      }
    }
    return -1;
  }, [messages, canTakeRequest, isMounted]);

  // ============================================================================
  // SCROLL STATE MODEL (Ported from Requester App)
  // ============================================================================

  // Reactive state (signals in SolidJS, useState in React)
  const [isOnBottom, setIsOnBottom] = useState(true); // User at bottom?
  const [initialScrollDone, setInitialScrollDone] = useState(false); // Can respond to scroll?
  const [loadingImages, setLoadingImages] = useState<Set<string>>(new Set()); // Which images loading?
  const [newMessagesWhileScrolledUp, setNewMessagesWhileScrolledUp] = useState(0); // Badge count

  // Refs (not reactive, just tracking)
  const hasPerformedInitialScrollRef = useRef(false); // Did we scroll once for this chat?
  const initialScrollRetryCountRef = useRef(0); // Attempt counter
  const isScrollingProgrammaticallyRef = useRef(false); // Is a scroll in progress?
  const scrollCheckScheduledRef = useRef(false); // Is handleScroll debounced?
  const prevMessageCountRef = useRef(0); // Track message count changes

  // CRITICAL: Track current isOnBottom value for WebSocket handler
  // WebSocket callbacks need access to CURRENT scroll state, not stale closures
  const isOnBottomRef = useRef(isOnBottom);

  // Keep ref in sync with state (for WebSocket handler)
  useEffect(() => {
    isOnBottomRef.current = isOnBottom;
  }, [isOnBottom]);

  // ============================================================================
  // RESET STATE ON MESSAGES CHANGE (new chat)
  // ============================================================================
  useEffect(() => {
    // Detect if this is a new chat (messages array reference changed or count went to 0)
    if (messages.length === 0 || prevMessageCountRef.current === 0) {
      // Reset scroll state for new chat
      hasPerformedInitialScrollRef.current = false;
      initialScrollRetryCountRef.current = 0;
      setInitialScrollDone(false);
      setIsOnBottom(true);
      setLoadingImages(new Set());
      setNewMessagesWhileScrolledUp(0);
    }
    prevMessageCountRef.current = messages.length;
  }, [messages]);

  // ============================================================================
  // PERFORM INITIAL SCROLL (with retry logic)
  // ============================================================================
  const performInitialScroll = useCallback(() => {
    // Already done for this chat session
    if (hasPerformedInitialScrollRef.current) {
      return;
    }

    const container = containerRef.current;

    // Guard: no container
    if (!container) {
      if (initialScrollRetryCountRef.current < MAX_INITIAL_SCROLL_RETRIES) {
        initialScrollRetryCountRef.current++;
        setTimeout(performInitialScroll, 16);
      } else {
        // Force complete to unblock
        hasPerformedInitialScrollRef.current = true;
        setInitialScrollDone(true);
        setIsOnBottom(true);
      }
      return;
    }

    const { scrollHeight, clientHeight } = container;

    // Guard: scrollHeight === 0 means DOM not painted yet
    if (scrollHeight === 0) {
      if (initialScrollRetryCountRef.current < MAX_INITIAL_SCROLL_RETRIES) {
        initialScrollRetryCountRef.current++;
        setTimeout(performInitialScroll, 32);
      } else {
        // Force complete to unblock
        hasPerformedInitialScrollRef.current = true;
        setInitialScrollDone(true);
        setIsOnBottom(true);
      }
      return;
    }

    // Container is ready - perform the scroll
    isScrollingProgrammaticallyRef.current = true;

    // Instant scroll to bottom (no smooth animation for initial load)
    container.scrollTop = scrollHeight;

    // Mark all states as complete
    hasPerformedInitialScrollRef.current = true;
    setInitialScrollDone(true);
    setIsOnBottom(true);
    setNewMessagesWhileScrolledUp(0);

    // Reset programmatic flag
    setTimeout(() => {
      isScrollingProgrammaticallyRef.current = false;
    }, 0);
  }, []);

  // ============================================================================
  // SCROLL TO BOTTOM (for new messages)
  // ============================================================================
  const scrollToBottom = useCallback((smooth: boolean = true, force: boolean = false) => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    // Guard: scrollHeight === 0 means container not ready
    if (container.scrollHeight === 0) {
      return;
    }

    // Check if should scroll (unless forced) - read from ref for latest value
    if (!force && !isOnBottomRef.current) {
      return;
    }

    // Set programmatic scroll flag to prevent handleScroll from firing
    isScrollingProgrammaticallyRef.current = true;

    // Scroll to bottom
    if (smooth) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    } else {
      container.scrollTop = container.scrollHeight;
    }

    // Mark user as being at bottom
    setIsOnBottom(true);
    setNewMessagesWhileScrolledUp(0);

    // Reset flag after scroll completes
    // Use longer timeout for smooth scroll to ensure animation fully completes
    // Browser smooth scroll can take 300-500ms depending on distance and system
    setTimeout(() => {
      isScrollingProgrammaticallyRef.current = false;
    }, smooth ? 500 : 50);
  }, []); // Empty deps - uses refs for current values

  // ============================================================================
  // HANDLE SCROLL (debounced with RAF)
  // Uses ref for isOnBottom to avoid callback recreation on state change
  // ============================================================================
  const handleScroll = useCallback(() => {
    // Ignore programmatic scrolls to prevent loops
    if (isScrollingProgrammaticallyRef.current) {
      return;
    }

    // CRITICAL: Don't update scroll state during initial load (images still loading)
    if (!initialScrollDone) {
      return;
    }

    // Debounce: only schedule one check per animation frame
    if (scrollCheckScheduledRef.current) return;

    scrollCheckScheduledRef.current = true;

    requestAnimationFrame(() => {
      scrollCheckScheduledRef.current = false;

      const container = containerRef.current;
      if (!container) return;

      const { scrollTop, scrollHeight, clientHeight } = container;
      const currentBottom = scrollTop + clientHeight;
      const distanceFromBottom = scrollHeight - currentBottom;
      const isAtBottom = distanceFromBottom <= SCROLL_THRESHOLD;

      // Read from ref to avoid stale closure (isOnBottom state would be captured at callback creation)
      const prevIsOnBottom = isOnBottomRef.current;

      // Update scroll state based on position
      if (prevIsOnBottom !== isAtBottom) {
        setIsOnBottom(isAtBottom);
      }

      // Reset new messages counter if user manually scrolled to bottom
      if (isAtBottom) {
        setNewMessagesWhileScrolledUp(0);
      }
    });
  }, [initialScrollDone]); // Removed isOnBottom - using ref instead

  // ============================================================================
  // IMAGE LOAD CALLBACKS (coordinate scroll with image loading)
  // ============================================================================
  const handleImageLoadStart = useCallback((messageId: string) => {
    setLoadingImages(prev => {
      const newSet = new Set(prev);
      newSet.add(messageId);
      return newSet;
    });
  }, []);

  const handleImageLoad = useCallback((messageId: string) => {
    setLoadingImages(prev => {
      const newSet = new Set(prev);
      newSet.delete(messageId);
      return newSet;
    });

    // After initial scroll done, only adjust if user is at bottom and image is latest message
    // Use ref for isOnBottom to avoid callback recreation on state change
    if (hasPerformedInitialScrollRef.current && isOnBottomRef.current) {
      const latestMessage = messages[messages.length - 1];
      if (latestMessage?.id === messageId) {
        // Image loaded and expanded - adjust scroll to maintain bottom position
        requestAnimationFrame(() => {
          scrollToBottom(false, false);
        });
      }
    }
  }, [messages, scrollToBottom]); // Removed isOnBottom - using ref instead

  // ============================================================================
  // REACTIVE EFFECT: Trigger initial scroll when messages ready & images loaded
  // ============================================================================
  useEffect(() => {
    const msgCount = messages.length;
    const imagesLoading = loadingImages.size;

    // Only trigger if:
    // 1. We have messages rendered
    // 2. Initial scroll not done
    // 3. No images loading (they'll trigger scroll when done)
    if (msgCount > 0 && !hasPerformedInitialScrollRef.current && !initialScrollDone && imagesLoading === 0) {
      // Use setTimeout with small delay to ensure DOM is fully painted
      setTimeout(() => {
        if (!hasPerformedInitialScrollRef.current) {
          performInitialScroll();
        }
      }, 50);
    }
  }, [messages.length, loadingImages.size, initialScrollDone, performInitialScroll]);

  // ============================================================================
  // TIMEOUT FALLBACK: Force scroll if images take too long
  // ============================================================================
  useEffect(() => {
    if (messages.length > 0 && !hasPerformedInitialScrollRef.current) {
      const hasScreenshots = messages.some(msg => msg.isScreenshot && msg.screenshotFileName);

      if (hasScreenshots && loadingImages.size > 0) {
        const timeoutId = setTimeout(() => {
          if (!hasPerformedInitialScrollRef.current) {
            // Clear stuck images to trigger reactive scroll effect
            setLoadingImages(new Set());
          }
        }, 500);

        return () => clearTimeout(timeoutId);
      }
    }
  }, [messages, loadingImages.size]);

  // ============================================================================
  // NEW MESSAGE HANDLING: Called directly from WebSocket handler (CLONED FROM REQUESTER APP)
  // ============================================================================
  // This callback is called IMMEDIATELY when a new message arrives via WebSocket,
  // BEFORE React reconciliation. This ensures we read the scroll state at the exact
  // moment the message arrives, not after batching/reconciliation.
  //
  // STABILITY FIX: Use refs for all mutable state to keep callback stable
  // This prevents handler re-registration which can cause scroll instability
  const initialScrollDoneRef = useRef(initialScrollDone);
  useEffect(() => {
    initialScrollDoneRef.current = initialScrollDone;
  }, [initialScrollDone]);

  const handleNewMessageScroll = useCallback(() => {
    // Only handle new messages after initial scroll is done (read from ref)
    if (!initialScrollDoneRef.current) {
      return;
    }

    // Read current scroll state from ref (not stale closure)
    const wasScrolledUp = !isOnBottomRef.current;

    // Auto-scroll to bottom when new message arrives (if user is at bottom)
    // Use double requestAnimationFrame to ensure DOM has fully updated (React reconciliation)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToBottom(true, false); // Smooth scroll, respect isOnBottom flag
      });
    });

    // Increment counter if message arrived while scrolled up
    if (wasScrolledUp) {
      setNewMessagesWhileScrolledUp(prev => prev + 1);
    }
  }, [scrollToBottom]); // Stable - reads initialScrollDone and isOnBottom from refs

  // ============================================================================
  // FORCE SCROLL HANDLER: When user sends their own message (always scroll)
  // ============================================================================
  const handleForceScrollToBottom = useCallback(() => {
    // Force scroll to bottom regardless of current scroll position
    scrollToBottom(true, true); // smooth=true, force=true
  }, [scrollToBottom]);

  // ============================================================================
  // SCROLL EVENT LISTENER
  // ============================================================================
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll);

    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);

  // ============================================================================
  // REGISTER SCROLL HANDLERS WITH CONTEXT (for WebSocket auto-scroll)
  // ============================================================================
  useEffect(() => {
    // Register handlers on mount
    registerScrollHandler(handleNewMessageScroll);
    registerForceScrollHandler(handleForceScrollToBottom);

    // Unregister on unmount
    return () => {
      registerScrollHandler(null);
      registerForceScrollHandler(null);
    };
  }, [registerScrollHandler, registerForceScrollHandler, handleNewMessageScroll, handleForceScrollToBottom]);

  // Show loading skeleton
  if (isLoading) {
    return (
      <div className="flex-1 relative overflow-hidden">
        <div className={`h-full overflow-y-auto ${isMobile ? 'p-3' : 'p-6'} bg-background`}>
          <div className={`max-w-4xl mx-auto ${isMobile ? 'space-y-4' : 'space-y-6'}`}>
            <MessageSkeleton isRight={false} isMobile={isMobile} />
            <MessageSkeleton isRight={true} isMobile={isMobile} />
            <MessageSkeleton isRight={false} isMobile={isMobile} />
            <MessageSkeleton isRight={true} isMobile={isMobile} />
          </div>
        </div>
      </div>
    );
  }

  // Show empty state
  if (messages.length === 0) {
    return (
      <div className="flex-1 relative overflow-hidden">
        <div className={`h-full overflow-y-auto ${isMobile ? 'p-3' : 'p-6'} bg-background flex items-center justify-center`}>
          <div className="text-center text-muted-foreground">
            <p className={`${isMobile ? 'text-base' : 'text-lg'} font-medium`}>No messages yet</p>
            <p className="text-sm">Start the conversation by sending a message below.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative overflow-hidden">
      <div ref={containerRef} className={`h-full overflow-y-auto ${isMobile ? 'p-3' : 'p-6'} bg-background`}>
        <div className={`max-w-4xl mx-auto ${isMobile ? 'space-y-4' : 'space-y-6'}`}>
          {messages.map((message, index) => (
            <div key={message.id}>
              {message.isCurrentUser ? (
                <RightChatMessage
                  id={message.id}
                  author={message.author}
                  authorInitials={message.authorInitials}
                  timestamp={message.timestamp}
                  content={message.content}
                  avatarUrl={message.avatarUrl}
                  isScreenshot={message.isScreenshot}
                  screenshotFileName={message.screenshotFileName}
                  fileName={message.fileName}
                  fileSize={message.fileSize}
                  fileMimeType={message.fileMimeType}
                  status={message.status}
                  tempId={message.tempId}
                  onRetry={onRetryMessage}
                  isMobile={isMobile}
                  onImageLoadStart={handleImageLoadStart}
                  onImageLoad={handleImageLoad}
                  createdAt={message.createdAt}
                />
              ) : (
                <LeftChatMessage
                  id={message.id}
                  author={message.author}
                  authorInitials={message.authorInitials}
                  timestamp={message.timestamp}
                  content={message.content}
                  avatarUrl={message.avatarUrl}
                  isScreenshot={message.isScreenshot}
                  screenshotFileName={message.screenshotFileName}
                  fileName={message.fileName}
                  fileSize={message.fileSize}
                  fileMimeType={message.fileMimeType}
                  isMobile={isMobile}
                  onImageLoadStart={handleImageLoadStart}
                  onImageLoad={handleImageLoad}
                />
              )}

              {/* Insert PickRequestCard after the last requester message */}
              {index === lastRequesterMessageIndex && (
                <div className="mt-4 md:mt-6">
                  <PickRequestCard />
                </div>
              )}
            </div>
          ))}

          {/* If no requester messages but canTakeRequest is true, show card at end */}
          {/* HYDRATION FIX: Only show after mount since canTakeRequest depends on client session */}
          {isMounted && canTakeRequest && lastRequesterMessageIndex === -1 && messages.length > 0 && (
            <PickRequestCard />
          )}
        </div>
      </div>

      {/* Floating "Scroll to Bottom" button - appears when user scrolls up */}
      {!isOnBottom && messages.length > 0 && (
        <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
          <button
            type="button"
            onClick={() => scrollToBottom(true, true)}
            className="pointer-events-auto bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg rounded-full px-4 py-2 flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
            title="Scroll to bottom"
          >
            <ArrowDown className="h-4 w-4" />
            {newMessagesWhileScrolledUp > 0 ? (
              <span className="text-xs font-medium">
                {newMessagesWhileScrolledUp} new
              </span>
            ) : (
              <span className="text-xs font-medium">
                Scroll to bottom
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
