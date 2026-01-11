/**
 * Remote Access Store - SolidJS store for remote access state
 *
 * This store manages:
 * - Remote access session auto-start (no approval dialog)
 * - Screen share picker visibility
 * - WebRTC session lifecycle
 * - Control request handling
 * - System notifications and window focus
 */

import { createRoot } from "solid-js";
import { createStore } from "solid-js/store";
import type { RemoteAccessRequestData } from "@/types";
import { WebRTCHost } from "@/lib/remote/webrtc-host";
import { authStore } from "./auth-store";
import type { SelectedSource } from "@/components/remote-access/screen-share-picker";
import type { ResolutionProfile } from "@/lib/remote/tauri-screen-stream";
import { invoke } from "@tauri-apps/api/core";

// Monitor info from Tauri
interface MonitorInfo {
  id: number;
  name: string;
  width: number;
  height: number;
  isPrimary: boolean;
}

interface RemoteAccessState {
  /** Whether an action is in progress */
  isProcessing: boolean;
  /** Error message if action failed */
  error: string | null;
  /** Active WebRTC session info */
  activeSession: {
    sessionId: string;
    connectionState: RTCPeerConnectionState;
  } | null;
  /** Whether remote control is enabled */
  controlEnabled: boolean;
  /** Whether the screen share picker is visible */
  isPickerOpen: boolean;
  /** Session ID pending screen selection */
  pendingSessionId: string | null;
  /** Resolution profile for streaming (default: extreme for local network) */
  resolutionProfile: ResolutionProfile;
}

// Store WebRTCHost instance outside of state (not serializable)
let webrtcHost: WebRTCHost | null = null;

// Track session currently being started to prevent duplicate calls
let sessionStartInProgress: string | null = null;

