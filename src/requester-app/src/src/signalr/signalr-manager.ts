/**
 * SignalR Connection Manager for Tauri App
 *
 * Manages connections to SignalR hubs for real-time communication.
 * Supports multiple hubs: Chat, Notification, RemoteAccess
 *
 * Features:
 * - Lazy connection (connects on first subscription)
 * - Automatic reconnection with exponential backoff
 * - JWT authentication via access_token query string
 * - Room/group subscription management
 * - Event handlers for different message types
 */

import * as signalR from '@microsoft/signalr';
import { RuntimeConfig } from '@/lib/runtime-config';
import { authStore } from '@/stores/auth-store';
import type { ChatMessage, TypingIndicator, ReadStatusUpdate, TicketUpdateEvent, TaskStatusChangedEvent } from '@/types';

// Connection states
export enum SignalRState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
}

// Hub types available
export type HubType = 'chat' | 'notification' | 'remote-access';

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
  onReconnected?: () => void;
  onError?: (error: string) => void;
}

// Notification handlers
export interface NotificationHandlers {
  onNewMessageNotification?: (data: {
    requestId: string;
    message: ChatMessage;
  }) => void;
  onSubscriptionAdded?: (data: { requestId: string }) => void;
  onSubscriptionRemoved?: (data: { requestId: string }) => void;
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

  // Room subscriptions: roomId -> Map<subscriptionId, handlers>
  private subscriptions: Map<string, Map<string, ChatRoomHandlers>> = new Map();
  private subscriptionIdCounter = 0;

  // Global event handlers
  private globalHandlers: SignalREventHandlers = {};

