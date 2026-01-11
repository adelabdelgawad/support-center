/**
 * SignalR Real-Time Communication Module for Tauri App
 *
 * Provides SignalR connectivity for real-time features:
 * - Chat messages
 * - Typing indicators
 * - Read receipts
 * - Ticket updates
 * - Task status changes
 * - Desktop notifications
 * - Remote access signaling
 *
 * Feature Flag:
 * Set VITE_USE_SIGNALR=true to enable SignalR transport.
 * When false (default), uses WebSocket transport.
 *
 * Usage:
 * 1. Use RealTimeProvider in your app (auto-selects transport)
 * 2. Use useRealTime() hook for connection management
 * 3. Use useRealTimeChatRoom() hook for chat rooms
 *
 * Example:
 * ```tsx
 * // In App.tsx
 * <RealTimeProvider>
 *   <App />
 * </RealTimeProvider>
 *
 * // In component
 * const { messages, sendMessage } = useRealTimeChatRoom(() => requestId);
 * ```
 */

// SignalR Manager (low-level)
export {
  signalRManager,
  signalRChat,
  signalRNotification,
  signalRRemoteAccess,
  SignalRState,
  type HubType,
  type ChatRoomHandlers,
  type SignalREventHandlers,
  type InitialStateData,
  type NotificationHandlers,
} from './signalr-manager';

// SignalR Context (SolidJS)
export {
  SignalRProvider,
  useSignalR,
  useSignalRChatRoom,
  type UseSignalRChatRoomOptions,
  type UseSignalRChatRoomResult,
} from './signalr-context';

// Unified Real-Time Provider (recommended)
export {
  RealTimeProvider,
  useRealTimeChatRoom,
  useRealTimeEnabled,
  type UseRealTimeChatRoomOptions,
  type UseRealTimeChatRoomResult,
} from './realtime-provider';

// Notification SignalR Context
export {
  NotificationSignalRProvider,
  NotificationSignalRContext,
  useNotificationSignalR,
} from './notification-signalr-context';
