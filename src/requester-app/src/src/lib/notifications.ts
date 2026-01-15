/**
 * Notification utilities for Tauri desktop app
 *
 * Features:
 * - System notifications with Tauri API (dual-path: plugin + command)
 * - Click-to-open ticket functionality
 * - Sound notifications with user preferences
 * - LocalStorage-based preferences
 * - Reliable delivery even when window is hidden
 * - Event-based fallback mechanism
 */

import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";

/**
 * Notification preferences stored in localStorage
 */
export interface NotificationPreferences {
  notificationsEnabled: boolean; // Master toggle - disables ALL notifications
  soundEnabled: boolean;
  soundVolume: number; // 0-1
}

const PREFERENCES_KEY = "notification_preferences";

// Debounce mechanism for rapid notifications
let notificationDebounceTimer: number | null = null;
let pendingNotification: any = null;

/**
 * Get notification preferences from localStorage
 */
export function getNotificationPreferences(): NotificationPreferences {
  const stored = localStorage.getItem(PREFERENCES_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      // Migrate old preferences without notificationsEnabled
      if (typeof parsed.notificationsEnabled === 'undefined') {
        parsed.notificationsEnabled = true; // Default to enabled for existing users
      }
      return parsed;
    } catch {
      // Invalid JSON, return defaults
    }
  }

  // Default preferences
  return {
    notificationsEnabled: true,
    soundEnabled: true,
    soundVolume: 0.5,
  };
}

/**
 * Save notification preferences to localStorage
 */
export function saveNotificationPreferences(
  preferences: NotificationPreferences
): void {
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
}

/**
 * Check if running in Tauri environment
 */
function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
}

const PERMISSION_STATUS_KEY = "notification_permission_status";
const LAST_PERMISSION_CHECK_KEY = "last_permission_check";

/**
 * Get cached permission status
 */
function getCachedPermissionStatus(): boolean | null {
  const stored = localStorage.getItem(PERMISSION_STATUS_KEY);
  if (stored) {
    return stored === "granted";
  }
  return null;
}

/**
 * Save permission status to localStorage
 */
function savePermissionStatus(granted: boolean): void {
  localStorage.setItem(PERMISSION_STATUS_KEY, granted ? "granted" : "denied");
  localStorage.setItem(LAST_PERMISSION_CHECK_KEY, new Date().toISOString());
}

/**
 * Request notification permission (required for Tauri v2)
 * Enhanced with persistence checks and auto-retry
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isTauri()) {
    console.log("[Notifications] Not in Tauri, skipping permission request");
    return false;
  }

  try {
    const { isPermissionGranted, requestPermission } = await import(
      "@tauri-apps/plugin-notification"
    );

    // Check current permission status
    let permissionGranted = await isPermissionGranted();
    console.log("[Notifications] Initial permission status:", permissionGranted);

    // Check if we have a cached status
    const cachedStatus = getCachedPermissionStatus();
    if (cachedStatus !== null && cachedStatus !== permissionGranted) {
      console.log("[Notifications] ⚠️  Permission status changed (cached:", cachedStatus, "actual:", permissionGranted, ")");
    }

    if (!permissionGranted) {
      console.log("[Notifications] Requesting permission...");
      const permission = await requestPermission();
      console.log("[Notifications] Permission response:", permission);
      permissionGranted = permission === "granted";
    }

    // Save permission status to cache
    savePermissionStatus(permissionGranted);

    console.log("[Notifications] Final permission granted:", permissionGranted);
    return permissionGranted;
  } catch (error) {
    console.error("[Notifications] Failed to request permission:", error);
    console.error("[Notifications] Error details:", JSON.stringify(error));
    return false;
  }
}

/**
 * Get current permission status without requesting
 */
export async function getPermissionStatus(): Promise<boolean> {
  if (!isTauri()) {
    return false;
  }

  try {
    const { isPermissionGranted } = await import(
      "@tauri-apps/plugin-notification"
    );
    const granted = await isPermissionGranted();
    savePermissionStatus(granted);
    return granted;
  } catch (error) {
    console.error("[Notifications] Failed to check permission:", error);
    // Return cached status if available
    return getCachedPermissionStatus() ?? false;
  }
}

/**
 * Play notification sound
 */
