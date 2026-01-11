/**
 * Notification UI Components
 *
 * Toast notification system with:
 * - Smooth enter/exit animations (slide + fade)
 * - Color-coded by type with icons
 * - Click to dismiss
 * - Fixed position top-right corner
 * - Stacked vertically with gap
 * - Microsoft Fluent UI inspired design
 */

import { For, Show, createSignal, onMount } from "solid-js";
import { useNotification } from "@/context/notification-context";
import type { Notification as NotificationType } from "@/types";

/**
 * Icon components for each notification type
 */
const SuccessIcon = () => (
  <svg
    class="h-5 w-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const ErrorIcon = () => (
  <svg
    class="h-5 w-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const WarningIcon = () => (
  <svg
    class="h-5 w-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
    />
  </svg>
);

const InfoIcon = () => (
  <svg
    class="h-5 w-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const CloseIcon = () => (
  <svg
    class="h-4 w-4"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      d="M6 18L18 6M6 6l12 12"
    />
  </svg>
);

/**
 * Get icon component for notification type
 */
function getIconForType(type: NotificationType["type"]) {
  switch (type) {
    case "success":
      return SuccessIcon;
    case "error":
      return ErrorIcon;
    case "warning":
      return WarningIcon;
    case "info":
    default:
      return InfoIcon;
  }
}

/**
 * Get Tailwind classes for notification type
 */
function getStylesForType(type: NotificationType["type"]) {
  switch (type) {
    case "success":
      return {
        bg: "bg-success/10",
        border: "border-success/20",
        text: "text-success-foreground",
        icon: "text-success",
      };
    case "error":
      return {
        bg: "bg-red-50 dark:bg-red-900/20",
        border: "border-red-200 dark:border-red-800",
        text: "text-red-800 dark:text-red-200",
        icon: "text-red-600 dark:text-red-400",
      };
    case "warning":
      return {
        bg: "bg-orange-50 dark:bg-orange-900/20",
        border: "border-orange-200 dark:border-orange-800",
        text: "text-orange-800 dark:text-orange-200",
        icon: "text-orange-600 dark:text-orange-400",
      };
    case "info":
    default:
      return {
        bg: "bg-blue-50 dark:bg-blue-900/20",
        border: "border-blue-200 dark:border-blue-800",
        text: "text-blue-800 dark:text-blue-200",
        icon: "text-blue-600 dark:text-blue-400",
      };
  }
}

/**
 * Single Notification Item Component
 */
interface NotificationItemProps {
  notification: NotificationType;
  onDismiss: (id: string) => void;
}

function NotificationItem(props: NotificationItemProps) {
  const [isVisible, setIsVisible] = createSignal(false);
  const [isExiting, setIsExiting] = createSignal(false);

  // Trigger enter animation on mount
  onMount(() => {
    requestAnimationFrame(() => {
      setIsVisible(true);
    });
  });

  const handleDismiss = () => {
    setIsExiting(true);
    // Wait for exit animation to complete before removing
    setTimeout(() => {
      props.onDismiss(props.notification.id);
    }, 300);
  };

  const styles = getStylesForType(props.notification.type);
  const Icon = getIconForType(props.notification.type);

  return (
    <div
      class={`
        relative flex w-full max-w-sm items-start gap-3 rounded-lg border p-4 shadow-lg backdrop-blur-sm
        transition-all duration-300 ease-out
        ${styles.bg} ${styles.border}
        ${
          isVisible() && !isExiting()
            ? "translate-x-0 opacity-100"
            : "translate-x-full opacity-0"
        }
        hover:shadow-xl
      `}
      role="alert"
    >
      {/* Icon */}
      <div class={`flex-shrink-0 ${styles.icon}`}>
        <Icon />
      </div>

      {/* Message */}
      <div class={`flex-1 text-sm font-medium ${styles.text}`}>
        {props.notification.message}
      </div>

      {/* Close Button */}
      <button
        onClick={handleDismiss}
        class={`
          flex-shrink-0 rounded p-1 transition-colors
          ${styles.text}
          hover:bg-black/5 dark:hover:bg-white/10
          focus:outline-none focus:ring-2 focus:ring-offset-1
          ${styles.icon.replace("text-", "focus:ring-")}
        `}
        aria-label="Dismiss notification"
      >
        <CloseIcon />
      </button>
    </div>
  );
}

/**
 * Notification Container Component
 * Displays all active notifications in a fixed position
 */
export function NotificationContainer() {
  const { notifications, dismissNotification } = useNotification();

  return (
    <Show when={notifications().length > 0}>
      <div
        class="fixed right-4 top-4 z-50 flex flex-col gap-3 pointer-events-none"
        aria-live="polite"
        aria-atomic="false"
      >
        <For each={notifications()}>
          {(notification) => (
            <div class="pointer-events-auto">
              <NotificationItem
                notification={notification}
                onDismiss={dismissNotification}
              />
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}

/**
 * Alternative: Bottom-right positioned container
 * Uncomment and use this if you prefer bottom-right notifications
 */
export function NotificationContainerBottom() {
  const { notifications, dismissNotification } = useNotification();

  return (
    <Show when={notifications().length > 0}>
      <div
        class="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-3 pointer-events-none"
        aria-live="polite"
        aria-atomic="false"
      >
        <For each={notifications()}>
          {(notification) => (
            <div class="pointer-events-auto">
              <NotificationItem
                notification={notification}
                onDismiss={dismissNotification}
              />
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}
