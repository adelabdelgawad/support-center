/**
 * Session Presence Service
 *
 * Manages desktop session presence using SignalR lifecycle events.
 * - Sends heartbeat every 30 seconds while SignalR is connected
 * - Notifies backend on disconnect (app close, network loss)
 * - Uses HTTP endpoints for durability (FastAPI is source of truth)
 *
 * Key Design:
 * - NO aggressive timers (30s interval)
 * - SignalR connection state drives heartbeat
 * - FastAPI owns session state, SignalR signals lifecycle changes
 * - STRICT UUID validation to prevent 422 errors from legacy numeric IDs
 */

import { RuntimeConfig } from '@/lib/runtime-config';
import { authStore } from '@/stores/auth-store';

// Heartbeat interval: 30 seconds (responsive presence without excessive load)
const HEARTBEAT_INTERVAL_MS = 30_000;

// Minimum time between heartbeats (debounce rapid calls)
const MIN_HEARTBEAT_GAP_MS = 20_000;

// UUID v4 pattern for strict validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate that sessionId is a proper UUID
 * Returns null if invalid (including legacy numeric values)
 */
function getValidatedSessionId(): string | null {
  const sessionId = authStore.state.sessionId;
  if (!sessionId) {
    return null;
  }

  if (!UUID_REGEX.test(sessionId)) {
    console.error(`[SessionPresence] REJECTED non-UUID sessionId: "${sessionId}"`);
    return null;
  }

  return sessionId;
}

class SessionPresenceService {
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastHeartbeatTime: number = 0;
  private isConnected: boolean = false;
  private isShuttingDown: boolean = false;

  constructor() {
    // Setup window close handler for graceful disconnect
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.handleBeforeUnload);
    }
  }

  /**
   * Start presence tracking when SignalR connects
   * Called from NotificationSignalRContext on successful connection
   *
   * IMPORTANT: Uses UUID-validated sessionId to prevent 422 errors
   */
  start(): void {
    if (this.isConnected) {
      console.log('[SessionPresence] Already started, ignoring');
      return;
    }

    const sessionId = getValidatedSessionId();
    if (!sessionId) {
      console.warn('[SessionPresence] No valid UUID session ID, cannot start presence tracking');
      return;
    }

    console.log(`[SessionPresence] Starting presence tracking for session ${sessionId}`);
    this.isConnected = true;
    this.isShuttingDown = false;

    // Send initial heartbeat immediately
    this.sendHeartbeat();

    // Start periodic heartbeat
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Stop presence tracking when SignalR disconnects
   * Called from NotificationSignalRContext on disconnect
   */
  stop(notifyBackend: boolean = true): void {
    if (!this.isConnected) {
      return;
    }

    console.log('[SessionPresence] Stopping presence tracking');
    this.isConnected = false;

    // Clear heartbeat timer
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Notify backend of disconnect (unless shutting down - handled by beforeunload)
    if (notifyBackend && !this.isShuttingDown) {
      this.sendDisconnect();
    }
  }

  /**
   * Handle SignalR reconnection
   * Treats reconnect as a fresh connection
   */
  onReconnect(): void {
    console.log('[SessionPresence] SignalR reconnected, resuming presence');

    // Stop without notifying backend (not a real disconnect)
    this.stop(false);

    // Restart presence tracking
    this.start();
  }

  /**
   * Send heartbeat to backend
   * Updates last_heartbeat timestamp for the session
   *
   * IMPORTANT: Uses UUID-validated sessionId to prevent 422 errors
   */
  private async sendHeartbeat(): Promise<void> {
    const sessionId = getValidatedSessionId();
    const token = authStore.state.token;

    if (!sessionId || !token) {
      console.warn('[SessionPresence] Cannot send heartbeat: missing valid UUID session or token');
      return;
    }

    // Debounce: don't send heartbeat if one was sent recently
    const now = Date.now();
    if (now - this.lastHeartbeatTime < MIN_HEARTBEAT_GAP_MS) {
      console.log('[SessionPresence] Skipping heartbeat (too soon)');
      return;
    }

    try {
      const apiUrl = RuntimeConfig.getServerAddress();
      const response = await fetch(`${apiUrl}/sessions/desktop/${sessionId}/heartbeat`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        this.lastHeartbeatTime = now;
        console.log(`[SessionPresence] ❤️ Heartbeat sent for session ${sessionId}`);
      } else if (response.status === 404) {
        // Session not found - might have been cleaned up
        console.warn('[SessionPresence] Session not found, stopping presence');
        this.stop(false);
      } else {
        console.warn(`[SessionPresence] Heartbeat failed: ${response.status}`);
      }
    } catch (error) {
      // Network error - don't crash, just log
      console.warn('[SessionPresence] Heartbeat error:', error);
    }
  }

  /**
   * Send disconnect notification to backend
   * Marks session as inactive
   *
   * IMPORTANT: Uses UUID-validated sessionId to prevent 422 errors
   */
  private async sendDisconnect(): Promise<void> {
    const sessionId = getValidatedSessionId();
    const token = authStore.state.token;

    if (!sessionId || !token) {
      return;
    }

    try {
      const apiUrl = RuntimeConfig.getServerAddress();

      // Use sendBeacon for reliability during page unload, fallback to fetch
      const url = `${apiUrl}/sessions/desktop/${sessionId}/disconnect`;

      if (this.isShuttingDown && navigator.sendBeacon) {
        // sendBeacon is more reliable during page unload
        // But it doesn't support custom headers, so we use fetch for authenticated requests
        // Instead, we'll use fetch with keepalive
        await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          keepalive: true, // Allows request to outlive the page
        });
      } else {
        await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
      }

      console.log(`[SessionPresence] 👋 Disconnect sent for session ${sessionId}`);
    } catch (error) {
      // Best effort - don't block app close
      console.warn('[SessionPresence] Disconnect error:', error);
    }
  }

  /**
   * Handle window beforeunload event
   * Sends disconnect notification before app closes
   */
  private handleBeforeUnload = (): void => {
    this.isShuttingDown = true;

    // Stop timer immediately
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Send disconnect (fire-and-forget with keepalive)
    this.sendDisconnect();
  };

  /**
   * Clean up resources
   */
  destroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.handleBeforeUnload);
    }

    this.stop(true);
  }
}

// Export singleton instance
export const sessionPresence = new SessionPresenceService();

// HMR cleanup for development - ensures old intervals are cleared
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    console.log('[SessionPresence] HMR dispose - cleaning up');
    sessionPresence.destroy();
  });
}