async function playNotificationSound(): Promise<void> {
  const prefs = getNotificationPreferences();

  if (!prefs.soundEnabled) {
    console.log("[Notifications] Sound disabled in preferences");
    return;
  }

  try {
    // Create audio element for notification sound
    // Using a simple beep sound (data URL)
    const audio = new Audio(
      "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZSA0PVq3n77BdGAg+ltzy0X8pBSp+zPLaizsIGGS57OihUBALTKXh8bllHAU2jdXy0HwqBSh7yvLcizsIHGi67+mjUBELS6Lf8bVlHAY1i9Xyz30oBCp6ye/fiDsIHGi67+mjUBELS6Lf8bVlHAY1i9Xy0HwqBCp5yPDcizsIHGi67+mjUBELS6Lf8bVlHAY1i9Xyz34oBCp5yPDcizsIHGi67+mjUBELS6Lf8bVlHAY1i9Xyz34oBCp5yPDcizsIHGi67+mjUBELS6Lf8bVlHAY1i9Xyz34oBCp5yPDcizsIHGi67+mjUBELS6Lf8bVlHAY1i9Xy0HwqBCp5yPDcizsIHGi67+mjUBELS6Lf8bVlHAY1i9Xyz34oBCp5yPDcizsIHGi67+mjUBELS6Lf8bVlHAY1i9Xyz34oBCp5yPDcizsIHGi67+mjUBELS6Lf8bVlHAY1i9Xy0HwqBCp5yPDcizsIHGi67+mjUBELS6Lf8bVlHAY1i9Xy0HwqBCp5yPDcizsIHGi67+mjUBELS6Lf8bVlHAY1i9Xy0HwqBCp5yPDcizsIHGi67+mjUBELS6Lf8bVlHAY1i9Xy"
    );

    audio.volume = prefs.soundVolume;
    await audio.play();
    console.log("[Notifications] Sound played");
  } catch (error) {
    console.error("[Notifications] Failed to play sound:", error);
  }
}

/**
 * Show a desktop notification with optional click action
 * Uses multi-path delivery: plugin API → Tauri command → event emission
 * This ensures notifications work even when window is hidden
 */
export async function showNotification(options: {
  title: string;
  body: string;
  icon?: string;
  /** Optional data to attach (e.g., ticketId for navigation) */
  data?: Record<string, string>;
  /** Notification type for categorization */
  type?: string;
  /** Optional tag to replace previous notifications with same tag */
  tag?: string;
}): Promise<void> {
  // Check master notification toggle FIRST
  const prefs = getNotificationPreferences();
  if (!prefs.notificationsEnabled) {
    console.log("[Notifications] Master toggle disabled - notification suppressed:", options.title);
    return;
  }

  if (!isTauri()) {
    console.log("[Notifications] Not in Tauri, notification not shown:", options);
    return;
  }

  // Play sound if enabled
  await playNotificationSound();

  const timestamp = new Date().toISOString();
  console.log(`[Notifications] ${timestamp} Attempting to send notification:`, {
    title: options.title,
    bodyLength: options.body.length,
    hasIcon: !!options.icon,
    hasData: !!options.data,
    type: options.type,
    tag: options.tag,
  });

  // Detect Windows platform for click handler support
  const isWindows = navigator.platform.toLowerCase().includes('win') ||
                    navigator.userAgent.toLowerCase().includes('windows');

  // Path 1: Try Tauri command FIRST on Windows (has click handler for deep linking)
  // This is preferred because it supports on_activated callback for navigation
  if (isWindows && options.data?.ticketId) {
    try {
      await invoke<void>("show_system_notification", {
        title: options.title,
        body: options.body,
        notificationType: options.type,
        ticketId: options.data.ticketId,
      });

      console.log(`[Notifications] ✅ Notification sent via Tauri command (Windows + click handler):`, options.title);
      return; // Success - click handler is active
    } catch (commandError) {
      console.warn("[Notifications] ⚠️  Tauri command failed, falling back to plugin:", commandError);
    }
  }

  // Path 2: Try plugin API (works on all platforms but no click callback)
  try {
    const { sendNotification } = await import("@tauri-apps/plugin-notification");

    // Use tag/identifier to replace previous notifications instead of queuing
    const notificationOptions: any = {
      title: options.title,
      body: options.body,
      icon: options.icon,
    };

    // Add tag if provided - this makes new notifications replace old ones with same tag
    // Try both 'tag' and 'identifier' for compatibility with different Tauri versions
    if (options.tag) {
      notificationOptions.tag = options.tag;
      notificationOptions.identifier = options.tag; // Fallback for older versions
      console.log(`[Notifications] Using tag for replacement: ${options.tag}`);
    }

    await sendNotification(notificationOptions);

    console.log(`[Notifications] ✅ Notification sent via plugin API:`, options.title);
    return; // Success - no need to try other paths
  } catch (pluginError) {
    console.warn("[Notifications] ⚠️  Plugin API failed, trying command fallback:", pluginError);
  }

  // Path 3: Try Tauri command as fallback (for non-Windows or when plugin fails)
  try {
    await invoke<void>("show_system_notification", {
      title: options.title,
      body: options.body,
      notificationType: options.type,
      ticketId: options.data?.ticketId,
    });

    console.log(`[Notifications] ✅ Notification sent via Tauri command:`, options.title);
    return; // Success
  } catch (commandError) {
    console.warn("[Notifications] ⚠️  Tauri command failed, trying event emission:", commandError);
  }

  // Path 4: Emit event for Rust event listener (last resort)
  try {
    await emit("show-notification", {
      title: options.title,
      body: options.body,
      type: options.type,
      ticketId: options.data?.ticketId,
    });

    console.log(`[Notifications] ✅ Notification event emitted:`, options.title);
  } catch (eventError) {
    console.error("[Notifications] ❌ All notification paths failed:", eventError);
    console.error("[Notifications] Error details:", {
      type: eventError instanceof Error ? eventError.constructor.name : typeof eventError,
      message: eventError instanceof Error ? eventError.message : String(eventError),
      stack: eventError instanceof Error ? eventError.stack : "N/A",
    });
  }
}

