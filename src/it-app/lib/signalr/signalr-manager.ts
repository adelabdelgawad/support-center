/**
 * SignalR Connection Manager
 *
 * Manages connections to SignalR hubs for real-time communication.
 * Supports multiple hubs: Chat, Ticket, Notification, RemoteAccess
 *
 * Features:
 * - Lazy connection (connects on first subscription)
 * - Automatic reconnection with exponential backoff
 * - JWT authentication via access_token query string
 * - Room/group subscription management
 * - Event handlers for different message types
 */

import * as signalR from '@microsoft/signalr';
import { getUnifiedAccessToken, getUnifiedSessionAsync } from '@/lib/utils/auth-storage';
import type {
  ChatMessage,
  TypingIndicator,
  ReadStatusUpdate,
  TicketUpdateEvent,
  TaskStatusChangedEvent,
} from './types';

// Connection states
export enum SignalRState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
}

// Hub types available
export type HubType = 'chat' | 'ticket' | 'notification' | 'remote-access';

// Initial state data from server
export interface InitialStateData {
  requestId: string;
  messages: ChatMessage[];
  totalCount: number;
  hasMore: boolean;
  latestSequence: number;
  requestInfo: {
    id: string;
    title: string;
    description: string;
    statusId: number;
    statusName: string | null;
    priorityId: number;
    requesterId: string;
    createdAt: string;
  } | null;
}

// Handler types for chat room events
export interface ChatRoomHandlers {
  onInitialState?: (data: InitialStateData) => void;
  onNewMessage?: (message: ChatMessage) => void;
  onTypingIndicator?: (data: TypingIndicator) => void;
  onReadStatusUpdate?: (data: ReadStatusUpdate) => void;
  onTicketUpdate?: (data: TicketUpdateEvent) => void;
  onTaskStatusChanged?: (data: TaskStatusChangedEvent) => void;
}

// Global event handlers
export interface SignalREventHandlers {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onReconnecting?: (attempt: number) => void;
  onError?: (error: string) => void;
}

/**
 * SignalR Hub Connection Manager
 *
 * Manages a single hub connection with room subscriptions.
 */
class SignalRHubManager {
  private connection: signalR.HubConnection | null = null;
  private hubType: HubType;
  private state: SignalRState = SignalRState.DISCONNECTED;
  private userId: string | null = null;

  // Room subscriptions: roomId -> Map<subscriptionId, handlers>
  private subscriptions: Map<string, Map<string, ChatRoomHandlers>> = new Map();
  private subscriptionIdCounter = 0;

  // Global event handlers
  private globalHandlers: SignalREventHandlers = {};

  // Reconnection tracking
  private reconnectAttempts = 0;

  // Connection promise for awaiting
  private connectionPromise: Promise<void> | null = null;

  constructor(hubType: HubType) {
    this.hubType = hubType;
  }

  /**
   * Get current connection state
   */
  getState(): SignalRState {
    return this.state;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === SignalRState.CONNECTED &&
      this.connection?.state === signalR.HubConnectionState.Connected;
  }