function createRemoteAccessStore() {
  const [state, setState] = createStore<RemoteAccessState>({
    isProcessing: false,
    error: null,
    activeSession: null,
    controlEnabled: false,
    isPickerOpen: false,
    pendingSessionId: null,
    // Default to standard resolution for better performance (960x540)
    // Use "extreme" (1920x1080) only on high-performance systems
    resolutionProfile: "standard",
  });

  /**
   * Get primary monitor info from Tauri
   */
  async function getPrimaryMonitor(): Promise<SelectedSource | null> {
    try {
      const result = await invoke<string>("get_monitors");
      const monitors: MonitorInfo[] = JSON.parse(result);

      // Find primary monitor, fallback to first monitor
      const primary = monitors.find(m => m.isPrimary) || monitors[0];

      if (primary) {
        return {
          type: "screen",
          id: primary.id,
          name: primary.isPrimary ? "Primary Monitor" : primary.name,
          width: primary.width,
          height: primary.height,
        };
      }
      return null;
    } catch (error) {
      console.error("[RemoteAccess] Failed to get monitors:", error);
      return null;
    }
  }

  /**
   * Start WebRTC session for screen sharing
   * @param sessionId - The session ID for WebRTC signaling
   * @param source - Optional source selection (if undefined, will use browser picker)
   */
  async function startWebRTCSession(sessionId: string, source?: SelectedSource): Promise<void> {
    console.log("[RemoteAccess] ========================================");
    console.log("[RemoteAccess] 📞 startWebRTCSession called");
    console.log("[RemoteAccess] ========================================");
    console.log("[RemoteAccess] Session ID:", sessionId);
    console.log("[RemoteAccess] Source:", source ? `${source.type}: ${source.name} (${source.width}x${source.height})` : "none (will prompt)");

    const resolutionProfile = state.resolutionProfile;
    console.log("[RemoteAccess] Resolution profile:", resolutionProfile);

    // Get auth token
    console.log("[RemoteAccess] Checking auth token...");
    const token = authStore.state.token;
    if (!token) {
      console.error("[RemoteAccess] ❌ No auth token available");
      setState({ error: "No auth token available" });
      return;
    }
    console.log("[RemoteAccess] ✅ Auth token found");

    try {
      // Clean up existing session if any
      if (webrtcHost) {
        console.log("[RemoteAccess] Cleaning up existing WebRTC session");
        await webrtcHost.stop();  // stop() now waits for WebSocket to fully close
        webrtcHost = null;
      }

      console.log("[RemoteAccess] Creating WebRTCHost instance...");
      // Create new WebRTC host with selected source and resolution profile
      webrtcHost = new WebRTCHost(sessionId, {
        onConnectionStateChange: (connectionState) => {
          console.log("[RemoteAccess] WebRTC state:", connectionState);
          setState({
            activeSession: {
              sessionId,
              connectionState,
            },
          });

          // Note: Sessions are now ephemeral - no backend notification needed
          // Connection state is tracked via WebSocket only
          if (connectionState === "connected") {
            console.log("[RemoteAccess] ✅ WebRTC connection established (ephemeral - no DB update)");
          }

          // Clean up on disconnect
          if (connectionState === "disconnected" || connectionState === "failed" || connectionState === "closed") {
            console.log("[RemoteAccess] Session ended:", connectionState);
            webrtcHost = null;
            setState({ activeSession: null, controlEnabled: false });
          }
        },
        onError: (error) => {
          console.error("[RemoteAccess] WebRTC error:", error);
          setState({ error: error.message, activeSession: null });
          webrtcHost = null;
        },
        onControlEnabled: () => {
          // Agent directly enabled control (instant switch)
          console.log("[RemoteAccess] Control enabled by agent (instant switch)");
          setState({ controlEnabled: true });
        },
        onControlDisabled: () => {
          // Agent disabled control
          console.log("[RemoteAccess] Control disabled by agent");
          setState({ controlEnabled: false });
        },
      }, source, resolutionProfile); // Pass selected source and resolution profile

      console.log("[RemoteAccess] ✅ WebRTCHost instance created");

      // Start the session
      console.log("[RemoteAccess] Calling webrtcHost.start()...");
      await webrtcHost.start(token);

      console.log("[RemoteAccess] ✅✅✅ WebRTC session started successfully");
      setState({
        activeSession: {
          sessionId,
          connectionState: "connecting",
        },
      });
    } catch (error) {
      console.error("[RemoteAccess] ❌❌❌ Failed to start WebRTC:");
      console.error("[RemoteAccess] Error type:", error instanceof Error ? error.constructor.name : typeof error);
      console.error("[RemoteAccess] Error message:", error instanceof Error ? error.message : String(error));
      console.error("[RemoteAccess] Error stack:", error instanceof Error ? error.stack : "No stack");
      console.error("[RemoteAccess] Full error:", error);
      setState({
        error: error instanceof Error ? error.message : "Failed to start screen sharing",
        activeSession: null,
      });
      webrtcHost = null;
      // Re-throw so callers know the session failed to start
      throw error;
    }
  }

  /**
   * Stop the active WebRTC session
   */
  async function stopSession(): Promise<void> {
    if (webrtcHost) {
      console.log("[RemoteAccess] Stopping WebRTC session");
      await webrtcHost.stop();
      webrtcHost = null;
    }
    setState({ activeSession: null, controlEnabled: false });
  }

  /**
   * Revoke/disable control (requester can disable agent's control)
   */
  function revokeControl(): void {
    if (!webrtcHost) {
      console.error("[RemoteAccess] Cannot revoke control - no active session");
      return;
    }
    console.log("[RemoteAccess] Revoking control");
    webrtcHost.disableControl();
    setState({ controlEnabled: false });
  }

  /**
   * Handle incoming remote access request (LEGACY - redirects to auto-start)
   */
  async function handleRemoteAccessRequest(data: RemoteAccessRequestData): Promise<void> {
    // LEGACY: Convert to auto-start flow
    await handleRemoteSessionAutoStart(data);
  }

  /**
   * Handle remote session auto-start (SILENT auto-open flow)
   *
   * This is the completely silent flow where:
   * - NO approval dialog is shown
   * - NO notification is shown
   * - NO screen picker is shown
   * - Primary monitor is auto-selected
   * - Screen sharing starts IMMEDIATELY in background
   * - Default mode is VIEW
   * - Agent can switch to CONTROL mode instantly (no approval needed)
   */
  async function handleRemoteSessionAutoStart(data: RemoteAccessRequestData): Promise<void> {
    console.log("[RemoteAccess] ========================================");
    console.log("[RemoteAccess] 🚀🚀🚀 SILENT REMOTE SESSION AUTO-START!");
    console.log("[RemoteAccess] ========================================");
    console.log("[RemoteAccess] Received data:", JSON.stringify(data, null, 2));
    console.log("[RemoteAccess] Agent:", data.agentName);
    console.log("[RemoteAccess] Session ID:", data.sessionId);
    console.log("[RemoteAccess] Request Title:", data.requestTitle);

    // Deduplication: skip if this session is already being started
    if (sessionStartInProgress === data.sessionId) {
      console.log("[RemoteAccess] ⏭️ Session already being started, skipping duplicate call");
      return;
    }

    // Deduplication: skip if session is already active
    if (state.activeSession?.sessionId === data.sessionId) {
      console.log("[RemoteAccess] ⏭️ Session already active, skipping duplicate call");
      return;
    }

    // Mark this session as being started
    sessionStartInProgress = data.sessionId;

    try {
      // SILENT MODE: No notification, no window foreground, no picker
      // Auto-select primary monitor and start immediately

      console.log("[RemoteAccess] Step 1: Getting primary monitor...");
      // Get primary monitor
      const primaryMonitor = await getPrimaryMonitor();

      if (!primaryMonitor) {
        console.error("[RemoteAccess] ❌ Failed to get primary monitor - cannot auto-start");
        setState({ error: "Failed to detect monitor for screen sharing" });
        return;
      }

      console.log("[RemoteAccess] ✅ Auto-selected primary monitor:", primaryMonitor.name);
      console.log("[RemoteAccess] Monitor ID:", primaryMonitor.id);
      console.log("[RemoteAccess] Resolution:", primaryMonitor.width, "x", primaryMonitor.height);

      console.log("[RemoteAccess] Step 2: Starting WebRTC session...");
      // Start WebRTC session immediately with primary monitor (completely silent)
      await startWebRTCSession(data.sessionId, primaryMonitor);

      console.log("[RemoteAccess] ✅✅✅ Silent auto-start complete - screen sharing active");
    } catch (error) {
      console.error("[RemoteAccess] ❌❌❌ Error in handleRemoteSessionAutoStart:");
      console.error("[RemoteAccess] Error type:", error instanceof Error ? error.constructor.name : typeof error);
      console.error("[RemoteAccess] Error message:", error instanceof Error ? error.message : String(error));
      console.error("[RemoteAccess] Error stack:", error instanceof Error ? error.stack : "No stack");
      setState({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      // Clear the in-progress flag regardless of success/failure
      sessionStartInProgress = null;
    }
  }

  /**
   * Handle screen/window selection from picker
   * Starts WebRTC session with selected source
   */
  async function handlePickerShare(source: SelectedSource): Promise<void> {
    const sessionId = state.pendingSessionId;
    if (!sessionId) {
      console.error("[RemoteAccess] No pending session for screen share");
      return;
    }

    console.log("[RemoteAccess] Selected source:", source);

    // Close picker
    setState({
      isPickerOpen: false,
      pendingSessionId: null,
    });

    // Start WebRTC with selected source
    await startWebRTCSession(sessionId, source);
  }

  /**
   * Cancel screen share picker
   * Closes picker without starting session
   */
  function handlePickerCancel(): void {
    console.log("[RemoteAccess] Screen share picker cancelled");
    setState({
      isPickerOpen: false,
      pendingSessionId: null,
    });
  }

  /**
   * Set the resolution profile for streaming
   * @param profile - Resolution profile to use ("standard" or "extreme")
   */
  function setResolutionProfile(profile: ResolutionProfile): void {
    console.log("[RemoteAccess] Setting resolution profile:", profile);
    setState({ resolutionProfile: profile });
  }

  /**
   * Handle direct control enable from agent (instant switch)
   *
   * In the auto-open flow, agent can enable control directly without requester approval.
   * This function is called when we receive 'control_enabled' WebSocket message.
   */
  function handleControlEnabled(): void {
    console.log("[RemoteAccess] Control enabled by agent (instant switch)");

    if (!webrtcHost) {
      console.error("[RemoteAccess] Cannot enable control - no active session");
      return;
    }

    // Enable control on WebRTC host
    webrtcHost.enableControlFromAgent();

    // Update state
    setState({ controlEnabled: true });
  }

  /**
   * Handle control disabled from agent
   */
  function handleControlDisabled(): void {
    console.log("[RemoteAccess] Control disabled by agent");

    if (!webrtcHost) {
      console.error("[RemoteAccess] Cannot disable control - no active session");
      return;
    }

    // Disable control on WebRTC host
    webrtcHost.disableControl();

    // Update state
    setState({ controlEnabled: false });
  }

  return {
    state,
    handleRemoteAccessRequest,
    handleRemoteSessionAutoStart,
    stopSession,
    revokeControl,
    handlePickerShare,
    handlePickerCancel,
    setResolutionProfile,
    handleControlEnabled,
    handleControlDisabled,
  };
}

// Create singleton instance
export const remoteAccessStore = createRoot(createRemoteAccessStore);
