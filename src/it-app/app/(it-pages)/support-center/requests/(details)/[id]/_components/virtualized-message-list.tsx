"use client";

import { useRef, useEffect, useCallback, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { RightChatMessage, type MessageStatus } from './right-chat-message';
import { LeftChatMessage } from './left-chat-message';
import { PickRequestCard } from './pick-request-card';

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
  fileName?: string | null;
  fileSize?: number | null;
  fileMimeType?: string | null;
  status?: MessageStatus;
  tempId?: string;
}

interface VirtualizedMessageListProps {
  messages: Message[];
  requestId?: string;
  isMobile: boolean;
  onImageLoadStart: (messageId: string) => void;
  onImageLoad: (messageId: string) => void;
  onRetryMessage?: (tempId: string) => void;
  canTakeRequest: boolean;
  lastRequesterMessageIndex: number;
  isMounted: boolean;
}

/**
 * VirtualizedMessageList - High-performance message list with virtualization
 *
 * Features:
 * - Virtual scrolling with @tanstack/react-virtual
 * - Dynamic row heights via measureElement
 * - Overscan: 10 items above/below viewport for smooth scrolling
 * - Supports variable-height messages (text, images, attachments)
 */
export function VirtualizedMessageList({
  messages,
  requestId,
  isMobile,
  onImageLoadStart,
  onImageLoad,
  onRetryMessage,
  canTakeRequest,
  lastRequesterMessageIndex,
  isMounted,
}: VirtualizedMessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout>();

  // ============================================================================
  // VIRTUALIZATION SETUP
  // ============================================================================
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => {
      // Estimated height for a message:
      // - Avatar: 40px (mobile) / 48px (desktop)
      // - Meta row: 24px
      // - Content: 60px (average text)
      // - Spacing: 16px (gap between messages)
      // Total: ~140px (mobile) / ~148px (desktop)
      return isMobile ? 140 : 148;
    },
    overscan: 10, // Render 10 items above/below viewport
    measureElement: (element) => {
      // Measure the actual rendered height for accurate virtualization
      // This handles variable-height messages (images, long text, attachments)
      return element?.getBoundingClientRect().height || 0;
    },
  });

  // ============================================================================
  // SCROLL STATE TRACKING
  // ============================================================================
  const handleScroll = useCallback(() => {
    setIsScrolling(true);

    // Clear previous timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // Reset scrolling state after 150ms of no scroll events
    scrollTimeoutRef.current = setTimeout(() => {
      setIsScrolling(false);
    }, 150);
  }, []);

  // Cleanup scroll timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // ============================================================================
  // RENDER MESSAGE
  // ============================================================================
  const renderMessage = (message: Message, index: number) => {
    const messageComponent = message.isCurrentUser ? (
      <RightChatMessage
        id={message.id}
        requestId={requestId}
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
        onImageLoadStart={onImageLoadStart}
        onImageLoad={onImageLoad}
        createdAt={message.createdAt}
      />
    ) : (
      <LeftChatMessage
        id={message.id}
        requestId={requestId}
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
        onImageLoadStart={onImageLoadStart}
        onImageLoad={onImageLoad}
      />
    );

    return (
      <div key={message.id}>
        {messageComponent}
        {/* Insert PickRequestCard after the last requester message */}
        {index === lastRequesterMessageIndex && (
          <div className="mt-4 md:mt-6">
            <PickRequestCard />
          </div>
        )}
      </div>
    );
  };

  // ============================================================================
  // RENDER
  // ============================================================================
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto bg-background"
      onScroll={handleScroll}
      style={{
        contain: 'strict',
      }}
    >
      <div
        className="relative w-full"
        style={{
          height: `${virtualizer.getTotalSize()}px`,
        }}
      >
        {virtualItems.map((virtualRow) => {
          const message = messages[virtualRow.index];
          const isLastMessage = virtualRow.index === messages.length - 1;

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={(node) => {
                if (node) {
                  virtualizer.measureElement(node);
                }
              }}
              className="absolute left-0 right-0 top-0"
              style={{
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className={`${isMobile ? 'p-3' : 'p-6'}`}>
                <div className={`max-w-4xl mx-auto ${isMobile ? 'space-y-4' : 'space-y-6'}`}>
                  {renderMessage(message, virtualRow.index)}
                </div>
              </div>
            </div>
          );
        })}

        {/* If no requester messages but canTakeRequest is true, show card at end */}
        {/* HYDRATION FIX: Only show after mount since canTakeRequest depends on client session */}
        {isMounted && canTakeRequest && lastRequesterMessageIndex === -1 && messages.length > 0 && (
          <div
            className="absolute left-0 right-0 top-0"
            style={{
              transform: `translateY(${virtualizer.getTotalSize()}px)`,
            }}
          >
            <div className={`${isMobile ? 'p-3' : 'p-6'}`}>
              <div className={`max-w-4xl mx-auto ${isMobile ? 'space-y-4' : 'space-y-6'}`}>
                <PickRequestCard />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