  /**
   * Wait for connected state (with timeout)
   * Returns true if connected, false if timeout or disconnected
   */
  async waitForConnected(timeoutMs: number = 5000): Promise<boolean> {
    // Already connected
    if (this.isConnected()) {
      return true;
    }

    // If there's an ongoing connection, wait for it
    if (this.connectionPromise) {
      try {
        await this.connectionPromise;
        // After connection resolves, verify the actual state
        if (this.isConnected()) {
          return true;
        }
      } catch {
        return false;
      }
    }

    // Poll for connection state (handles edge case where state updates async)
    const startTime = Date.now();
    const pollInterval = 50;

    while (Date.now() - startTime < timeoutMs) {
      if (this.isConnected()) {
        return true;
      }
      if (this.state === SignalRState.DISCONNECTED) {
        return false;
      }
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    console.warn(`[SignalR:${this.hubType}] waitForConnected timed out after ${timeoutMs}ms`);
    return false;
  }

  /**
   * Get active subscriptions count
   */
  getActiveSubscriptionsCount(): number {
    return this.subscriptions.size;
  }

  /**
   * Set global event handlers
   */
  setGlobalHandlers(handlers: SignalREventHandlers): void {
    this.globalHandlers = handlers;
  }

  /**
   * Get SignalR base URL based on environment
   */
  private getBaseUrl(): string {
    if (typeof window === 'undefined') {
      return process.env.NEXT_PUBLIC_SIGNALR_URL || 'https://supportcenter.andalusiagroup.net/signalr';
    }

    // Client-side: use environment variable or auto-detect
    const envUrl = process.env.NEXT_PUBLIC_SIGNALR_URL;
    if (envUrl) {
      return envUrl;
    }

    // Auto-detect based on current page
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const host = window.location.hostname;
    const port = window.location.protocol === 'https:'
      ? (window.location.port || '443')
      : '5000'; // SignalR default port

    return `${protocol}//${host}:${port}/signalr`;
  }

  /**
   * Connect to the SignalR hub
   */
  async connect(): Promise<void> {
    // Already connected
    if (this.isConnected()) {
      return;
    }

    // Already connecting - wait for existing promise
    if (this.state === SignalRState.CONNECTING && this.connectionPromise) {
      return this.connectionPromise;
    }

    // Set state immediately to prevent race conditions
    this.state = SignalRState.CONNECTING;

    // Create connection promise that handles auth and connection
    this.connectionPromise = (async () => {
      try {
        // Get access token
        const token = await getUnifiedAccessToken();
        if (!token) {
          throw new Error('Not authenticated');
        }

        // Get user info
        const session = await getUnifiedSessionAsync();
        if (!session.user?.id) {
          throw new Error('User not authenticated');
        }

        this.userId = String(session.user.id);

        const baseUrl = this.getBaseUrl();
        const hubUrl = `${baseUrl}/hubs/${this.hubType}`;

        console.log(`[SignalR:${this.hubType}] Connecting to ${hubUrl}`);

        // Build connection with JWT auth
        // SECURITY (Finding #16): Token is passed in query string (visible in network tab)
        // ARCHITECTURAL CHANGE REQUIRED — DO NOT REFACTOR INLINE
        // Future: Use httpOnly cookie-based auth or SignalR's negotiate endpoint
        this.connection = new signalR.HubConnectionBuilder()
          .withUrl(hubUrl, {
            accessTokenFactory: () => token,
          })
          .withAutomaticReconnect({
            nextRetryDelayInMilliseconds: (retryContext) => {
              const delay = Math.min(
                1000 * Math.pow(2, retryContext.previousRetryCount),
                30000
              );
              console.log(`[SignalR:${this.hubType}] Reconnecting in ${delay}ms`);
              return delay;
            },
          })
          .configureLogging(signalR.LogLevel.Information)
          .build();

        // Set up event handlers
        this.setupEventHandlers();

        // Connect
        await this.connection.start();

        this.state = SignalRState.CONNECTED;
        this.reconnectAttempts = 0;

        console.log(`%c[SignalR:${this.hubType}] Connected`, 'color: green; font-weight: bold');
        this.globalHandlers.onConnect?.();

        // Rejoin all rooms
        this.rejoinAllRooms();
      } catch (error) {
        this.state = SignalRState.DISCONNECTED;
        this.connectionPromise = null;
        console.error(`[SignalR:${this.hubType}] Connection failed:`, error);
        throw error;
      }
    })();

    return this.connectionPromise;
  }

  /**
   * Set up SignalR event handlers
   */
  private setupEventHandlers(): void {
    if (!this.connection) return;

    // Reconnecting
    this.connection.onreconnecting((error) => {
      this.state = SignalRState.RECONNECTING;
      this.reconnectAttempts++;
      console.log(`[SignalR:${this.hubType}] Reconnecting (attempt ${this.reconnectAttempts})...`);
      this.globalHandlers.onReconnecting?.(this.reconnectAttempts);
    });

    // Reconnected
    this.connection.onreconnected((connectionId) => {
      this.state = SignalRState.CONNECTED;
      this.reconnectAttempts = 0;
      console.log(`%c[SignalR:${this.hubType}] Reconnected`, 'color: green; font-weight: bold');
      this.globalHandlers.onConnect?.();

      // Rejoin all rooms after reconnect
      this.rejoinAllRooms();
    });

    // Closed
    this.connection.onclose((error) => {
      this.state = SignalRState.DISCONNECTED;
      console.log(`[SignalR:${this.hubType}] Disconnected${error ? ': ' + error : ''}`);
      this.globalHandlers.onDisconnect?.();
    });

    // Message handlers
    this.connection.on('InitialState', (data: InitialStateData) => {
      console.log(`[SignalR:${this.hubType}] InitialState for ${data.requestId?.substring(0, 8)}...`);
      this.routeToHandlers(data.requestId, 'onInitialState', data);
    });

    this.connection.on('ReceiveMessage', (message: ChatMessage) => {
      console.log('%c[SignalR:Manager] 📨 ReceiveMessage from WebSocket', 'color: #ff00ff; font-weight: bold', {
        requestId: message.requestId,
        messageId: message.id,
        senderId: message.senderId,
        senderUsername: message.sender?.username,
        content: message.content?.substring(0, 50),
        sequenceNumber: message.sequenceNumber,
        timestamp: new Date().toISOString(),
      });
      this.routeToHandlers(message.requestId, 'onNewMessage', message);
    });

    this.connection.on('TypingIndicator', (data: TypingIndicator) => {
      const requestId = (data as any).requestId;
      if (requestId) {
        this.routeToHandlers(requestId, 'onTypingIndicator', data);
      }
    });

    this.connection.on('ReadStatusUpdate', (data: ReadStatusUpdate) => {
      const requestId = (data as any).requestId;
      if (requestId) {
        this.routeToHandlers(requestId, 'onReadStatusUpdate', data);
      }
    });

    this.connection.on('TicketUpdate', (data: TicketUpdateEvent) => {
      const requestId = (data as any).request_id || (data as any).requestId;
      if (requestId) {
        this.routeToHandlers(requestId, 'onTicketUpdate', data);
      }
    });

    this.connection.on('TaskStatusChanged', (data: TaskStatusChangedEvent) => {
      const requestId = (data as any).requestId;
      if (requestId) {
        this.routeToHandlers(requestId, 'onTaskStatusChanged', data);
      }
    });

    // Room join/leave confirmations from server
    this.connection.on('RoomJoined', (requestId: string) => {
      console.log(`[SignalR:${this.hubType}] Room joined confirmation for ${requestId?.substring(0, 8)}...`);
    });

    this.connection.on('RoomLeft', (requestId: string) => {
      console.log(`[SignalR:${this.hubType}] Room left confirmation for ${requestId?.substring(0, 8)}...`);
    });
  }

  /**
   * Route message to registered handlers for a room
   */
  private routeToHandlers<K extends keyof ChatRoomHandlers>(
    roomId: string,
    handlerName: K,
    data: Parameters<NonNullable<ChatRoomHandlers[K]>>[0]
  ): void {
    const handlers = this.subscriptions.get(roomId);

    console.log('%c[SignalR:Manager] 🔀 routeToHandlers', 'color: #cc00ff', {
      roomId,
      handlerName,
      hasHandlers: !!handlers,
      handlerCount: handlers?.size || 0,
      allSubscribedRooms: Array.from(this.subscriptions.keys()),
    });

    if (!handlers) {
      console.warn('%c[SignalR:Manager] ⚠️ No handlers found for room', 'color: #ff6600; font-weight: bold', {
        roomId,
        handlerName,
        availableRooms: Array.from(this.subscriptions.keys()),
      });
      return;
    }

    handlers.forEach((handler, index) => {
      const fn = handler[handlerName];
      console.log(`%c[SignalR:Manager] 🎯 Calling handler ${index + 1}/${handlers.size}`, 'color: #9900ff', {
        handlerName,
        hasFunction: !!fn,
      });

      if (fn) {
        try {
          (fn as (data: unknown) => void)(data);
          console.log(`%c[SignalR:Manager] ✅ Handler ${index + 1} executed successfully`, 'color: #00cc00');
        } catch (error) {
          console.error(`[SignalR:${this.hubType}] Handler error (${handlerName}):`, error);
        }
      } else {
        console.warn(`%c[SignalR:Manager] ⚠️ Handler ${index + 1} missing ${handlerName}`, 'color: #ff9900');
      }
    });
  }

  /**
   * Disconnect from the hub
   */
  disconnect(): void {
    if (this.connection) {
      this.connection.stop().catch(console.error);
      this.connection = null;
    }

    this.state = SignalRState.DISCONNECTED;
    this.subscriptions.clear();
    this.userId = null;
  }

  /**
   * Subscribe to a room (join group)
   * Returns a subscription ID for later unsubscription
   */
  async subscribeToRoom(roomId: string, handlers: ChatRoomHandlers): Promise<string> {
    console.log('%c[SignalR:Manager] 🚪 subscribeToRoom requested', 'color: #0099ff; font-weight: bold', {
      roomId,
      currentlyConnected: this.isConnected(),
      connectionState: this.connection?.state,
      handlerKeys: Object.keys(handlers).filter(k => handlers[k as keyof ChatRoomHandlers]),
    });

    // Connect if not already connected
    if (!this.isConnected()) {
      console.log('%c[SignalR:Manager] 🔌 Not connected, initiating connection...', 'color: #ff9900');
      await this.connect();
    }

    // Generate subscription ID
    const subscriptionId = `sub_${++this.subscriptionIdCounter}_${Date.now()}`;

    // Add handlers
    if (!this.subscriptions.has(roomId)) {
      this.subscriptions.set(roomId, new Map());
    }
    this.subscriptions.get(roomId)!.set(subscriptionId, handlers);

    console.log('%c[SignalR:Manager] 📝 Handlers registered locally', 'color: #00cc00', {
      roomId,
      subscriptionId,
      totalSubscriptionsForRoom: this.subscriptions.get(roomId)!.size,
      allSubscribedRooms: Array.from(this.subscriptions.keys()),
    });

    // Join room on server - verify connection state before invoking
    if (this.connection && this.connection.state === signalR.HubConnectionState.Connected) {
      try {
        console.log('%c[SignalR:Manager] 🔄 Invoking JoinRoom on server...', 'color: #00ccff', { roomId });
        await this.connection.invoke('JoinRoom', roomId);
        console.log('%c[SignalR:Manager] ✅ Successfully joined room on server', 'color: #00ff00; font-weight: bold', { roomId, subscriptionId });
      } catch (error) {
        console.error(`%c[SignalR:${this.hubType}] ❌ Failed to join room:`, 'color: #ff0000; font-weight: bold', error);
        // Don't throw - handlers are registered, room will be joined on reconnect
      }
    } else {
      console.warn(`%c[SignalR:${this.hubType}] ⚠️ Connection not ready, room will be joined on connect`, 'color: #ff9900', {
        roomId,
        connectionState: this.connection?.state,
      });
    }

    return subscriptionId;
  }

  /**
   * Unsubscribe from a room
   */
  unsubscribeFromRoom(roomId: string, subscriptionId?: string): void {
    const handlerMap = this.subscriptions.get(roomId);
    if (!handlerMap) return;

    if (subscriptionId) {
      handlerMap.delete(subscriptionId);
    } else {
      handlerMap.clear();
    }

    // If no handlers left, leave room on server
    if (handlerMap.size === 0) {
      this.subscriptions.delete(roomId);

      if (this.isConnected() && this.connection) {
        this.connection.invoke('LeaveRoom', roomId).catch((error) => {
          console.error(`[SignalR:${this.hubType}] Failed to leave room:`, error);
        });
      }
    }
  }

  /**
   * Rejoin all rooms after reconnection
   */
  private rejoinAllRooms(): void {
    if (!this.connection || this.subscriptions.size === 0) return;

    console.log(`[SignalR:${this.hubType}] Rejoining ${this.subscriptions.size} rooms...`);

    for (const roomId of this.subscriptions.keys()) {
      this.connection.invoke('JoinRoom', roomId).catch((error) => {
        console.error(`[SignalR:${this.hubType}] Failed to rejoin room ${roomId}:`, error);
      });
    }
  }

  /**
   * Invoke a hub method
   */
  async invoke<T = void>(method: string, ...args: any[]): Promise<T> {
    if (!this.isConnected() || !this.connection) {
      throw new Error('Not connected to SignalR');
    }

    return this.connection.invoke<T>(method, ...args);
  }

  /**
   * Send typing indicator
   */
  sendTypingIndicator(roomId: string, isTyping: boolean): void {
    if (!this.isConnected() || !this.connection) return;

    this.connection.invoke('SendTyping', roomId, isTyping).catch((error) => {
      console.error(`[SignalR:${this.hubType}] Failed to send typing:`, error);
    });
  }

  /**
   * Mark messages as read
   */
  markMessagesAsRead(roomId: string, messageIds: string[]): void {
    if (!this.isConnected() || !this.connection || messageIds.length === 0) return;

    this.connection.invoke('MarkRead', roomId, messageIds).catch((error) => {
      console.error(`[SignalR:${this.hubType}] Failed to mark read:`, error);
    });
  }
}

/**
 * Global SignalR Manager
 *
 * Provides access to different hub connections.
 */
class SignalRManager {
  private hubs: Map<HubType, SignalRHubManager> = new Map();

