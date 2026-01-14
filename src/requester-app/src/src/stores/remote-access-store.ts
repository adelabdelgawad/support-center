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
import { logger } from "@/logging/logger";

// Monitor info from Tauri
interface MonitorInfo {
  id: number;
  name: string;
  width: number;
  height: number;
  isPrimary: boolean;
}

/** Banner session info for UI display */
interface BannerSession {
  sessionId: string;
  agentName: string;
  startedAt: string;
}

/** Pending session waiting for user acceptance */
interface PendingSession {
  sessionId: string;
  agentName: string;
  requestTitle: string;
  expiresAt: string;
  countdownSeconds: number;
  createdAt: string;
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
  /** Banner visibility state for user awareness (FR-002) */
  bannerSessions: BannerSession[];
  /** Session waiting for user acceptance (with countdown) */
  pendingSession: PendingSession | null;
}

// Store WebRTCHost instance outside of state (not serializable)
let webrtcHost: WebRTCHost | null = null;

// Track session currently being started to prevent duplicate calls
let sessionStartInProgress: string | null = null;

// Shared constant for acceptance timeout
const ACCEPTANCE_TIMEOUT_SECONDS = 10;

// Track active countdown timers
const countdownTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

// Track action taken to prevent race conditions (timeout vs user action)
const sessionActionTaken: Map<string, boolean> = new Map();

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
    // Banner sessions for user awareness indicator (FR-002)
    bannerSessions: [],
    // Pending session waiting for user acceptance
    pendingSession: null,
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
   * Start acceptance timer for pending session
   * Auto-accepts after ACCEPTANCE_TIMEOUT_SECONDS
   */
  function startAcceptanceTimer(sessionId: string): void {
    // Clear existing timer if any
    if (countdownTimers.has(sessionId)) {
      clearTimeout(countdownTimers.get(sessionId)!);
    }

    // Set 10-second timer - timeout results in ACCEPT, not reject
    const timerId = setTimeout(async () => {
      console.log("[RemoteAccess] Acceptance timeout - auto-accepting session:", sessionId);
      await acceptPendingSession();
    }, ACCEPTANCE_TIMEOUT_SECONDS * 1000);

    countdownTimers.set(sessionId, timerId);
    logger.info('remote-support', 'Acceptance timer started', { sessionId, timeout: ACCEPTANCE_TIMEOUT_SECONDS });
  }

  /**
   * Clear acceptance timer for a session
   */
  function clearAcceptanceTimer(sessionId: string): void {
    if (countdownTimers.has(sessionId)) {
      clearTimeout(countdownTimers.get(sessionId)!);
      countdownTimers.delete(sessionId);
      logger.info('remote-support', 'Acceptance timer cleared', { sessionId });
    }
  }

  /**
   * Handle incoming remote session request (NEW FLOW - requires acceptance)
   *
   * This replaces silent auto-start with a user-controlled flow:
   * - Shows banner with countdown (10s)
   * - User can Accept or Reject
   * - Auto-rejects on timeout
   * - WebRTC only starts after Accept
   */
  async function handleIncomingSessionRequest(data: RemoteAccessRequestData): Promise<void> {
    logger.info('remote-support', 'Incoming remote session request (acceptance required)', {
      sessionId: data.sessionId,
      agentName: data.agentName,
      requestTitle: data.requestTitle,
    });
    console.log("[RemoteAccess] ========================================");
    console.log("[RemoteAccess] 📨 INCOMING REMOTE SESSION REQUEST");
    console.log("[RemoteAccess] ========================================");
    console.log("[RemoteAccess] Received data:", JSON.stringify(data, null, 2));
    console.log("[RemoteAccess] Agent:", data.agentName);
    console.log("[RemoteAccess] Session ID:", data.sessionId);
    console.log("[RemoteAccess] Request Title:", data.requestTitle);

    // Deduplication: skip if already pending
    if (state.pendingSession?.sessionId === data.sessionId) {
      console.log("[RemoteAccess] ⏭️ Session already pending, skipping duplicate call");
      return;
    }

    // Deduplication: skip if session is already active
    if (state.activeSession?.sessionId === data.sessionId) {
      console.log("[RemoteAccess] ⏭️ Session already active, skipping duplicate call");
      return;
    }

    // Clear any existing pending session (only one pending at a time)
    if (state.pendingSession) {
      console.log("[RemoteAccess] Clearing existing pending session:", state.pendingSession.sessionId);
      clearAcceptanceTimer(state.pendingSession.sessionId);
      sessionActionTaken.delete(state.pendingSession.sessionId);
    }

    // Create pending session with countdown
    const pending: PendingSession = {
      sessionId: data.sessionId,
      agentName: data.agentName || "IT Support",
      requestTitle: data.requestTitle || "Remote Support",
      expiresAt: data.expiresAt || new Date(Date.now() + ACCEPTANCE_TIMEOUT_SECONDS * 1000).toISOString(),
      countdownSeconds: ACCEPTANCE_TIMEOUT_SECONDS,
      createdAt: new Date().toISOString(),
    };

    setState({ pendingSession: pending });

    // Start countdown timer (auto-reject after 10s)
    startAcceptanceTimer(data.sessionId);

    logger.info('remote-support', 'Pending session created - waiting for user acceptance', {
      sessionId: data.sessionId,
      agentName: pending.agentName,
      timeoutSeconds: ACCEPTANCE_TIMEOUT_SECONDS,
    });
    console.log("[RemoteAccess] ✅ Pending session created - waiting for user acceptance");
  }

  /**
   * Accept pending session - start WebRTC connection
   * Called when user clicks Accept button
   */
  async function acceptPendingSession(): Promise<void> {
    const pending = state.pendingSession;
    if (!pending) {
      console.warn("[RemoteAccess] No pending session to accept");
      return;
    }

    // Check if action already taken (race condition prevention)
    if (sessionActionTaken.get(pending.sessionId)) {
      console.log("[RemoteAccess] Action already taken for session - ignoring");
      return;
    }

    // Mark action as taken
    sessionActionTaken.set(pending.sessionId, true);

    logger.info('remote-support', 'User accepted remote session', {
      sessionId: pending.sessionId,
      agentName: pending.agentName,
    });
    console.log("[RemoteAccess] ========================================");
    console.log("[RemoteAccess] ✅ USER ACCEPTED REMOTE SESSION");
    console.log("[RemoteAccess] ========================================");
    console.log("[RemoteAccess] Session ID:", pending.sessionId);
    console.log("[RemoteAccess] Agent:", pending.agentName);

    // Clear countdown timer
    clearAcceptanceTimer(pending.sessionId);

    // Remove from pending state
    setState({ pendingSession: null });

    // Mark session as being started
    sessionStartInProgress = pending.sessionId;

    try {
      // Add to banner sessions immediately for user awareness
      const newBannerSession: BannerSession = {
        sessionId: pending.sessionId,
        agentName: pending.agentName,
        startedAt: new Date().toISOString(),
      };

      setState("bannerSessions", [...state.bannerSessions, newBannerSession]);
      logger.info('remote-support', 'Banner session added after acceptance', {
        sessionId: pending.sessionId,
        agentName: newBannerSession.agentName,
      });

      // Update floating icon
      await updateFloatingIconRemoteState(true, pending.agentName);

      // Get primary monitor (same as auto-start flow)
      console.log("[RemoteAccess] Getting primary monitor...");
      const primaryMonitor = await getPrimaryMonitor();

      if (!primaryMonitor) {
        console.error("[RemoteAccess] ❌ Failed to get primary monitor");
        setState({ error: "Failed to detect monitor for screen sharing" });
        await rejectPendingSession("error");
        return;
      }

      console.log("[RemoteAccess] ✅ Auto-selected primary monitor:", primaryMonitor.name);

      // Start WebRTC session
      console.log("[RemoteAccess] Starting WebRTC session...");
      await startWebRTCSession(pending.sessionId, primaryMonitor);

      logger.info('remote-support', 'Remote session started after acceptance', {
        sessionId: pending.sessionId,
      });
      console.log("[RemoteAccess] ✅✅✅ Remote session started after acceptance");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('remote-support', 'Failed to start session after acceptance', {
        sessionId: pending.sessionId,
        error: errorMessage,
      });
      console.error("[RemoteAccess] ❌ Failed to start session after acceptance:", errorMessage);
      setState({ error: errorMessage });
    } finally {
      // Clear the in-progress flag and action flag
      sessionStartInProgress = null;
      sessionActionTaken.delete(pending.sessionId);
    }
  }

  /**
   * Reject pending session - reuse termination logic
   * Called when user clicks Reject or timeout occurs
   */
  async function rejectPendingSession(reason: "user" | "timeout" | "error" = "user"): Promise<void> {
    const pending = state.pendingSession;
    if (!pending) {
      console.warn("[RemoteAccess] No pending session to reject");
      return;
    }

    // Check if action already taken (race condition prevention)
    if (sessionActionTaken.get(pending.sessionId)) {
      console.log("[RemoteAccess] Action already taken for session - ignoring");
      return;
    }

    // Mark action as taken
    sessionActionTaken.set(pending.sessionId, true);

    logger.info('remote-support', 'Rejecting pending session', {
      sessionId: pending.sessionId,
      reason,
    });
    console.log("[RemoteAccess] ========================================");
    console.log("[RemoteAccess] ❌ REJECTING PENDING SESSION");
    console.log("[RemoteAccess] ========================================");
    console.log("[RemoteAccess] Session ID:", pending.sessionId);
    console.log("[RemoteAccess] Reason:", reason);

    // Clear countdown timer
    clearAcceptanceTimer(pending.sessionId);

    // Remove from pending state
    setState({ pendingSession: null });

    // Reuse termination logic for cleanup
    // This stops any partially started session, cleans up state
    await handleTerminationRequest(pending.sessionId);

    logger.info('remote-support', 'Pending session rejected', {
      sessionId: pending.sessionId,
      reason,
    });
    console.log("[RemoteAccess] ✅ Pending session rejected successfully");

    // Clear action flag
    sessionActionTaken.delete(pending.sessionId);
  }

  /**
   * Start WebRTC session for screen sharing
   * @param sessionId - The session ID for WebRTC signaling
   * @param source - Optional source selection (if undefined, will use browser picker)
   */
  async function startWebRTCSession(sessionId: string, source?: SelectedSource): Promise<void> {
    logger.info('remote-support', 'startWebRTCSession called', {
      sessionId,
      hasSource: !!source,
      sourceType: source?.type,
      sourceName: source?.name,
      resolutionProfile: state.resolutionProfile,
    });
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

      logger.info('remote-support', 'WebRTC session started successfully', {
        sessionId,
        resolutionProfile,
      });
      console.log("[RemoteAccess] ✅✅✅ WebRTC session started successfully");
      setState({
        activeSession: {
          sessionId,
          connectionState: "connecting",
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('remote-support', 'Failed to start WebRTC session', {
        sessionId,
        error: errorMessage,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
      });
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
      logger.info('remote-support', 'Stopping WebRTC session from store');
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
   * Handle remote session auto-start (NOW REDIRECTS TO ACCEPTANCE FLOW)
   *
   * Previously: Silent auto-start (no approval)
   * Now: Redirects to handleIncomingSessionRequest which requires user acceptance
   *
   * This is the NEW flow where:
   * - Shows banner with countdown (10s)
   * - User must click Accept or Reject
   * - Auto-rejects on timeout
   * - WebRTC only starts after Accept
   */
  async function handleRemoteSessionAutoStart(data: RemoteAccessRequestData): Promise<void> {
    logger.info('remote-support', 'Remote session auto-start received - redirecting to acceptance flow', {
      sessionId: data.sessionId,
      agentName: data.agentName,
      requestTitle: data.requestTitle,
    });
    console.log("[RemoteAccess] ========================================");
    console.log("[RemoteAccess] 📨 REMOTE SESSION REQUEST - REQUIRES ACCEPTANCE");
    console.log("[RemoteAccess] ========================================");
    console.log("[RemoteAccess] Redirecting to handleIncomingSessionRequest...");

    // Redirect to new acceptance flow
    await handleIncomingSessionRequest(data);
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

  /**
   * Handle remote session ended (FR-007, FR-017, FR-018)
   * Clears the banner when session terminates
   */
  async function handleRemoteSessionEnded(sessionId: string): Promise<void> {
    logger.info('remote-support', 'Remote session ended - clearing banner', {
      sessionId,
    });
    console.log("[RemoteAccess] Session ended, removing from banner:", sessionId);

    // Remove session from banner (FR-007: removed within 2 seconds)
    const updatedSessions = state.bannerSessions.filter(
      (s) => s.sessionId !== sessionId
    );
    setState("bannerSessions", updatedSessions);

    // Reset floating icon if no more active sessions
    if (updatedSessions.length === 0) {
      await updateFloatingIconRemoteState(false);
    }

    logger.info('remote-support', 'Banner session removed', {
      sessionId,
      remainingSessions: updatedSessions.length,
    });
  }

  /**
   * Clear all banner sessions (for disconnect/cleanup scenarios)
   * Called when connection is definitively lost (FR-019)
   */
  async function clearAllBannerSessions(): Promise<void> {
    logger.info('remote-support', 'Clearing all banner sessions (disconnect)');
    console.log("[RemoteAccess] Clearing all banner sessions");
    setState("bannerSessions", []);

    // Also clear any pending session
    if (state.pendingSession) {
      console.log("[RemoteAccess] Clearing pending session during disconnect");
      clearAcceptanceTimer(state.pendingSession.sessionId);
      setState({ pendingSession: null });
    }

    // Reset floating icon
    await updateFloatingIconRemoteState(false);
  }

  /**
   * Get banner sessions for UI rendering
   * Used by RemoteSessionBanner component
   */
  function getBannerSessions(): BannerSession[] {
    return state.bannerSessions;
  }

  /**
   * Check if any remote session is active (for banner visibility)
   */
  function isBannerVisible(): boolean {
    return state.bannerSessions.length > 0;
  }

  /**
   * Update floating icon remote session state
   */
  async function updateFloatingIconRemoteState(isActive: boolean, agentName?: string): Promise<void> {
    try {
      await invoke('update_floating_icon_remote_state', {
        isActive,
        agentName: agentName || null
      });
      logger.info('remote-support', 'Floating icon remote state updated', {
        isActive,
        agentName,
      });
    } catch (error) {
      logger.error('remote-support', 'Failed to update floating icon remote state', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Handle termination request from user (via terminate button)
   * Stops WebRTC session, notifies agent, and hides panel
   */
  async function handleTerminationRequest(sessionId: string): Promise<void> {
    logger.info('remote-support', 'User requested session termination', {
      sessionId,
    });
    console.log("[RemoteAccess] User terminated session:", sessionId);

    try {
      // Stop WebRTC session
      if (webrtcHost) {
        console.log("[RemoteAccess] Stopping WebRTC session...");
        await webrtcHost.stop();
        webrtcHost = null;
      }

      // Remove from banner sessions
      const updatedSessions = state.bannerSessions.filter(
        (s) => s.sessionId !== sessionId
      );
      setState("bannerSessions", updatedSessions);

      // Update floating icon if no more sessions
      if (updatedSessions.length === 0) {
        await updateFloatingIconRemoteState(false);
      }

      // Notify agent via SignalR (optional - will be handled by SignalR disconnect)
      // The WebRTC stop() will close the signaling connection, which automatically
      // notifies the agent that the session ended

      logger.info('remote-support', 'Session terminated by user', {
        sessionId,
      });
      console.log("[RemoteAccess] ✅ Session terminated successfully");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('remote-support', 'Failed to terminate session', {
        sessionId,
        error: errorMessage,
      });
      console.error("[RemoteAccess] ❌ Failed to terminate session:", errorMessage);
      setState({
        error: errorMessage,
        activeSession: null,
        controlEnabled: false,
      });
    }
  }

  return {
    state,
    handleRemoteAccessRequest,
    handleRemoteSessionAutoStart,
    handleRemoteSessionEnded,
    clearAllBannerSessions,
    getBannerSessions,
    isBannerVisible,
    stopSession,
    revokeControl,
    handlePickerShare,
    handlePickerCancel,
    setResolutionProfile,
    handleControlEnabled,
    handleControlDisabled,
    updateFloatingIconRemoteState,
    handleTerminationRequest,
    acceptPendingSession,
    rejectPendingSession,
  };
}

// Create singleton instance
export const remoteAccessStore = createRoot(createRemoteAccessStore);

/**
 * Hook to access banner sessions for the RemoteSessionBanner component
 */
export function useBannerSessions() {
  return remoteAccessStore.getBannerSessions();
}
