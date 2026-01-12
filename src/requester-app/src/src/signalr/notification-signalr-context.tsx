/**
 * SignalR Notification Context for Tauri App
 *
 * Provides SignalR connectivity for desktop notifications.
 * Manages connection to the notification hub and handles:
 * - New message notifications
 * - Subscription added/removed events
 * - Active chat suppression
 *
 * Usage:
 * <NotificationSignalRProvider>
 *   <App />
 * </NotificationSignalRProvider>
 *
 * Then use:
 * const { setActiveChat, onNotification } = useNotificationSignalR();
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
import { isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';
import { authStore } from '@/stores/auth-store';
import { signalRManager, SignalRState } from './signalr-manager';
import { showNewMessageNotification, getNotificationPreferences } from '@/lib/notifications';
import type { ChatMessage } from '@/types';
import { logger } from '@/logging';
import { RuntimeConfig } from '@/lib/runtime-config';
import { sessionPresence } from '@/services/session-presence';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

// Notification data type
interface NotificationData {
  requestId: string;
  message: ChatMessage;
}

// Handler type
type NotificationHandler = (data: NotificationData) => void;

// Retry info type
interface RetryInfo {
  count: number;
  nextRetryAt: Date | null;
  countdownSeconds: number; // Visible countdown in seconds
}

// Context value type
interface NotificationSignalRContextValue {
  // Connection state
  state: Accessor<SignalRState>;
  isConnected: Accessor<boolean>;
  error: Accessor<string | null>;
  retryInfo: Accessor<RetryInfo>;
  activeChat: Accessor<string | null>; // Current active chat request ID

  // Actions
  connect: () => Promise<void>;
  disconnect: () => void;
  forceReconnect: () => Promise<void>;
  setActiveChat: (requestId: string | null) => void;
  refreshSubscriptions: () => void;

  // Event handlers
  onNotification: (handler: NotificationHandler) => () => void;
}

// Create context (exported for HMR guard checks)
export const NotificationSignalRContext = createContext<NotificationSignalRContextValue>();

/**
 * Notification SignalR Provider
 *
 * Provides SignalR connectivity for desktop notifications.
 * Automatically connects when user is authenticated.
 */