  // Notification handlers (for notification hub)
  private notificationHandlers: Set<NotificationHandlers> = new Set();

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
   * Add notification handler
   */
  addNotificationHandler(handler: NotificationHandlers): () => void {
    this.notificationHandlers.add(handler);
    return () => this.notificationHandlers.delete(handler);
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

    // Create connection promise
    this.connectionPromise = (async () => {
      try {
        // Get access token from auth store with brief retry for timing issues
        // This handles the race condition where SignalR connects before auth is fully synced
        let token = authStore.state.token;
        let user = authStore.state.user;
        let authRetries = 0;
        const maxAuthRetries = 3;
        const authRetryDelay = 100; // ms

        while ((!token || !user?.id) && authRetries < maxAuthRetries) {
          console.log(`[SignalR:${this.hubType}] Waiting for auth state (attempt ${authRetries + 1}/${maxAuthRetries})...`);
          await new Promise(resolve => setTimeout(resolve, authRetryDelay));
          token = authStore.state.token;
          user = authStore.state.user;
          authRetries++;
        }

        if (!token) {
          console.error(`[SignalR:${this.hubType}] No token after retries:`, {
            'authStore.state.token': token ? 'present' : 'null',
            'authStore.state.user': user ? 'present' : 'null',
            'authStore.state.isAuthenticated': authStore.state.isAuthenticated,
            'authStore.state.isRehydrating': authStore.state.isRehydrating,
          });
          throw new Error('Not authenticated');
        }

        if (!user?.id) {
          console.error(`[SignalR:${this.hubType}] No user after retries:`, {
            'authStore.state.token': token ? 'present' : 'null',
            'authStore.state.user': user ? 'present' : 'null',
            'authStore.state.isAuthenticated': authStore.state.isAuthenticated,
            'authStore.state.isRehydrating': authStore.state.isRehydrating,
          });
          throw new Error('User not authenticated');
        }

        const baseUrl = RuntimeConfig.getSignalRAddress();
        const hubUrl = `${baseUrl}/hubs/${this.hubType}`;

        console.log(`[SignalR:${this.hubType}] Connecting to ${hubUrl}`);

        // Build connection with JWT auth
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
    this.connection.onreconnecting(() => {
      this.state = SignalRState.RECONNECTING;
      this.reconnectAttempts++;
      console.log(`[SignalR:${this.hubType}] Reconnecting (attempt ${this.reconnectAttempts})...`);
      this.globalHandlers.onReconnecting?.(this.reconnectAttempts);
    });

    // Reconnected
    this.connection.onreconnected(() => {
      this.state = SignalRState.CONNECTED;
      this.reconnectAttempts = 0;
      console.log(`%c[SignalR:${this.hubType}] Reconnected`, 'color: green; font-weight: bold');

      // Call onReconnected if defined, otherwise fall back to onConnect
      if (this.globalHandlers.onReconnected) {
        this.globalHandlers.onReconnected();
      } else {
        this.globalHandlers.onConnect?.();
      }

      // Rejoin all rooms after reconnect
      this.rejoinAllRooms();
    });

    // Closed
    this.connection.onclose((error) => {
      this.state = SignalRState.DISCONNECTED;
      console.log(`[SignalR:${this.hubType}] Disconnected${error ? ': ' + error : ''}`);
      this.globalHandlers.onDisconnect?.();
    });

    // Message handlers for chat hub
    if (this.hubType === 'chat') {
      this.connection.on('InitialState', (data: InitialStateData) => {
        console.log(`[SignalR:${this.hubType}] InitialState for ${data.requestId?.substring(0, 8)}...`);
        this.routeToHandlers(data.requestId, 'onInitialState', data);
      });

      this.connection.on('ReceiveMessage', (message: ChatMessage) => {
        console.log(`[SignalR:${this.hubType}] ReceiveMessage for ${message.requestId?.substring(0, 8)}...`);
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

      // Room joined confirmation (server acknowledges JoinRoom)
      this.connection.on('roomjoined', (data?: { requestId?: string }) => {
        console.log(`[SignalR:${this.hubType}] Room joined confirmed:`, data?.requestId?.substring(0, 8) || 'unknown');
      });
      this.connection.on('RoomJoined', (data?: { requestId?: string }) => {
        console.log(`[SignalR:${this.hubType}] Room joined confirmed:`, data?.requestId?.substring(0, 8) || 'unknown');
      });

      // Room left confirmation (server acknowledges LeaveRoom)
      this.connection.on('roomleft', (data?: { requestId?: string }) => {
        console.log(`[SignalR:${this.hubType}] Room left confirmed:`, data?.requestId?.substring(0, 8) || 'unknown');
      });
      this.connection.on('RoomLeft', (data?: { requestId?: string }) => {
        console.log(`[SignalR:${this.hubType}] Room left confirmed:`, data?.requestId?.substring(0, 8) || 'unknown');
      });
    }

    // Notification hub handlers
    if (this.hubType === 'notification') {
      // Server confirmation events (informational, no action needed)
      // Register both lowercase and PascalCase to handle different server conventions
      this.connection.on('connected', () => {
        console.log(`[SignalR:${this.hubType}] Server confirmed connection`);
      });
      this.connection.on('Connected', () => {
        console.log(`[SignalR:${this.hubType}] Server confirmed connection`);
      });

      this.connection.on('subscriptionsrefreshed', () => {
        console.log(`[SignalR:${this.hubType}] Subscriptions refreshed by server`);
      });
      this.connection.on('SubscriptionsRefreshed', () => {
        console.log(`[SignalR:${this.hubType}] Subscriptions refreshed by server`);
      });

      // Room left confirmation
      this.connection.on('roomleft', (data?: { requestId?: string }) => {
        console.log(`[SignalR:${this.hubType}] Room left confirmed:`, data?.requestId?.substring(0, 8) || 'unknown');
      });
      this.connection.on('RoomLeft', (data?: { requestId?: string }) => {
        console.log(`[SignalR:${this.hubType}] Room left confirmed:`, data?.requestId?.substring(0, 8) || 'unknown');
      });

      // Active chat set confirmation
      this.connection.on('activechatset', (data?: { requestId?: string | null }) => {
        console.log(`[SignalR:${this.hubType}] Active chat set confirmed:`, data?.requestId?.substring(0, 8) || 'none');
      });
      this.connection.on('ActiveChatSet', (data?: { requestId?: string | null }) => {
        console.log(`[SignalR:${this.hubType}] Active chat set confirmed:`, data?.requestId?.substring(0, 8) || 'none');
      });

      // NOTE: NewMessageNotification is handled by the generic Notification handler below
      // which normalizes the message format. Direct handler removed to prevent duplicates.
      this.connection.on('NewMessageNotification', (data: { requestId: string; message: ChatMessage }) => {
        console.log(`[SignalR:${this.hubType}] NewMessageNotification received (handled by Notification handler)`);
        // Don't call handlers here - the Notification handler will process this
      });

      this.connection.on('SubscriptionAdded', (data: { requestId: string }) => {
        console.log(`[SignalR:${this.hubType}] SubscriptionAdded for ${data.requestId?.substring(0, 8)}...`);
        this.notificationHandlers.forEach(handler => handler.onSubscriptionAdded?.(data));
      });

      this.connection.on('SubscriptionRemoved', (data: { requestId: string }) => {
        console.log(`[SignalR:${this.hubType}] SubscriptionRemoved for ${data.requestId?.substring(0, 8)}...`);
        this.notificationHandlers.forEach(handler => handler.onSubscriptionRemoved?.(data));
      });

      // Generic notification event (used by send_user_notification)
      // Register both cases due to SignalR's potential camelCase serialization
      // Route to appropriate handlers based on notification type
      const handleGenericNotification = (data: unknown) => {
        console.log(`[SignalR:${this.hubType}] Notification received:`, data);

        // Route based on notification type
        // Backend sends two formats:
        // 1. chat.py: { message: { senderName: string, ... } }
        // 2. chat_service.py: { message: { sender: { fullName, username }, ... } }
        const notification = data as {
          type?: string;
          requestId?: string;
          message?: Partial<ChatMessage> & { senderName?: string };
          unreadCount?: number;
        };

        if (notification?.type === 'new_message_notification' && notification.requestId && notification.message) {
          // Normalize the message format - ensure sender object exists
          // NOTE: Backend sends snake_case (sender_id) but we use camelCase (senderId)
          // SignalR doesn't auto-convert like HTTP responses, so check both formats
          const rawMessage = notification.message as any; // Allow snake_case access
          const extractedSenderId = rawMessage.senderId || rawMessage.sender_id || rawMessage.sender?.id || '';

          const normalizedMessage: ChatMessage = {
            id: rawMessage.id || '',
            requestId: notification.requestId,
            senderId: extractedSenderId,
            content: rawMessage.content || '',
            createdAt: rawMessage.createdAt || rawMessage.created_at || new Date().toISOString(),
            isScreenshot: rawMessage.isScreenshot || rawMessage.is_screenshot || false,
            screenshotFileName: rawMessage.screenshotFileName || rawMessage.screenshot_file_name || null,
            sequenceNumber: rawMessage.sequenceNumber || rawMessage.sequence_number || 0,
            // Normalize sender: use existing sender object or create from senderName
            sender: rawMessage.sender || {
              id: extractedSenderId,
              username: rawMessage.senderName || rawMessage.sender_name || 'Unknown',
              fullName: rawMessage.senderName || rawMessage.sender_name || 'Unknown',
              isTechnician: false,
            },
          };

          console.log(`[SignalR:${this.hubType}] Routing to NewMessageNotification handlers (normalized, senderId: ${extractedSenderId?.substring(0, 8) || 'none'})`);
          this.notificationHandlers.forEach(handler => handler.onNewMessageNotification?.({
            requestId: notification.requestId!,
            message: normalizedMessage,
          }));
        }
      };

      this.connection.on('Notification', handleGenericNotification);
      this.connection.on('notification', handleGenericNotification);

      // Remote session auto-start handlers
      // Server sends these when agent initiates remote access
      const handleRemoteSessionAutoStart = (data: unknown) => {
        console.log(`[SignalR:${this.hubType}] RemoteSessionAutoStart received:`, data);

        // Server sends just the session payload directly:
        // { sessionId, agentId, agentName, requestId, requestTitle, mode, autoApproved, isReconnection }
        const session = data as {
          sessionId: string;
          agentId: string;
          agentName?: string;
          requestId: string;
          requestTitle?: string;
          mode?: string;
          autoApproved?: boolean;
          isReconnection?: boolean;
        };

        if (session?.sessionId) {
          // Import and call the remote access store handler
          import('@/stores/remote-access-store').then(({ remoteAccessStore }) => {
            remoteAccessStore.handleRemoteSessionAutoStart({
              sessionId: session.sessionId,
              agentName: session.agentName || 'Agent',
              requestTitle: session.requestTitle || 'Remote Support',
              expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min expiry
            });
          }).catch((err) => {
            console.error(`[SignalR:${this.hubType}] Failed to import remote-access-store:`, err);
          });
        } else {
          console.warn(`[SignalR:${this.hubType}] RemoteSessionAutoStart received invalid data:`, data);
        }
      };

      // Register both PascalCase and lowercase versions
      this.connection.on('RemoteSessionAutoStart', handleRemoteSessionAutoStart);
      this.connection.on('remotesessionautostart', handleRemoteSessionAutoStart);

      // Remote session reconnect handler
      const handleRemoteSessionReconnect = (data: unknown) => {
        console.log(`[SignalR:${this.hubType}] RemoteSessionReconnect received:`, data);

        // Server sends just the session payload directly (same as auto-start)
        const session = data as {
          sessionId: string;
          agentId: string;
          agentName?: string;
          requestId: string;
          requestTitle?: string;
          mode?: string;
          autoApproved?: boolean;
          isReconnection?: boolean;
        };

        if (session?.sessionId) {
          // Import and call the remote access store handler
          import('@/stores/remote-access-store').then(({ remoteAccessStore }) => {
            console.log(`[SignalR:${this.hubType}] Handling remote session reconnect`);
            remoteAccessStore.handleRemoteSessionAutoStart({
              sessionId: session.sessionId,
              agentName: session.agentName || 'Agent',
              requestTitle: session.requestTitle || 'Remote Support (Reconnect)',
              expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
            });
          }).catch((err) => {
            console.error(`[SignalR:${this.hubType}] Failed to import remote-access-store:`, err);
          });
        } else {
          console.warn(`[SignalR:${this.hubType}] RemoteSessionReconnect received invalid data:`, data);
        }
      };

      // Register both PascalCase and lowercase versions
      this.connection.on('RemoteSessionReconnect', handleRemoteSessionReconnect);
      this.connection.on('remotesessionreconnect', handleRemoteSessionReconnect);

      // Remote session ended handler (FR-007, FR-017, FR-018)
      // Clears the user awareness banner when session terminates
      const handleRemoteSessionEnded = (data: unknown) => {
        console.log(`[SignalR:${this.hubType}] RemoteSessionEnded received:`, data);

        const session = data as {
          sessionId: string;
          reason?: string;
        };

        if (session?.sessionId) {
          // Import and call the remote access store handler
          import('@/stores/remote-access-store').then(({ remoteAccessStore }) => {
            console.log(`[SignalR:${this.hubType}] Handling remote session ended`);
            remoteAccessStore.handleRemoteSessionEnded(session.sessionId);
          }).catch((err) => {
            console.error(`[SignalR:${this.hubType}] Failed to import remote-access-store:`, err);
          });
        } else {
          console.warn(`[SignalR:${this.hubType}] RemoteSessionEnded received invalid data:`, data);
        }
      };

      // Register both PascalCase and lowercase versions
      this.connection.on('RemoteSessionEnded', handleRemoteSessionEnded);
      this.connection.on('remotesessionended', handleRemoteSessionEnded);

      // Session left handler (when agent leaves the session)
      const handleSessionLeft = (data: unknown) => {
        console.log(`[SignalR:${this.hubType}] SessionLeft received:`, data);
        const session = data as {
          sessionId: string;
        };
        if (session?.sessionId) {
          import('@/stores/remote-access-store').then(({ remoteAccessStore }) => {
            console.log(`[SignalR:${this.hubType}] Agent left session, clearing banner`);
            remoteAccessStore.handleRemoteSessionEnded(session.sessionId);
          }).catch((err) => {
            console.error(`[SignalR:${this.hubType}] Failed to import remote-access-store:`, err);
          });
        }
      };

      // Register both PascalCase and lowercase versions
      this.connection.on('SessionLeft', handleSessionLeft);
      this.connection.on('sessionleft', handleSessionLeft);
    }
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
    if (!handlers) return;

    handlers.forEach((handler) => {
      const fn = handler[handlerName];
      if (fn) {
        try {
          (fn as (data: unknown) => void)(data);
        } catch (error) {
          console.error(`[SignalR:${this.hubType}] Handler error (${handlerName}):`, error);
        }
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
  }

  /**
   * Subscribe to a room (join group)
   * Returns a subscription ID for later unsubscription
   */
  async subscribeToRoom(roomId: string, handlers: ChatRoomHandlers): Promise<string> {
    // Connect if not already connected
    if (!this.isConnected()) {
      await this.connect();
    }

    // Generate subscription ID
    const subscriptionId = `sub_${++this.subscriptionIdCounter}_${Date.now()}`;

    // Add handlers
    if (!this.subscriptions.has(roomId)) {
      this.subscriptions.set(roomId, new Map());
    }
    this.subscriptions.get(roomId)!.set(subscriptionId, handlers);

    // Join room on server - verify connection state before invoking
    if (this.connection && this.connection.state === signalR.HubConnectionState.Connected) {
      try {
        await this.connection.invoke('JoinRoom', roomId);
        console.log(`[SignalR:${this.hubType}] Joined room ${roomId.substring(0, 8)}...`);
      } catch (error) {
        console.error(`[SignalR:${this.hubType}] Failed to join room:`, error);
        // Don't throw - handlers are registered, room will be joined on reconnect
      }
    } else {
      console.log(`[SignalR:${this.hubType}] Connection not ready, room ${roomId.substring(0, 8)}... will be joined on connect`);
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

  /**
   * Set active chat (for notification suppression)
   */
  setActiveChat(requestId: string | null): void {
    if (!this.isConnected() || !this.connection) return;

    this.connection.invoke('SetActiveChat', requestId).catch((error) => {
      console.error(`[SignalR:${this.hubType}] Failed to set active chat:`, error);
    });
  }

  /**
   * Refresh subscriptions (for notification hub)
   */
  refreshSubscriptions(): void {
    if (!this.isConnected() || !this.connection) return;

    this.connection.invoke('RefreshSubscriptions').catch((error) => {
      console.error(`[SignalR:${this.hubType}] Failed to refresh subscriptions:`, error);
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
export const signalRNotification = signalRManager.notification;
export const signalRRemoteAccess = signalRManager.remoteAccess;

export default signalRManager;
