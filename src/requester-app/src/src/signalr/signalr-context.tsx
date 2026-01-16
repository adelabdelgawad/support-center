/**
 * SignalR SolidJS Context with Feature Flag
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

import {
  createContext,
  useContext,
  createSignal,
  createEffect,
  onCleanup,
  type ParentComponent,
  type Accessor,
} from 'solid-js';
import { authStore } from '@/stores/auth-store';
import {
  signalRManager,
  SignalRState,
  type ChatRoomHandlers,
  type InitialStateData,
} from './signalr-manager';
import type { ChatMessage, TypingIndicator, ReadStatusUpdate, TicketUpdateEvent, TaskStatusChangedEvent } from '@/types';
import { logger } from '@/logging';

// Context value type
interface SignalRContextValue {
  // Connection state
  state: Accessor<SignalRState>;
  isConnected: Accessor<boolean>;
  reconnecting: Accessor<boolean>;
  reconnectAttempt: Accessor<number>;
  error: Accessor<string | null>;

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
  activeSubscriptions: Accessor<number>;
}

// Create context
const SignalRContext = createContext<SignalRContextValue>();

/**
 * SignalR Provider
 *
 * Provides SignalR connectivity for the chat hub.
 * Uses lazy connection - only connects on first subscription.
 */
export const SignalRProvider: ParentComponent = (props) => {
  const [state, setState] = createSignal<SignalRState>(SignalRState.DISCONNECTED);
  const [error, setError] = createSignal<string | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = createSignal(0);
  const [activeSubscriptions, setActiveSubscriptions] = createSignal(0);

  // Update subscriptions count
  const updateSubscriptionCount = () => {
    setActiveSubscriptions(signalRManager.chat.getActiveSubscriptionsCount());
  };

  // Set up global event handlers
  createEffect(() => {
    signalRManager.chat.setGlobalHandlers({
      onConnect: () => {
        logger.info('signalr', 'Chat hub connected');
        setState(SignalRState.CONNECTED);
        setError(null);
        setReconnectAttempt(0);
        updateSubscriptionCount();
      },
      onDisconnect: () => {
        logger.warn('signalr', 'Chat hub disconnected');
        setState(SignalRState.DISCONNECTED);
      },
      onReconnecting: (attempt: number) => {
        logger.info('signalr', 'Chat hub reconnecting', { attempt });
        setState(SignalRState.RECONNECTING);
        setReconnectAttempt(attempt);
      },
      onError: (errorMsg: string) => {
        logger.error('signalr', 'Chat hub error', { error: errorMsg });
        setError(errorMsg);
      },
    });

    onCleanup(() => {
      logger.info('signalr', 'Chat hub cleanup');
    });
  });

  // Connect method
  const connect = async () => {
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
  };

  // Disconnect method
  const disconnect = () => {
    signalRManager.disconnectAll();
    setState(SignalRState.DISCONNECTED);
  };

  // Subscribe to chat room with lazy connection
  const subscribeToChat = async (
    requestId: string,
    handlers: ChatRoomHandlers
  ): Promise<string> => {
    // Check authentication - allow brief retry for timing issues during navigation
    // This handles the race condition where chat page mounts before auth state is fully synced
    let authRetries = 0;
    const maxAuthRetries = 3;
    const authRetryDelay = 100; // ms

    while (!authStore.state.user && authRetries < maxAuthRetries) {
      await new Promise(resolve => setTimeout(resolve, authRetryDelay));
      authRetries++;
    }

    if (!authStore.state.user) {
      setError('Not authenticated');
      throw new Error('User not authenticated');
    }

    // Lazy connection
    if (!signalRManager.chat.isConnected()) {
      try {
        setState(SignalRState.CONNECTING);
        await signalRManager.chat.connect();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Connection failed';
        setError(message);
        setState(SignalRState.DISCONNECTED);
        throw err;
      }
    }

    const subscriptionId = await signalRManager.chat.subscribeToRoom(requestId, handlers);
    updateSubscriptionCount();
    return subscriptionId;
  };

  // Unsubscribe from chat room
  const unsubscribeFromChat = (requestId: string, subscriptionId?: string) => {
    signalRManager.chat.unsubscribeFromRoom(requestId, subscriptionId);
    updateSubscriptionCount();
  };

  // Send message (placeholder - actual sending goes through HTTP API)
  const sendMessage = (_requestId: string, _content: string): string | null => {
    // Note: Messages are sent via HTTP POST to persist to database
    // SignalR receives the broadcast after persistence
    return null;
  };

  // Send typing indicator
  const sendTypingIndicator = (requestId: string, isTyping: boolean) => {
    signalRManager.chat.sendTypingIndicator(requestId, isTyping);
  };

  // Mark messages as read
  const markMessagesAsRead = (requestId: string, messageIds: string[]) => {
    signalRManager.chat.markMessagesAsRead(requestId, messageIds);
  };

  // Context value
  const value: SignalRContextValue = {
    state,
    isConnected: () => state() === SignalRState.CONNECTED,
    reconnecting: () => state() === SignalRState.RECONNECTING,
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
      {props.children}
    </SignalRContext.Provider>
  );
};

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
 * const { messages, isLoading, error } = useSignalRChatRoom(() => requestId, {
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
  messages: Accessor<ChatMessage[]>;
  isLoading: Accessor<boolean>;
  isConnected: Accessor<boolean>;
  error: Accessor<string | null>;
  latestSequence: Accessor<number>;
  requestInfo: Accessor<InitialStateData['requestInfo'] | null>;
  sendMessage: (content: string) => string | null;
  updateMessageStatus: (tempId: string, status: 'pending' | 'sent' | 'failed', errorMessage?: string) => void;
  sendTypingIndicator: (isTyping: boolean) => void;
  markAsRead: (messageIds: string[]) => void;
}

export function useSignalRChatRoom(
  requestIdAccessor: Accessor<string> | string,
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

  const [messages, setMessages] = createSignal<ChatMessage[]>(initialMessages);
  const [isLoading, setIsLoading] = createSignal(initialMessages.length === 0);
  const [latestSequence, setLatestSequence] = createSignal(0);
  const [requestInfo, setRequestInfo] = createSignal<InitialStateData['requestInfo'] | null>(null);

  let subscriptionId: string | null = null;

  // Get requestId value (support both accessor and static string)
  const getRequestId = () => typeof requestIdAccessor === 'function' ? requestIdAccessor() : requestIdAccessor;

  // Create handlers
  const handlers: ChatRoomHandlers = {
    onInitialState: (data: InitialStateData) => {
      const sortedMessages = (data.messages || []).sort(
        (a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0)
      );

      // FIX: Preserve optimistic (pending) messages that haven't been confirmed yet
      // This matches IT app behavior and prevents message disappearance on reconnect
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
        if (exists) {
          return prev;
        }

        // Check for optimistic message replacement
        if (message.clientTempId) {
          const optimisticIndex = prev.findIndex(
            (m) => m.tempId === message.clientTempId || m.id === message.clientTempId
          );
          if (optimisticIndex !== -1) {
            const updated = [...prev];
            const optimistic = prev[optimisticIndex];
            // FIX: Preserve optimistic sequenceNumber and createdAt to prevent reordering
            // When server confirms, its values may differ (clock skew, race conditions)
            // Preserving optimistic values keeps message in user's expected position
            // This prevents: 1) message jumping in list, 2) scroll position reset
            updated[optimisticIndex] = {
              ...message,
              // Preserve optimistic values to prevent reordering and scroll jump
              id: optimistic.id,
              sequenceNumber: optimistic.sequenceNumber,
              createdAt: optimistic.createdAt,
              // Store server values for any API calls that need them
              serverId: message.id,
              serverSequenceNumber: message.sequenceNumber,
              serverCreatedAt: message.createdAt,
              status: 'sent',
              tempId: optimistic.tempId
            };
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
      onReadStatusUpdate?.(data);
    },

    onTicketUpdate: (data: TicketUpdateEvent) => {
      onTicketUpdate?.(data);
    },

    onTaskStatusChanged: (data: TaskStatusChangedEvent) => {
      onTaskStatusChanged?.(data);
    },
  };

  // Subscribe/unsubscribe effect
  createEffect(() => {
    const requestId = getRequestId();
    if (!enabled || !requestId) return;

    // Reset state
    if (initialMessages.length === 0) {
      setIsLoading(true);
      setMessages([]);
    } else {
      setIsLoading(false);
      setMessages(initialMessages);
    }
    setLatestSequence(0);

    // Subscribe
    signalR.subscribeToChat(requestId, handlers)
      .then((subId) => {
        subscriptionId = subId;
      })
      .catch((err) => {
        console.error('[useSignalRChatRoom] Subscription failed:', err);
      });

    // Cleanup on effect re-run or unmount
    onCleanup(() => {
      if (subscriptionId) {
        signalR.unsubscribeFromChat(requestId, subscriptionId);
        subscriptionId = null;
      }
    });
  });

  // Send message with optimistic update
  const sendMessage = (content: string): string | null => {
    if (!content.trim()) return null;

    const requestId = getRequestId();
    const user = authStore.state.user;

    // Generate temp ID for optimistic update
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    if (user) {
      // FIX: Use latestSequence + 1 instead of Date.now() to prevent sort order change
      // When server confirms with real sequence, it will be same/similar value
      // Date.now() caused huge sequence numbers that would reorder when replaced
      const optimisticSequence = latestSequence() + 1;

      const optimisticMessage: ChatMessage = {
        id: tempId,
        requestId,
        senderId: String(user.id),
        sender: {
          id: String(user.id),
          username: user.username,
          fullName: user.fullName,
          isTechnician: user.isTechnician,
        },
        content: content.trim(),
        sequenceNumber: optimisticSequence,
        isScreenshot: false,
        screenshotFileName: undefined,
        isReadByCurrentUser: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tempId,
        status: 'pending',
      };

      // Update latest sequence for next optimistic message
      setLatestSequence(optimisticSequence);
      setMessages((prev) => [...prev, optimisticMessage]);
    }

    // Note: Actual message sending happens via HTTP POST
    // The optimistic message will be replaced when server broadcasts

    return tempId;
  };

  // Send typing indicator
  const sendTypingIndicator = (isTyping: boolean) => {
    const requestId = getRequestId();
    signalR.sendTypingIndicator(requestId, isTyping);
  };

  // Update message status (for retry/failure handling)
  const updateMessageStatus = (
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
  };

  // Mark as read - uses HTTP endpoint (source of truth)
  // Backend persists to DB FIRST, then broadcasts via SignalR
  const markAsRead = async (_messageIds: string[]) => {
    const requestId = getRequestId();
    try {
      // Import and call HTTP API for mark-read
      const { markMessagesAsRead } = await import('@/api/messages');
      await markMessagesAsRead(requestId);
    } catch (error) {
      console.error('[SignalR:Chat] Failed to mark as read:', error);
    }
  };

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
