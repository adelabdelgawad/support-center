'use client';

/**
 * SignalR React Context with Feature Flag
 *
 * Provides SignalR connectivity with:
 * - Feature flag to switch between WebSocket and SignalR
 * - Automatic connection on first subscription (lazy)
 * - Connection state management
 * - Room subscription helpers
 *
 * Usage:
 * 1. Wrap app with <SignalRProvider> or use <RealTimeProvider> (auto-selects)
 * 2. Use useSignalR() hook in components
 * 3. Subscribe/unsubscribe to rooms as needed
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import { SessionContext } from '@/components/auth/client-app-wrapper';
import {
  signalRManager,
  SignalRState,
  type ChatRoomHandlers,
  type InitialStateData,
  type SignalREventHandlers,
} from './signalr-manager';
import type {
  ChatMessage,
  TypingIndicator,
  ReadStatusUpdate,
  TicketUpdateEvent,
  TaskStatusChangedEvent,
} from './types';

// Feature flag check
export const useSignalREnabled = (): boolean => {
  return process.env.NEXT_PUBLIC_USE_SIGNALR === 'true';
};

// Context value type
interface SignalRContextValue {
  // Connection state
  state: SignalRState;
  isConnected: boolean;
  reconnecting: boolean;
  reconnectAttempt: number;
  error: string | null;

  // Connection actions
  connect: () => Promise<void>;
  disconnect: () => void;

  // Chat room subscription
  subscribeToChat: (requestId: string, handlers: ChatRoomHandlers) => Promise<string>;
  unsubscribeFromChat: (requestId: string, subscriptionId?: string) => void;

  // Message actions
  sendMessage: (requestId: string, content: string) => string | null;
  sendTypingIndicator: (requestId: string, isTyping: boolean) => void;
  markMessagesAsRead: (requestId: string, messageIds: string[]) => void;

  // Stats
  activeSubscriptions: number;
}

// Create context
const SignalRContext = createContext<SignalRContextValue | undefined>(undefined);

// Provider props
interface SignalRProviderProps {
  children: React.ReactNode;
}

/**
 * SignalR Provider
 *
 * Provides SignalR connectivity for the chat hub.
 * Uses lazy connection - only connects on first subscription.
 */