/**
 * Emit notification event (alternative delivery method)
 * Used when Tauri command/plugin fails or as explicit fallback
 */
export async function emitNotificationEvent(
  title: string,
  body: string,
  type?: string
): Promise<void> {
  if (!isTauri()) {
    return;
  }

  try {
    await emit("show-notification", { title, body, type });
    console.log(`[Notifications] Event emitted: ${title}`);
  } catch (error) {
    console.error("[Notifications] Failed to emit notification event:", error);
  }
}

/**
 * Show a notification for a new message (with debounce for rapid messages)
 * Uses 50-character preview for cleaner notification display
 */
export async function showNewMessageNotification(
  senderName: string,
  ticketSubject: string,
  messagePreview: string,
  ticketId?: string
): Promise<void> {
  // 50 chars max for message preview (user requirement)
  const body = `${ticketSubject}\n${messagePreview.slice(0, 50)}${
    messagePreview.length > 50 ? "..." : ""
  }`;

  console.log(`[Notifications] Preparing new message notification from ${senderName}`);

  // Store the latest notification
  pendingNotification = {
    title: `New message from ${senderName}`,
    body,
    data: ticketId ? { ticketId } : undefined,
    type: "new_message",
    tag: ticketId ? `message-${ticketId}` : undefined,
  };

  // Clear existing timer
  if (notificationDebounceTimer !== null) {
    clearTimeout(notificationDebounceTimer);
    console.log(`[Notifications] Cancelled previous notification - new message arrived`);
  }

  // Set new timer to show notification after 300ms
  // If another message arrives within 300ms, this will be cancelled and replaced
  notificationDebounceTimer = window.setTimeout(async () => {
    if (pendingNotification) {
      console.log(`[Notifications] Showing debounced notification`);
      await showNotification(pendingNotification);
      pendingNotification = null;
    }
    notificationDebounceTimer = null;
  }, 300);

  // TODO: Add click handler when Tauri plugin supports it
  // For now, user can click notification to bring app to foreground
}

/**
 * Show a notification for a ticket status change
 */
export async function showTicketUpdateNotification(
  ticketSubject: string,
  newStatus: string
): Promise<void> {
  console.log(`[Notifications] Preparing status update notification: ${newStatus}`);

  await showNotification({
    title: "Ticket Status Updated",
    body: `${ticketSubject}\nStatus: ${newStatus}`,
    type: "status_update",
  });
}

/**
 * Show a notification for an incoming remote session request
 */
export async function showRemoteSessionRequestNotification(
  agentName: string,
  requestTitle?: string
): Promise<void> {
  console.log(`[Notifications] Preparing remote session request notification from ${agentName}`);

  const title = "Incoming Remote Access Request";
  const body = `${agentName} is requesting remote access${requestTitle ? ` for "${requestTitle}"` : ''}\n\nOpening in-app acceptance dialog...`;

  await showNotification({
    title,
    body,
    type: "remote_session_request",
    tag: "remote-session-request", // Replace any previous remote session notification
    data: {
      agentName,
      requestTitle: requestTitle || '',
    },
  });
}