export const NotificationSignalRProvider: ParentComponent = (props) => {
  const [state, setState] = createSignal<SignalRState>(SignalRState.DISCONNECTED);
  const [error, setError] = createSignal<string | null>(null);
  const [activeChat, setActiveChatState] = createSignal<string | null>(null);
  const [retryInfo, setRetryInfo] = createSignal<RetryInfo>({
    count: 0,
    nextRetryAt: null,
    countdownSeconds: 0,
  });

  // Connection retry tracking
  let isConnecting = false;
  let retryCount = 0;
  let retryTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let slowRetryIntervalId: ReturnType<typeof setInterval> | null = null;
  let countdownIntervalId: ReturnType<typeof setInterval> | null = null;

  // Retry configuration - using 30 second fixed interval for user visibility
  const RETRY_INTERVAL_MS = 30000; // 30 seconds between retries
  const MAX_FAST_RETRIES = 10; // Maximum number of retries before switching to slow mode
  const SLOW_RETRY_INTERVAL_MS = 60000; // 60 seconds for long outages

  // Notification handlers
  const handlers = new Set<NotificationHandler>();

  // Request notification permission on mount
  createEffect(() => {
    (async () => {
      try {
        const granted = await isPermissionGranted();
        if (!granted) {
          await requestPermission();
        }
      } catch (e) {
        console.warn('[NotificationSignalR] Failed to request notification permission:', e);
      }
    })();
  });

  // Fetch and process pending notifications on reconnect
  const recoverPendingNotifications = async () => {
    try {
      const token = authStore.state.token;
      if (!token) return;

      const apiUrl = RuntimeConfig.getServerAddress();

      console.log('[NotificationSignalR] Fetching pending notifications...');

      // Use Tauri HTTP plugin to bypass CORS and ACL restrictions
      const response = await tauriFetch(`${apiUrl}/notifications/pending`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.warn('[NotificationSignalR] Failed to fetch pending notifications:', response.status);
        return;
      }

      const data = await response.json();
      const notifications = data.notifications || [];

      console.log(`[NotificationSignalR] Recovered ${notifications.length} pending notifications`);

      // Process each notification
      for (const notification of notifications) {
        if (notification.eventType === 'subscription_added') {
          console.log('[NotificationSignalR] Recovered subscription_added:', notification.payload?.requestId);
        } else if (notification.eventType === 'subscription_removed') {
          console.log('[NotificationSignalR] Recovered subscription_removed:', notification.payload?.requestId);
        } else if (notification.eventType === 'new_message') {
          // Could show notification or update UI
          console.log('[NotificationSignalR] Recovered new_message notification');
        }
      }

      // Acknowledge all recovered notifications
      if (notifications.length > 0) {
        const notificationIds = notifications.map((n: any) => n.id);
        // Use Tauri HTTP plugin to bypass CORS and ACL restrictions
        await tauriFetch(`${apiUrl}/notifications/acknowledge`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ notification_ids: notificationIds }),
        });
        console.log('[NotificationSignalR] Acknowledged recovered notifications');
      }
    } catch (error) {
      console.warn('[NotificationSignalR] Failed to recover pending notifications:', error);
    }
  };

  // Set up global event handlers
  createEffect(() => {
    console.log('[NotificationSignalR] Setting up global event handlers');

    signalRManager.notification.setGlobalHandlers({
      onConnect: () => {
        console.log('%c[NotificationSignalR] CONNECTED', 'color: green; font-weight: bold');
        logger.info('signalr', 'Notification hub connected');
        setState(SignalRState.CONNECTED);
        setError(null);

        // Start session presence heartbeat (low-frequency, 45s interval)
        sessionPresence.start();

        // Refresh subscriptions on connect
        signalRManager.notification.refreshSubscriptions();

        // Recover pending notifications on connect/reconnect
        recoverPendingNotifications();
      },
      onDisconnect: () => {
        console.log('%c[NotificationSignalR] DISCONNECTED', 'color: orange; font-weight: bold');
        logger.warn('signalr', 'Notification hub disconnected');
        setState(SignalRState.DISCONNECTED);

        // Stop session presence heartbeat (notify backend of disconnect)
        sessionPresence.stop(true);
      },
      onReconnecting: (attempt: number) => {
        console.log(`%c[NotificationSignalR] RECONNECTING (attempt ${attempt})`, 'color: blue; font-weight: bold');
        logger.info('signalr', 'Notification hub reconnecting', { attempt });
        setState(SignalRState.RECONNECTING);

        // Pause heartbeat during reconnection (don't notify disconnect yet)
        sessionPresence.stop(false);
      },
      onReconnected: () => {
        console.log('%c[NotificationSignalR] RECONNECTED', 'color: green; font-weight: bold');
        logger.info('signalr', 'Notification hub reconnected');

        // CRITICAL: Update state to CONNECTED after successful reconnection
        // This was missing and caused the error banner to persist after reconnection
        setState(SignalRState.CONNECTED);
        setError(null);

        // Reset retry state on successful reconnection
        retryCount = 0;
        setRetryInfo({ count: 0, nextRetryAt: null, countdownSeconds: 0 });
        clearRetryTimers();

        // Start session presence heartbeat
        sessionPresence.start();

        // Refresh subscriptions after reconnection
        signalRManager.notification.refreshSubscriptions();

        // Recover pending notifications after reconnection
        recoverPendingNotifications();
      },
      onError: (errorMsg: string) => {
        console.error('%c[NotificationSignalR] ERROR:', 'color: red; font-weight: bold', errorMsg);
        logger.error('signalr', 'Notification hub error', { error: errorMsg });
        setError(errorMsg);
      },
    });

    // Add notification handler
    const removeNotificationHandler = signalRManager.notification.addNotificationHandler({
      onNewMessageNotification: (data) => {
        const currentActiveChat = activeChat();
        const isViewingThisChat = currentActiveChat === data.requestId;

        // Compare IDs as strings to handle type mismatches (backend may send string, store may have number)
        const currentUserId = String(authStore.state.user?.id || '');
        const messageSenderId = String(data.message.senderId || '');
        const isOwnMessage = currentUserId !== '' && currentUserId === messageSenderId;

        // Check notification preferences EARLY
        const prefs = getNotificationPreferences();
        const notificationsEnabled = prefs.notificationsEnabled;

        // Comprehensive diagnostic logging for notification decision
        console.log('[NotificationSignalR] 📬 NewMessageNotification - Decision Analysis:', {
          // Identity
          currentUserId: currentUserId?.substring(0, 8) || 'EMPTY',
          messageSenderId: messageSenderId?.substring(0, 8) || 'EMPTY',
          idsEqual: currentUserId === messageSenderId,
          isOwnMessage,
          // Chat context
          activeChat: currentActiveChat?.substring(0, 8) || 'NONE',
          requestId: data.requestId?.substring(0, 8),
          isViewingThisChat,
          // Preferences
          notificationsEnabled,
          // Decision
          willSuppress: isOwnMessage || isViewingThisChat || !notificationsEnabled,
          suppressReason: isOwnMessage ? 'own_message' : isViewingThisChat ? 'viewing_chat' : !notificationsEnabled ? 'disabled' : 'none',
        });

        // ALWAYS call registered handlers for cache updates, ticket list updates, etc.
        // Handlers need to receive ALL notifications to keep state in sync
        handlers.forEach(handler => handler(data));

        // ========================================
        // SUPPRESSION CHECKS - Order matters!
        // ========================================

        // 1. HARD RULE: Never notify on own messages (most critical)
        if (isOwnMessage) {
          console.log('[NotificationSignalR] ✋ SUPPRESSED: own message - no notification');
          return;
        }

        // 2. Suppress if viewing the chat (user already sees the message)
        if (isViewingThisChat) {
          console.log('[NotificationSignalR] ✋ SUPPRESSED: viewing this chat');
          return;
        }

        // 3. Respect user's notification preferences
        if (!notificationsEnabled) {
          console.log('[NotificationSignalR] ✋ SUPPRESSED: notifications disabled in preferences');
          return;
        }

        // ========================================
        // All checks passed - show notification
        // ========================================
        console.log('[NotificationSignalR] ✅ SHOWING notification for message from:', {
          sender: data.message.sender?.fullName || data.message.sender?.username || 'Unknown',
          requestId: data.requestId?.substring(0, 8),
        });

        showDesktopNotification(data);
      },
      onSubscriptionAdded: (data) => {
        console.log('[NotificationSignalR] Subscription added:', data.requestId);
      },
      onSubscriptionRemoved: (data) => {
        console.log('[NotificationSignalR] Subscription removed:', data.requestId);
      },
    });

    onCleanup(() => {
      console.log('[NotificationSignalR] Cleaning up');
      removeNotificationHandler();
    });
  });

  // Clear all retry timers and countdown
  const clearRetryTimers = () => {
    if (retryTimeoutId) {
      clearTimeout(retryTimeoutId);
      retryTimeoutId = null;
    }
    if (slowRetryIntervalId) {
      clearInterval(slowRetryIntervalId);
      slowRetryIntervalId = null;
    }
    if (countdownIntervalId) {
      clearInterval(countdownIntervalId);
      countdownIntervalId = null;
    }
    // Reset countdown display
    setRetryInfo(prev => ({ ...prev, countdownSeconds: 0 }));
  };

  // Start countdown timer that updates every second
  const startCountdown = (targetTime: Date) => {
    // Clear any existing countdown
    if (countdownIntervalId) {
      clearInterval(countdownIntervalId);
    }

    // Update countdown immediately
    const updateCountdown = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((targetTime.getTime() - now) / 1000));
      setRetryInfo(prev => ({ ...prev, countdownSeconds: remaining }));

      // Stop countdown when it reaches 0
      if (remaining <= 0 && countdownIntervalId) {
        clearInterval(countdownIntervalId);
        countdownIntervalId = null;
      }
    };

    // Initial update
    updateCountdown();

    // Start interval for countdown updates
    countdownIntervalId = setInterval(updateCountdown, 1000);
  };

  // Start slow retry interval for long outages
  const startSlowRetryInterval = () => {
    if (slowRetryIntervalId) return; // Already running

    console.log('[NotificationSignalR] Starting slow retry interval (every 60s)...');
    slowRetryIntervalId = setInterval(() => {
      if (authStore.state.isAuthenticated && state() === SignalRState.DISCONNECTED && !isConnecting) {
        console.log('[NotificationSignalR] Slow retry attempting connection...');
        // Restart countdown for next retry
        const nextRetryAt = new Date(Date.now() + SLOW_RETRY_INTERVAL_MS);
        startCountdown(nextRetryAt);
        attemptConnection();
      }
    }, SLOW_RETRY_INTERVAL_MS);
  };

  // Stop slow retry interval
  const stopSlowRetryInterval = () => {
    if (slowRetryIntervalId) {
      clearInterval(slowRetryIntervalId);
      slowRetryIntervalId = null;
      console.log('[NotificationSignalR] Slow retry interval stopped');
    }
  };

  // Attempt connection with retry handling and 30-second countdown
  const attemptConnection = async () => {
    if (isConnecting || state() === SignalRState.CONNECTED) return;

    try {
      await connect();
      // Success - stop all retries
      stopSlowRetryInterval();
      clearRetryTimers();
    } catch (err) {
      console.error('[NotificationSignalR] Connection attempt failed:', err);
      retryCount++;

      // Phase 1: Standard retries with 30-second countdown
      if (retryCount < MAX_FAST_RETRIES) {
        const nextRetryAt = new Date(Date.now() + RETRY_INTERVAL_MS);
        setRetryInfo({
          count: retryCount,
          nextRetryAt,
          countdownSeconds: Math.ceil(RETRY_INTERVAL_MS / 1000),
        });

        console.log(`[NotificationSignalR] Retry ${retryCount}/${MAX_FAST_RETRIES} in ${RETRY_INTERVAL_MS / 1000}s...`);

        // Start visible countdown
        startCountdown(nextRetryAt);

        // Clear existing timeout and set new one
        if (retryTimeoutId) {
          clearTimeout(retryTimeoutId);
        }
        retryTimeoutId = setTimeout(() => {
          retryTimeoutId = null;
          attemptConnection();
        }, RETRY_INTERVAL_MS);
      }
      // Phase 2: Switch to slow retries (long outage handling)
      else if (!slowRetryIntervalId) {
        console.log('[NotificationSignalR] Fast retries exhausted, switching to slow retry mode');
        logger.warn('signalr', 'Notification hub fast retries exhausted, switching to slow retry mode', {
          totalAttempts: retryCount,
          slowRetryIntervalMs: SLOW_RETRY_INTERVAL_MS,
        });
        const nextRetryAt = new Date(Date.now() + SLOW_RETRY_INTERVAL_MS);
        setRetryInfo({
          count: retryCount,
          nextRetryAt,
          countdownSeconds: Math.ceil(SLOW_RETRY_INTERVAL_MS / 1000),
        });
        startCountdown(nextRetryAt);
        startSlowRetryInterval();
      }
    }
  };

  // Auto-connect when authenticated
  createEffect(() => {
    if (authStore.state.isAuthenticated && state() === SignalRState.DISCONNECTED) {
      // Prevent concurrent connection attempts
      if (isConnecting) {
        console.log('[NotificationSignalR] Already connecting, skipping...');
        return;
      }

      console.log('[NotificationSignalR] User authenticated - connecting...');
      attemptConnection();
    }
  });

  // Handle network online/offline events
  createEffect(() => {
    const handleOnline = () => {
      console.log('[NotificationSignalR] Network online - attempting reconnection...');
      logger.info('network', 'Network came online, attempting SignalR reconnection');
      if (authStore.state.isAuthenticated && state() === SignalRState.DISCONNECTED && !isConnecting) {
        // Reset retry count for fresh start after network recovery
        retryCount = 0;
        setRetryInfo({ count: 0, nextRetryAt: null, countdownSeconds: 0 });
        clearRetryTimers();
        attemptConnection();
      }
    };

    const handleOffline = () => {
      console.log('[NotificationSignalR] Network offline - pausing retries');
      logger.warn('network', 'Network went offline, pausing SignalR retries');
      clearRetryTimers();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    onCleanup(() => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    });
  });

  // Handle window visibility/focus events - reconnect when user comes back
  createEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[NotificationSignalR] Window visible - checking connection...');
        if (authStore.state.isAuthenticated && state() === SignalRState.DISCONNECTED && !isConnecting) {
          // Don't reset retry count, just attempt connection
          attemptConnection();
        }
      }
    };

    const handleFocus = () => {
      console.log('[NotificationSignalR] Window focused - checking connection...');
      if (authStore.state.isAuthenticated && state() === SignalRState.DISCONNECTED && !isConnecting) {
        attemptConnection();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    onCleanup(() => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    });
  });

  // Cleanup all timers on unmount
  onCleanup(() => {
    clearRetryTimers();
  });

  // Show desktop notification using the centralized notification utility
  // This ensures consistent debouncing, sound, and click-to-open behavior
  const showDesktopNotification = async (data: NotificationData) => {
    try {
      const senderName = data.message.sender?.fullName || data.message.sender?.username || 'Unknown';
      const content = data.message.content || '';
      const requestTitle = (data.message as any).requestTitle || 'New Message';

      console.log('[NotificationSignalR] Triggering desktop notification via showNewMessageNotification');

      // Use the centralized notification utility which handles:
      // - Permission checks
      // - Sound playback
      // - Debouncing
      // - Click-to-open navigation
      // - Multi-path delivery (plugin → command → event)
      await showNewMessageNotification(
        senderName,
        requestTitle,
        content,
        data.requestId
      );

      console.log('[NotificationSignalR] Desktop notification triggered successfully');
    } catch (e) {
      console.error('[NotificationSignalR] Failed to send desktop notification:', e);
    }
  };

  // Connect method
  const connect = async () => {
    if (!authStore.state.token) {
      throw new Error('Not authenticated');
    }

    // Prevent concurrent connection attempts
    if (isConnecting) {
      console.log('[NotificationSignalR] Connection already in progress');
      return;
    }

    isConnecting = true;
    setState(SignalRState.CONNECTING);
    setError(null);

    try {
      await signalRManager.notification.connect();
      // Reset retry state on successful connection
      retryCount = 0;
      setRetryInfo({ count: 0, nextRetryAt: null, countdownSeconds: 0 });
      clearRetryTimers();
      console.log('[NotificationSignalR] Connection successful, retry state reset');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      setError(message);
      setState(SignalRState.DISCONNECTED);
      throw err;
    } finally {
      isConnecting = false;
    }
  };

  // Force reconnect - resets retry count and attempts immediately (cancels countdown)
  const forceReconnect = async () => {
    console.log('[NotificationSignalR] Force reconnect requested (manual retry)');
    retryCount = 0;
    setRetryInfo({ count: 0, nextRetryAt: null, countdownSeconds: 0 });
    clearRetryTimers();
    await attemptConnection();
  };

  // Disconnect method
  const disconnect = () => {
    clearRetryTimers();
    retryCount = 0;
    setRetryInfo({ count: 0, nextRetryAt: null, countdownSeconds: 0 });
    signalRManager.notification.disconnect();
    setState(SignalRState.DISCONNECTED);
  };

  // Set active chat (for notification suppression)
  const setActiveChat = (requestId: string | null) => {
    setActiveChatState(requestId);
    signalRManager.notification.setActiveChat(requestId);
  };

  // Refresh subscriptions
  const refreshSubscriptions = () => {
    signalRManager.notification.refreshSubscriptions();
  };

  // Register notification handler
  const onNotification = (handler: NotificationHandler): () => void => {
    handlers.add(handler);
    return () => handlers.delete(handler);
  };

  // Context value
  const value: NotificationSignalRContextValue = {
    state,
    isConnected: () => state() === SignalRState.CONNECTED,
    error,
    retryInfo,
    activeChat,
    connect,
    disconnect,
    forceReconnect,
    setActiveChat,
    refreshSubscriptions,
    onNotification,
  };

  return (
    <NotificationSignalRContext.Provider value={value}>
      {props.children}
    </NotificationSignalRContext.Provider>
  );
};

/**
 * Hook to access notification SignalR context
 */
export function useNotificationSignalR(): NotificationSignalRContextValue {
  const context = useContext(NotificationSignalRContext);

  if (!context) {
    throw new Error('useNotificationSignalR must be used within a NotificationSignalRProvider');
  }

  return context;
}

export default NotificationSignalRProvider;
