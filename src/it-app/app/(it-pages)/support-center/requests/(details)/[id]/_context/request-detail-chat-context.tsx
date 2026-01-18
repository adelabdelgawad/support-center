'use client';

/**
 * Request Detail Chat Context
 * Provides chat messages and real-time messaging via SignalR
 *
 * Split from monolithic RequestDetailProvider to prevent unnecessary re-renders
 * when metadata changes.
 */

import { createContext, useContext, useMemo, useCallback, useState, useRef, useEffect } from 'react';
import { useSignalRChatRoom, useConnectionStatus } from '@/lib/signalr';
import { useChatMutations } from '@/lib/hooks/use-chat-mutations';
import type { ChatMessage } from '@/lib/signalr/types';
import type { ScreenshotItem } from '@/types/media-viewer';
import type { AttachmentUploadResponse, AttachmentUploadResult } from '@/lib/hooks/use-chat-mutations';
import type { RequestDetailMetadataContextType } from './request-detail-metadata-context';

// Helper function to generate initials
function getInitials(name: string | null | undefined): string {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

export interface RequestDetailChatContextType {
  // Messages (WebSocket-managed)
  messages: ChatMessage[];
  messagesLoading: boolean;

  // Chat mutations
  sendMessage: (content: string) => Promise<void>;
  sendAttachmentMessage: (uploadResult: AttachmentUploadResult) => Promise<void>;
  retryMessage: (tempId: string) => void;
  discardFailedMessage: (tempId: string) => void;
  uploadAttachments: (files: File[]) => Promise<AttachmentUploadResponse | null>;
  sendingMessage: boolean;
  uploadingAttachment: boolean;

  // SignalR connection status
  isSignalRConnected: boolean;
  connectionAlertLevel: 'none' | 'info' | 'warning' | 'error';

  // Media Viewer (for screenshot viewing)
  mediaViewerOpen: boolean;
  mediaViewerIndex: number;
  screenshots: ScreenshotItem[];
  openMediaViewer: (screenshotFilename: string) => void;
  closeMediaViewer: () => void;
  navigateMediaViewer: (direction: 'next' | 'prev') => void;
  setMediaViewerIndex: (index: number) => void;

  // Messaging permissions
  messagingPermission: {
    canMessage: boolean;
    reason?: string;
    isAssignee: boolean;
    isRequester: boolean;
  };

  // Chat reload warning
  chatNeedsReload: boolean;
  dismissReloadWarning: () => void;
}

const RequestDetailChatContext = createContext<RequestDetailChatContextType | undefined>(undefined);

interface RequestDetailChatProviderProps {
  children: React.ReactNode;
  requestId: string;
  initialMessages: ChatMessage[];
  currentUserId?: string;
  currentUser?: {
    id: string;
    username: string;
    fullName?: string | null;
    email?: string | null;
  };
  messagingPermission: RequestDetailMetadataContextType['messagingPermission'];
  ticketSolved: boolean;
  scrollHandlerRef: React.MutableRefObject<(() => void) | null>;
  forceScrollHandlerRef: React.MutableRefObject<(() => void) | null>;
}

export function RequestDetailChatProvider({
  children,
  requestId,
  initialMessages,
  currentUserId,
  currentUser,
  messagingPermission,
  ticketSolved,
  scrollHandlerRef,
  forceScrollHandlerRef,
}: RequestDetailChatProviderProps) {
  // **WEBSOCKET CALLBACKS** - Memoized to prevent unnecessary re-renders
  const handleNewMessage = useCallback((message: any) => {
    // New message received - metadata updates handled by parent
  }, []);

  const handleReadStatusUpdate = useCallback((data: any) => {
    console.log('[ChatContext] ReadStatusUpdate received:', data);
  }, []);

  // CRITICAL FIX: Use refs to access current values to keep callback stable
  const handleTaskStatusChanged = useCallback(async (event: any) => {
    // Metadata updates handled by parent context via its own refs
    console.log('[ChatContext] TaskStatusChanged received:', event);
  }, []);

  // Memoized callback for onNewMessage to prevent infinite re-subscription loops
  const handleNewMessageWithScroll = useCallback((message: any) => {
    handleNewMessage(message);
    // Trigger scroll for new messages
    scrollHandlerRef.current?.();
  }, [handleNewMessage, scrollHandlerRef]);

  // **SIGNALR FOR REAL-TIME CHAT**
  const {
    isConnected: isSignalRConnected,
    isLoading: messagesLoading,
    messages,
    error: signalRError,
    sendMessage: sendChatMessageSignalR,
    updateMessageStatus,
    sendTypingIndicator,
    markAsRead,
  } = useSignalRChatRoom(requestId, {
    enabled: !ticketSolved, // Skip SignalR for solved tickets
    initialMessages,
    onNewMessage: handleNewMessageWithScroll,
    onReadStatusUpdate: handleReadStatusUpdate,
    onTaskStatusChanged: handleTaskStatusChanged,
  });

  // Wrapper for sendMessage to match previous API
  const sendChatMessage = useCallback((content: string) => {
    const tempId = sendChatMessageSignalR(content, currentUser ? {
      id: currentUser.id,
      username: currentUser.username,
      fullName: currentUser.fullName,
      email: currentUser.email,
    } : undefined);

    // CRITICAL: Trigger force scroll after optimistic message is added
    if (tempId) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          forceScrollHandlerRef.current?.();
        });
      });
    }

    return tempId;
  }, [sendChatMessageSignalR, currentUser, forceScrollHandlerRef]);

  // Chat needs reload state (based on SignalR error)
  const chatNeedsReload = !!signalRError;

  // Dismiss reload warning - SignalR will auto-reconnect
  const dismissReloadWarning = useCallback(() => {
    // No-op: SignalR handles reconnection automatically
  }, []);

  // **CONNECTION STATUS WITH GRACE PERIOD**
  const { alertLevel: connectionAlertLevel } = useConnectionStatus({
    isConnected: isSignalRConnected,
    gracePeriod: 5000,
    warningPeriod: 15000,
    errorPeriod: 30000,
    initialLoadGrace: 8000,
  });

  // **CHAT MUTATIONS ERROR HANDLER**
  const handleChatMutationError = useCallback((error: Error) => {
    console.error('❌ Chat mutation error:', error);
  }, []);

  // **CHAT MUTATIONS**
  const {
    isSending: sendingMessage,
    isUploading: uploadingAttachment,
    sendMessage,
    sendAttachmentMessage,
    retryMessage: retryMessageMutation,
    discardFailedMessage,
    uploadAttachments,
  } = useChatMutations({
    requestId,
    currentUserId,
    currentUser,
    messagingPermission,
    sendChatMessageViaWebSocket: sendChatMessage,
    updateMessageStatus,
    onError: handleChatMutationError,
  });

  // **RETRY MESSAGE ACTION**
  const retryMessage = useCallback((tempId: string) => {
    console.log('[ChatContext] Retrying message:', tempId);
    retryMessageMutation(tempId).catch((err) => {
      console.error('[ChatContext] Retry failed:', err);
    });
  }, [retryMessageMutation]);

  // **MEDIA VIEWER STATE**
  const [mediaViewerOpen, setMediaViewerOpen] = useState(false);
  const [mediaViewerIndex, setMediaViewerIndex] = useState(0);

  // Derive screenshots array from messages (memoized)
  const screenshots = useMemo<ScreenshotItem[]>(() => {
    return messages
      .filter((msg) => msg.isScreenshot && msg.screenshotFileName)
      .map((msg) => ({
        id: msg.id,
        filename: msg.screenshotFileName!,
        url: `/api/screenshots/by-filename/${msg.screenshotFileName}`,
        timestamp: msg.createdAt,
        sender: {
          name: msg.sender?.fullName || msg.sender?.username || 'Unknown',
          initials: getInitials(msg.sender?.fullName || msg.sender?.username || 'U'),
        },
        messageContent: msg.content !== 'Screenshot' ? msg.content : undefined,
        sequenceNumber: msg.sequenceNumber,
      }))
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  }, [messages]);

  // Handler to open viewer at specific screenshot
  const openMediaViewer = useCallback((screenshotFilename: string) => {
    const index = screenshots.findIndex((s) => s.filename === screenshotFilename);
    if (index !== -1) {
      setMediaViewerIndex(index);
      setMediaViewerOpen(true);
    }
  }, [screenshots]);

  // Close handler
  const closeMediaViewer = useCallback(() => {
    setMediaViewerOpen(false);
  }, []);

  // Navigation handler
  const navigateMediaViewer = useCallback((direction: 'next' | 'prev') => {
    setMediaViewerIndex((current) => {
      if (direction === 'next') {
        return current < screenshots.length - 1 ? current + 1 : current;
      } else {
        return current > 0 ? current - 1 : current;
      }
    });
  }, [screenshots.length]);

  const value: RequestDetailChatContextType = useMemo(
    () => ({
      messages,
      messagesLoading,
      sendMessage,
      sendAttachmentMessage,
      retryMessage,
      discardFailedMessage,
      uploadAttachments,
      sendingMessage,
      uploadingAttachment,
      isSignalRConnected,
      connectionAlertLevel,
      mediaViewerOpen,
      mediaViewerIndex,
      screenshots,
      openMediaViewer,
      closeMediaViewer,
      navigateMediaViewer,
      setMediaViewerIndex,
      messagingPermission: messagingPermission || {
        canMessage: false,
        reason: 'User not authenticated',
        isAssignee: false,
        isRequester: false,
      },
      chatNeedsReload,
      dismissReloadWarning,
    }),
    [
      messages,
      messagesLoading,
      sendMessage,
      sendAttachmentMessage,
      retryMessage,
      discardFailedMessage,
      uploadAttachments,
      sendingMessage,
      uploadingAttachment,
      isSignalRConnected,
      connectionAlertLevel,
      mediaViewerOpen,
      mediaViewerIndex,
      screenshots,
      openMediaViewer,
      closeMediaViewer,
      navigateMediaViewer,
      setMediaViewerIndex,
      messagingPermission,
      chatNeedsReload,
      dismissReloadWarning,
    ]
  );

  return (
    <RequestDetailChatContext.Provider value={value}>
      {children}
    </RequestDetailChatContext.Provider>
  );
}

export function useRequestDetailChat() {
  const context = useContext(RequestDetailChatContext);
  if (context === undefined) {
    throw new Error('useRequestDetailChat must be used within a RequestDetailChatProvider');
  }
  return context;
}