export function SignalRProvider({ children }: SignalRProviderProps) {
  const sessionContext = useContext(SessionContext);

  const [state, setState] = useState<SignalRState>(SignalRState.DISCONNECTED);
  const [error, setError] = useState<string | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [activeSubscriptions, setActiveSubscriptions] = useState(0);

  const mountedRef = useRef(true);

  // Update subscriptions count
  const updateSubscriptionCount = useCallback(() => {
    setActiveSubscriptions(signalRManager.chat.getActiveSubscriptionsCount());
  }, []);

  // Set up global event handlers
  useEffect(() => {
    console.log('[SignalR-Context] Setting up global event handlers');

    signalRManager.chat.setGlobalHandlers({
      onConnect: () => {
        console.log('%c[SignalR-Context] CONNECTED', 'color: green; font-weight: bold');
        if (mountedRef.current) {
          setState(SignalRState.CONNECTED);
          setError(null);
          setReconnectAttempt(0);
          updateSubscriptionCount();
        }
      },
      onDisconnect: () => {
        console.log('%c[SignalR-Context] DISCONNECTED', 'color: orange; font-weight: bold');
        if (mountedRef.current) {
          setState(SignalRState.DISCONNECTED);
        }
      },
      onReconnecting: (attempt: number) => {
        console.log(`%c[SignalR-Context] RECONNECTING (attempt ${attempt})`, 'color: blue; font-weight: bold');
        if (mountedRef.current) {
          setState(SignalRState.RECONNECTING);
          setReconnectAttempt(attempt);
        }
      },
      onError: (errorMsg: string) => {
        console.error('%c[SignalR-Context] ERROR:', 'color: red; font-weight: bold', errorMsg);
        if (mountedRef.current) {
          setError(errorMsg);
        }
      },
    });

    return () => {
      console.log('[SignalR-Context] Cleaning up event handlers');
      mountedRef.current = false;
    };
  }, [updateSubscriptionCount]);

  // Connect method
  const connect = useCallback(async () => {
    setState(SignalRState.CONNECTING);
    setError(null);

    try {
      await signalRManager.chat.connect();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      setError(message);
      setState(SignalRState.DISCONNECTED);
      throw err;
    }
  }, []);

  // Disconnect method
  const disconnect = useCallback(() => {
    signalRManager.disconnectAll();
    setState(SignalRState.DISCONNECTED);
  }, []);

  // Subscribe to chat room with lazy connection
  const subscribeToChat = useCallback(async (
    requestId: string,
    handlers: ChatRoomHandlers
  ): Promise<string> => {
    console.log(`[SignalR-Context] subscribeToChat for ${requestId.substring(0, 8)}...`);

    // Guard against SSR
    if (typeof window === 'undefined') {
      console.warn('[SignalR-Context] subscribeToChat called during SSR');
      return '';
    }

    // Check authentication
    if (!sessionContext?.user) {
      console.error('[SignalR-Context] User not authenticated');
      setError('Not authenticated');
      throw new Error('User not authenticated');
    }

    // Lazy connection
    if (!signalRManager.chat.isConnected()) {
      console.log('[SignalR-Context] Not connected - initiating lazy connection...');
      try {
        setState(SignalRState.CONNECTING);
        await signalRManager.chat.connect();
        console.log('[SignalR-Context] Lazy connection successful');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Connection failed';
        console.error('[SignalR-Context] Lazy connection failed:', message);
        setError(message);
        setState(SignalRState.DISCONNECTED);
        throw err;
      }
    }

    const subscriptionId = await signalRManager.chat.subscribeToRoom(requestId, handlers);
    updateSubscriptionCount();
    console.log(`[SignalR-Context] Subscription complete (subId: ${subscriptionId})`);
    return subscriptionId;
  }, [sessionContext, updateSubscriptionCount]);

  // Unsubscribe from chat room
  const unsubscribeFromChat = useCallback((requestId: string, subscriptionId?: string) => {
    console.log(`[SignalR-Context] unsubscribeFromChat for ${requestId.substring(0, 8)}...`);
    signalRManager.chat.unsubscribeFromRoom(requestId, subscriptionId);
    updateSubscriptionCount();
  }, [updateSubscriptionCount]);

  // Send message (placeholder - actual sending goes through HTTP API)
  const sendMessage = useCallback((requestId: string, content: string): string | null => {
    // Note: Messages are sent via HTTP POST to persist to database
    // SignalR receives the broadcast after persistence
    console.log('[SignalR-Context] sendMessage called - use HTTP API instead');
    return null;
  }, []);

  // Send typing indicator
  const sendTypingIndicator = useCallback((requestId: string, isTyping: boolean) => {
    signalRManager.chat.sendTypingIndicator(requestId, isTyping);
  }, []);

  // Mark messages as read
  const markMessagesAsRead = useCallback((requestId: string, messageIds: string[]) => {
    signalRManager.chat.markMessagesAsRead(requestId, messageIds);
  }, []);

  // Context value
  const value: SignalRContextValue = {
    state,
    isConnected: state === SignalRState.CONNECTED,
    reconnecting: state === SignalRState.RECONNECTING,
    reconnectAttempt,
    error,
    connect,
    disconnect,
    subscribeToChat,
    unsubscribeFromChat,
    sendMessage,
    sendTypingIndicator,
    markMessagesAsRead,
    activeSubscriptions,
  };

  return (
    <SignalRContext.Provider value={value}>
      {children}
    </SignalRContext.Provider>
  );
}

/**
 * Hook to access SignalR context
 */
export function useSignalR(): SignalRContextValue {
  const context = useContext(SignalRContext);

  if (!context) {
    throw new Error('useSignalR must be used within a SignalRProvider');
  }

  return context;
}

/**
 * Chat room hook with automatic subscription management
 *
 * Usage:
 * const { messages, isLoading, error } = useSignalRChatRoom(requestId, {
 *   onNewMessage: (msg) => console.log('New message:', msg),
 * });
 */
export interface UseSignalRChatRoomOptions {
  enabled?: boolean;
  initialMessages?: ChatMessage[];
  onInitialState?: (data: InitialStateData) => void;
  onNewMessage?: (message: ChatMessage) => void;
  onTypingIndicator?: (data: TypingIndicator) => void;
  onReadStatusUpdate?: (data: ReadStatusUpdate) => void;
  onTicketUpdate?: (data: TicketUpdateEvent) => void;
  onTaskStatusChanged?: (data: TaskStatusChangedEvent) => void;
}

