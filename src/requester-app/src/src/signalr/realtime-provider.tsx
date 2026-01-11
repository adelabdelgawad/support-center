/**
 * Real-Time Provider for Tauri App
 *
 * Provides SignalR-based real-time communication.
 *
 * Usage:
 * <RealTimeProvider>
 *   <App />
 * </RealTimeProvider>
 *
 * Then use:
 * const { messages, sendMessage, updateMessageStatus } = useRealTimeChatRoom(() => requestId);
 */

import {
  type ParentComponent,
  type Accessor,
} from 'solid-js';
import {
  SignalRProvider,
  useSignalRChatRoom,
  type UseSignalRChatRoomOptions,
  type UseSignalRChatRoomResult,
} from './signalr-context';
import type { InitialStateData } from './signalr-manager';
import type { ChatMessage } from '@/types';

/**
 * Check if SignalR is enabled (always true now - WebSocket removed)
 */
export function useRealTimeEnabled(): 'signalr' {
  return 'signalr';
}

/**
 * Real-Time Provider
 *
 * Wraps children with SignalR provider.
 */
export const RealTimeProvider: ParentComponent = (props) => {
  console.log('[RealTime] Using SIGNALR transport');
  return <SignalRProvider>{props.children}</SignalRProvider>;
};

/**
 * Unified chat room options
 */
export interface UseRealTimeChatRoomOptions {
  enabled?: boolean;
  initialMessages?: ChatMessage[];
  onInitialState?: (data: InitialStateData) => void;
  onNewMessage?: (message: ChatMessage) => void;
  onTypingIndicator?: (data: { requestId: string; userId: string; isTyping: boolean }) => void;
  onReadStatusUpdate?: (data: { requestId: string; userId: string; messageIds: string[] }) => void;
  onTicketUpdate?: (data: any) => void;
  onTaskStatusChanged?: (data: any) => void;
}

/**
 * Unified chat room result
 */
export interface UseRealTimeChatRoomResult {
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

/**
 * Unified chat room hook
 *
 * Usage:
 * const { messages, isLoading, sendMessage, updateMessageStatus } = useRealTimeChatRoom(() => requestId);
 */
export function useRealTimeChatRoom(
  requestIdAccessor: Accessor<string> | string,
  options: UseRealTimeChatRoomOptions = {}
): UseRealTimeChatRoomResult {
  const signalROptions: UseSignalRChatRoomOptions = {
    enabled: options.enabled,
    initialMessages: options.initialMessages,
    onInitialState: options.onInitialState,
    onNewMessage: options.onNewMessage,
    onTypingIndicator: options.onTypingIndicator,
    onReadStatusUpdate: options.onReadStatusUpdate,
    onTicketUpdate: options.onTicketUpdate,
    onTaskStatusChanged: options.onTaskStatusChanged,
  };

  const result = useSignalRChatRoom(requestIdAccessor, signalROptions);

  return {
    messages: result.messages,
    isLoading: result.isLoading,
    isConnected: result.isConnected,
    error: result.error,
    latestSequence: result.latestSequence,
    requestInfo: result.requestInfo,
    sendMessage: result.sendMessage,
    updateMessageStatus: result.updateMessageStatus,
    sendTypingIndicator: result.sendTypingIndicator,
    markAsRead: result.markAsRead,
  };
}

export default RealTimeProvider;
