/**
 * SignalR Real-Time Communication Module
 *
 * Provides SignalR connectivity for real-time features:
 * - Chat messages
 * - Typing indicators
 * - Read receipts
 * - Ticket updates
 * - Task status changes
 * - Remote access signaling
 *
 * Usage:
 * 1. Use RealTimeProvider in your app
 * 2. Use useRealTime() hook for connection management
 * 3. Use useRealTimeChatRoom() hook for chat rooms
 *
 * Example:
 * ```tsx
 * // In layout
 * <RealTimeProvider>
 *   <App />
 * </RealTimeProvider>
 *
 * // In component
 * const { messages, sendMessage } = useRealTimeChatRoom(requestId);
 * ```
 */

// Types
export type {
  ChatMessage,
  SenderInfo,
  TypingIndicator,
  ReadStatusUpdate,
  TicketUpdateEvent,
  TaskStatusChangedEvent,
  TicketListUpdateEvent,
  RemoteAccessEvent,
  NotificationEvent,
} from './types';

// SignalR Manager (low-level)
export {
  signalRManager,
  signalRChat,
  signalRTicket,
  signalRNotification,
  signalRRemoteAccess,
  SignalRState,
  type HubType,
  type ChatRoomHandlers,
  type SignalREventHandlers,
  type InitialStateData,
  type UserTicketListHandlers,
} from './signalr-manager';

// SignalR Context (React)
export {
  SignalRProvider,
  useSignalR,
  useSignalRChatRoom,
  useSignalREnabled,
  type UseSignalRChatRoomOptions,
  type UseSignalRChatRoomResult,
} from './signalr-context';

// Unified Real-Time Provider (recommended)
export {
  RealTimeProvider,
  useRealTime,
  useRealTimeChatRoom,
} from './realtime-provider';

// Connection Status Hook
export {
  useConnectionStatus,
  type ConnectionAlertLevel,
  type UseConnectionStatusOptions,
  type UseConnectionStatusResult,
} from './use-connection-status';

// Remote Access Signaling Hook
export {
  useRemoteAccessSignaling,
  type SignalingState,
  type RemoteAccessSignalingHandlers,
  type UseRemoteAccessSignalingResult,
} from './use-remote-access-signaling';

// Ticket List Real-Time Updates Hook
export {
  useSignalRTicketList,
  type UseSignalRTicketListOptions,
  type UseSignalRTicketListResult,
} from './use-signalr-ticket-list';
