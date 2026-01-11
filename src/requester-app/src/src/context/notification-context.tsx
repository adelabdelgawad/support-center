/**
 * Notification Context Provider - SolidJS version
 *
 * Provides a global toast notification system that:
 * - Manages notification state app-wide
 * - Auto-dismisses notifications after configurable duration
 * - Supports manual dismissal
 * - Stacks multiple notifications
 *
 * Usage:
 * 1. Wrap your app with <NotificationProvider>
 * 2. Use the useNotification() hook in components
 * 3. Call showNotification(message, type, duration)
 */

import {
  createContext,
  useContext,
  createSignal,
  onCleanup,
  type ParentComponent,
  type Accessor,
} from "solid-js";
import type { Notification, NotificationType } from "@/types";

interface NotificationContextValue {
  /** Array of active notifications */
  notifications: Accessor<Notification[]>;
  /** Show a new notification */
  showNotification: (
    message: string,
    type?: NotificationType,
    duration?: number
  ) => string;
  /** Dismiss a notification by ID */
  dismissNotification: (id: string) => void;
  /** Clear all notifications */
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextValue>();

const DEFAULT_DURATION = 4000; // 4 seconds

export const NotificationProvider: ParentComponent = (props) => {
  const [notifications, setNotifications] = createSignal<Notification[]>([]);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Generate a unique ID for notifications
   */
  const generateId = (): string => {
    return `notification-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  };

  /**
   * Show a new notification
   * @param message - Notification message text
   * @param type - Notification type (success, error, info, warning)
   * @param duration - Auto-dismiss duration in milliseconds (default: 4000)
   * @returns Notification ID
   */
  const showNotification = (
    message: string,
    type: NotificationType = "info",
    duration: number = DEFAULT_DURATION
  ): string => {
    const id = generateId();
    const notification: Notification = {
      id,
      message,
      type,
      timestamp: Date.now(),
      duration,
    };

    // Add to notifications array
    setNotifications((prev) => [...prev, notification]);

    // Set up auto-dismiss timer
    if (duration > 0) {
      const timer = setTimeout(() => {
        dismissNotification(id);
      }, duration);

      timers.set(id, timer);
    }

    return id;
  };

  /**
   * Dismiss a notification by ID
   * @param id - Notification ID to dismiss
   */
  const dismissNotification = (id: string): void => {
    // Clear timer if exists
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(id);
    }

    // Remove from notifications array
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  /**
   * Clear all notifications
   */
  const clearAll = (): void => {
    // Clear all timers
    timers.forEach((timer) => clearTimeout(timer));
    timers.clear();

    // Clear notifications array
    setNotifications([]);
  };

  // Cleanup on unmount
  onCleanup(() => {
    timers.forEach((timer) => clearTimeout(timer));
    timers.clear();
  });

  const value: NotificationContextValue = {
    notifications,
    showNotification,
    dismissNotification,
    clearAll,
  };

  return (
    <NotificationContext.Provider value={value}>
      {props.children}
    </NotificationContext.Provider>
  );
};

/**
 * Hook to access the notification system
 * Must be used within a NotificationProvider
 *
 * @example
 * const { showNotification } = useNotification();
 * showNotification('File saved successfully!', 'success');
 */
export function useNotification(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      "useNotification must be used within a NotificationProvider"
    );
  }
  return context;
}