export interface UseSignalRChatRoomResult {
  messages: ChatMessage[];
  isLoading: boolean;
  isConnected: boolean;
  error: string | null;
  latestSequence: number;
  requestInfo: InitialStateData['requestInfo'] | null;
  sendMessage: (content: string, currentUser?: {
    id: string;
    username: string;
    fullName?: string | null;
    email?: string | null;
  }) => string | null;
  updateMessageStatus: (tempId: string, status: 'pending' | 'sent' | 'failed', errorMessage?: string) => void;
  sendTypingIndicator: (isTyping: boolean) => void;
  markAsRead: (messageIds: string[]) => void;
}

export function useSignalRChatRoom(
  requestId: string,
  options: UseSignalRChatRoomOptions = {}
): UseSignalRChatRoomResult {
  const {
    enabled = true,
    initialMessages = [],
    onInitialState,
    onNewMessage,
    onTypingIndicator,
    onReadStatusUpdate,
    onTicketUpdate,
    onTaskStatusChanged,
  } = options;

  const signalR = useSignalR();

  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(initialMessages.length === 0);
  const [latestSequence, setLatestSequence] = useState(0);
  const [requestInfo, setRequestInfo] = useState<InitialStateData['requestInfo'] | null>(null);

  const handlersRef = useRef<ChatRoomHandlers>({});
  const subscriptionIdRef = useRef<string | null>(null);
  // Track the last subscribed requestId to prevent unnecessary re-subscriptions
  const lastSubscribedRequestIdRef = useRef<string | null>(null);
  // Track if initial messages have been applied to prevent re-applying on reference changes
  const initialMessagesAppliedRef = useRef<boolean>(false);

  // Update handlers ref
  useEffect(() => {
    handlersRef.current = {
      onInitialState: (data: InitialStateData) => {
        const sortedMessages = (data.messages || []).sort(
          (a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0)
        );

        // Preserve optimistic (pending) messages that haven't been confirmed yet
        setMessages((prev) => {
          const pendingOptimistic = prev.filter(
            (m) => m.status === 'pending' && m.tempId
          );

          if (pendingOptimistic.length === 0) {
            return sortedMessages;
          }

          // Merge: server messages + pending optimistic messages
          // Filter out any optimistic messages that now exist in server response
          const confirmedIds = new Set(sortedMessages.map(m => m.id));
          const stillPending = pendingOptimistic.filter(
            (m) => !confirmedIds.has(m.id) && !confirmedIds.has(m.tempId || '')
          );

          return [...sortedMessages, ...stillPending];
        });

        setLatestSequence(data.latestSequence);
        setRequestInfo(data.requestInfo);
        setIsLoading(false);
        onInitialState?.(data);
      },

      onNewMessage: (message: ChatMessage) => {
        setMessages((prev) => {
          const exists = prev.some((m) => m.id === message.id);
          if (exists) return prev;

          // Check for optimistic message replacement
          if (message.clientTempId) {
            const optimisticIndex = prev.findIndex(
              (m) => m.tempId === message.clientTempId || m.id === message.clientTempId
            );
            if (optimisticIndex !== -1) {
              const updated = [...prev];
              updated[optimisticIndex] = { ...message, status: 'sent' };
              return updated;
            }
          }

          return [...prev, { ...message, status: 'sent' }];
        });

        if (typeof message.sequenceNumber === 'number') {
          setLatestSequence(message.sequenceNumber);
        }

        onNewMessage?.(message);
      },

      onTypingIndicator: (data: TypingIndicator) => {
        onTypingIndicator?.(data);
      },

      onReadStatusUpdate: (data: ReadStatusUpdate) => {
        // Update message read states in local cache
        if (data.messageIds && data.messageIds.length > 0) {
          setMessages(prevMessages =>
            prevMessages.map(msg =>
              data.messageIds.includes(msg.id)
                ? { ...msg, isRead: true, isReadByCurrentUser: true }
                : msg
            )
          );
        }
        // Call external callback if provided
        onReadStatusUpdate?.(data);
      },

      onTicketUpdate: (data: TicketUpdateEvent) => {
        onTicketUpdate?.(data);
      },

      onTaskStatusChanged: (data: TaskStatusChangedEvent) => {
        onTaskStatusChanged?.(data);
      },
    };
  }, [onInitialState, onNewMessage, onTypingIndicator, onReadStatusUpdate, onTicketUpdate, onTaskStatusChanged]);

  // Subscribe/unsubscribe effect
  useEffect(() => {
    if (!enabled || !requestId) return;

    // CRITICAL: Only re-subscribe if requestId actually changed
    // This prevents infinite loops when initialMessages reference changes
    const shouldSubscribe = lastSubscribedRequestIdRef.current !== requestId;

    let isCancelled = false;

    const subscribe = async () => {
      try {
        const subId = await signalR.subscribeToChat(requestId, handlersRef.current);
        subscriptionIdRef.current = subId;
        lastSubscribedRequestIdRef.current = requestId;

        if (isCancelled && subId) {
          signalR.unsubscribeFromChat(requestId, subId);
          subscriptionIdRef.current = null;
        }
      } catch {
        // Handled by context
      }
    };

    // Only apply initial messages if not already applied for this requestId
    // This prevents infinite loops when initialMessages reference changes
    if (!initialMessagesAppliedRef.current || shouldSubscribe) {
      // Reset state - but preserve any pending optimistic messages
      if (initialMessages.length === 0) {
        setIsLoading(true);
      } else {
        setIsLoading(false);
      }

      setMessages((prev) => {
        const pendingOptimistic = prev.filter(
          (m) => m.status === 'pending' && m.tempId
        );

        const baseMessages = initialMessages.length === 0 ? [] : initialMessages;

        if (pendingOptimistic.length === 0) {
          return baseMessages;
        }

        // Merge baseMessages with pending optimistic messages
        // Filter out any optimistic messages that exist in baseMessages
        const confirmedIds = new Set(baseMessages.map(m => m.id));
        const stillPending = pendingOptimistic.filter(
          (m) => !confirmedIds.has(m.id) && !confirmedIds.has(m.tempId || '')
        );
        return [...baseMessages, ...stillPending];
      });

      setLatestSequence(0);
      initialMessagesAppliedRef.current = true;
    }

    // Only subscribe if this is a new requestId
    if (shouldSubscribe) {
      subscribe();
    }

    return () => {
      isCancelled = true;
      if (subscriptionIdRef.current) {
        signalR.unsubscribeFromChat(requestId, subscriptionIdRef.current);
        subscriptionIdRef.current = null;
        lastSubscribedRequestIdRef.current = null;
        initialMessagesAppliedRef.current = false;
      }
    };
  }, [enabled, requestId, signalR, initialMessages]);

  // Send message with optimistic update
  const sendMessage = useCallback((
    content: string,
    currentUser?: { id: string; username: string; fullName?: string | null; email?: string | null }
  ): string | null => {
    if (!content.trim()) return null;

    // Generate temp ID for optimistic update
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    if (currentUser) {
      const optimisticMessage: ChatMessage = {
        id: tempId,
        requestId,
        senderId: currentUser.id,
        sender: {
          id: currentUser.id,
          username: currentUser.username,
          fullName: currentUser.fullName || null,
          email: currentUser.email || null,
        },
        content: content.trim(),
        sequenceNumber: Date.now(),
        isScreenshot: false,
        screenshotFileName: null,
        isRead: true,
        attachmentCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: null,
        attachments: [],
        tempId,
        status: 'pending',
      };

      setMessages((prev) => [...prev, optimisticMessage]);
    }

    // Note: Actual message sending happens via HTTP POST
    // The optimistic message will be replaced when server broadcasts

    return tempId;
  }, [requestId]);

  // Update message status (for retry/failure handling)
  const updateMessageStatus = useCallback((
    tempId: string,
    status: 'pending' | 'sent' | 'failed',
    errorMessage?: string
  ): void => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.tempId === tempId || m.id === tempId);
      if (idx === -1) {
        return prev;
      }

      // Skip update if status is already the target value (avoid unnecessary re-renders)
      if (prev[idx].status === status) {
        return prev;
      }

      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        status,
        errorMessage,
      };
      return updated;
    });
  }, []);

  // Send typing indicator
  const sendTypingIndicator = useCallback((isTyping: boolean) => {
    signalR.sendTypingIndicator(requestId, isTyping);
  }, [requestId, signalR]);

  // Mark as read - uses HTTP endpoint (source of truth)
  // Backend persists to DB FIRST, then broadcasts via SignalR
  const markAsRead = useCallback(async (_messageIds: string[]) => {
    try {
      // HTTP call to mark-read endpoint (persists + broadcasts via SignalR)
      const response = await fetch(`/api/chat/${requestId}/mark-read`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        console.error('[SignalR:Chat] Failed to mark as read:', await response.text());
      }
    } catch (error) {
      console.error('[SignalR:Chat] Failed to mark as read:', error);
    }
  }, [requestId]);

  return {
    messages,
    isLoading,
    isConnected: signalR.isConnected,
    error: signalR.error,
    latestSequence,
    requestInfo,
    sendMessage,
    updateMessageStatus,
    sendTypingIndicator,
    markAsRead,
  };
}

export default SignalRProvider;