  /**
   * Get or create a hub manager
   */
  getHub(hubType: HubType): SignalRHubManager {
    if (!this.hubs.has(hubType)) {
      this.hubs.set(hubType, new SignalRHubManager(hubType));
    }
    return this.hubs.get(hubType)!;
  }

  /**
   * Get the chat hub
   */
  get chat(): SignalRHubManager {
    return this.getHub('chat');
  }

  /**
   * Get the ticket hub
   */
  get ticket(): SignalRHubManager {
    return this.getHub('ticket');
  }

  /**
   * Get the notification hub
   */
  get notification(): SignalRHubManager {
    return this.getHub('notification');
  }

  /**
   * Get the remote access hub
   */
  get remoteAccess(): SignalRHubManager {
    return this.getHub('remote-access');
  }

  /**
   * Disconnect all hubs
   */
  disconnectAll(): void {
    for (const hub of this.hubs.values()) {
      hub.disconnect();
    }
    this.hubs.clear();
  }
}

// Singleton instance
export const signalRManager = new SignalRManager();

// Export individual hub accessors for convenience
export const signalRChat = signalRManager.chat;
export const signalRTicket = signalRManager.ticket;
export const signalRNotification = signalRManager.notification;
export const signalRRemoteAccess = signalRManager.remoteAccess;

export default signalRManager;
