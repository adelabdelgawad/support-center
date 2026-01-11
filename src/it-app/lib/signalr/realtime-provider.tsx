'use client';

/**
 * Real-Time Provider (SignalR)
 *
 * This is the recommended provider to use in the app for real-time functionality.
 *
 * Usage:
 * <RealTimeProvider>
 *   <App />
 * </RealTimeProvider>
 *
 * Then use:
 * const { subscribeToChat, sendMessage } = useRealTime();
 */

import React from 'react';
import { SignalRProvider, useSignalR, useSignalRChatRoom, type UseSignalRChatRoomOptions, type UseSignalRChatRoomResult } from './signalr-context';
import type { ChatRoomHandlers } from './signalr-manager';

/**
 * Real-Time Provider
 *
 * Wraps children with the SignalR provider.
 */
export function RealTimeProvider({ children }: { children: React.ReactNode }) {
  return <SignalRProvider>{children}</SignalRProvider>;
}

/**
 * Unified real-time context value
 */
interface RealTimeContextValue {
  // Connection state
  isConnected: boolean;
  reconnecting: boolean;
  reconnectAttempt: number;
  error: string | null;

  // Actions
  connect: () => Promise<void>;
  disconnect: () => void;
  subscribeToChat: (requestId: string, handlers: ChatRoomHandlers) => Promise<string>;
  unsubscribeFromChat: (requestId: string, subscriptionId?: string) => void;
  sendMessage: (requestId: string, content: string) => string | null;
  sendTypingIndicator: (requestId: string, isTyping: boolean) => void;
  markMessagesAsRead: (requestId: string, messageIds: string[]) => void;

  // Stats
  activeSubscriptions: number;
}

/**
 * Hook to access real-time context (SignalR)
 */
export function useRealTime(): RealTimeContextValue {
  const signalR = useSignalR();
  return {
    isConnected: signalR.isConnected,
    reconnecting: signalR.reconnecting,
    reconnectAttempt: signalR.reconnectAttempt,
    error: signalR.error,
    connect: signalR.connect,
    disconnect: signalR.disconnect,
    subscribeToChat: signalR.subscribeToChat,
    unsubscribeFromChat: signalR.unsubscribeFromChat,
    sendMessage: signalR.sendMessage,
    sendTypingIndicator: signalR.sendTypingIndicator,
    markMessagesAsRead: signalR.markMessagesAsRead,
    activeSubscriptions: signalR.activeSubscriptions,
  };
}

/**
 * Chat room hook
 *
 * Usage:
 * const { messages, isLoading, sendMessage } = useRealTimeChatRoom(requestId);
 */
export function useRealTimeChatRoom(
  requestId: string,
  options: UseSignalRChatRoomOptions = {}
): UseSignalRChatRoomResult {
  return useSignalRChatRoom(requestId, options);
}

export default RealTimeProvider;
