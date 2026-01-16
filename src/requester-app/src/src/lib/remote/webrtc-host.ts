/**
 * WebRTC Host - Requester Side
 *
 * Handles WebRTC connection as the host (answerer) for remote access sessions.
 * Uses SignalR for signaling instead of raw WebSocket.
 *
 * Responsible for:
 * - Receiving SDP offers from agent via SignalR
 * - Creating and sending SDP answers via SignalR
 * - ICE candidate exchange via SignalR
 * - Screen sharing stream management
 */

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { fetchTURNCredentials } from '../../api/turn-client';
import { createTauriScreenStream, ResolutionProfile, RESOLUTION_PROFILES } from './tauri-screen-stream';
import { signalRRemoteAccess } from '@/signalr';
import type { HubConnection } from '@microsoft/signalr';
import * as signalR from '@microsoft/signalr';
import { logger } from '@/logging/logger';
import { RuntimeConfig } from '../runtime-config';

interface SignalingMessage {
  type: string;
  data: any;
}

interface SelectedSource {
  type: "screen" | "window";
  id: number;
  name: string;
  width?: number;
  height?: number;
}

interface WebRTCHostCallbacks {
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onError?: (error: Error) => void;
  /** Called when agent enables control (instant switch) */
  onControlEnabled?: () => void;
  /** Called when agent disables control */
  onControlDisabled?: () => void;
}

interface WebRTCHostOptions {
  callbacks?: WebRTCHostCallbacks;
  source?: SelectedSource;
  resolutionProfile?: ResolutionProfile;
}

export class WebRTCHost {
  private peerConnection: RTCPeerConnection | null = null;
  private signalRConnected: boolean = false;
  private signalREventCleanup: (() => void) | null = null;
  private sessionId: string;
  private screenStream: MediaStream | null = null;
  private callbacks: WebRTCHostCallbacks;
  private controlChannel: RTCDataChannel | null = null;
  private clipboardChannel: RTCDataChannel | null = null;
  private controlEnabled: boolean = false;
  private uacUnlisten: (() => void) | null = null;
  // Queue for ICE candidates that arrive before peer connection is ready
  private pendingIceCandidates: RTCIceCandidateInit[] = [];

  // Mouse move optimization: only process latest position
  private pendingMouseMove: { x: number; y: number } | null = null;
  private isProcessingMouseMove: boolean = false;

  // Disconnect detection: timeout for 'disconnected' state before stopping
  private disconnectedTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private static readonly DISCONNECTED_TIMEOUT_MS = 5000; // 5 seconds grace period

  // SignalR disconnect detection: timeout for SignalR reconnect before stopping
  private signalRDisconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private static readonly SIGNALR_DISCONNECT_TIMEOUT_MS = 15000; // 15 seconds grace period

  // Session heartbeat: periodic beacon to backend for orphan detection
  private heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;
  private static readonly HEARTBEAT_INTERVAL_MS = 15000; // 15 seconds

  // Selected source from custom picker
  private selectedSource: SelectedSource | null = null;

  // Resolution profile for streaming quality
  private resolutionProfile: ResolutionProfile = "standard";

  constructor(sessionId: string, callbacks: WebRTCHostCallbacks = {}, source?: SelectedSource, resolutionProfile: ResolutionProfile = "standard") {
    this.sessionId = sessionId;
    this.callbacks = callbacks;
    this.selectedSource = source || null;
    this.resolutionProfile = resolutionProfile;

    console.log(`[WebRTCHost] Initialized with resolution profile: ${resolutionProfile}`);
  }

  /**
   * Start the remote access session
   * - Starts screen capture (user selects screen)
   * - Connects to signaling server
   * - Sets up WebRTC connection
   */
  async start(token: string): Promise<void> {
    try {
      logger.info('remote-support', 'Starting remote access session', {
        sessionId: this.sessionId,
        resolutionProfile: this.resolutionProfile,
      });
      console.log("[WebRTCHost] Starting remote access session:", this.sessionId);

      // Step 1: Start screen capture FIRST (user must select screen before we connect)
      // This ensures the stream is ready when the offer arrives
      await this.startScreenCapture();

      // Step 2: Connect to SignalR signaling hub (agent will send offer after this)
      await this.connectSignaling(token);

      // Step 3: Start UAC detection
      await this.startUACDetection();

      // Step 4: Start heartbeat to keep session alive
      this.startHeartbeat();

      logger.info('remote-support', 'Session started successfully', {
        sessionId: this.sessionId,
      });
      console.log("[WebRTCHost] Session started successfully");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('remote-support', 'Error starting session', {
        sessionId: this.sessionId,
        error: errorMessage,
      });
      console.error("[WebRTCHost] Error starting session:", error);
      this.callbacks.onError?.(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Start UAC detection and send events to agent
   */
  private async startUACDetection(): Promise<void> {
    try {
      // Start UAC detection
      await invoke("start_uac_detection");

      // Listen for UAC detected events
      const unlistenDetected = await listen("uac_detected", () => {
        console.log("[WebRTCHost] UAC detected");
        this.sendSignalingMessage({
          type: "uac_detected",
          data: {},
        });
      });

      // Listen for UAC dismissed events
      const unlistenDismissed = await listen("uac_dismissed", () => {
        console.log("[WebRTCHost] UAC dismissed");
        this.sendSignalingMessage({
          type: "uac_dismissed",
          data: {},
        });
      });

      // Store unlisten function for cleanup
      this.uacUnlisten = () => {
        unlistenDetected();
        unlistenDismissed();
      };

      console.log("[WebRTCHost] UAC detection started");
    } catch (error) {
      console.error("[WebRTCHost] Error starting UAC detection:", error);
      // Don't throw - UAC detection is optional
    }
  }

  /**
   * Connect to SignalR remote access hub
   */
  private async connectSignaling(token: string): Promise<void> {
    console.log("[WebRTCHost] Connecting to SignalR remote access hub...");
    console.log("[WebRTCHost] Session ID:", this.sessionId);

    try {
      // Connect to SignalR
      await signalRRemoteAccess.connect();

      // Get the internal connection for event handling
      const connection = (signalRRemoteAccess as any).connection as HubConnection | null;
      if (!connection) {
        throw new Error("Failed to get SignalR connection");
      }

      // CRITICAL: Register for SignalR disconnect with grace period
      // This handles: IT browser crash, network drop, tab close without graceful leave
      // NOTE: SignalR reconnects are common and transient - don't stop immediately
      // WebRTC media can continue working during SignalR reconnects
      signalRRemoteAccess.setGlobalHandlers({
        onDisconnect: () => {
          console.log('[WebRTCHost] ⚠️ SignalR DISCONNECTED - starting grace period');
          logger.warn('remote-support', 'SignalR disconnected - starting grace period', {
            sessionId: this.sessionId,
            timeoutMs: WebRTCHost.SIGNALR_DISCONNECT_TIMEOUT_MS,
          });
          // Don't stop immediately - SignalR may reconnect
          // WebRTC media can continue during SignalR reconnect
          // Only stop if SignalR doesn't recover within 15 seconds
          this.startSignalRDisconnectGracePeriod();
        },
        onReconnecting: (attempt) => {
          console.log(`[WebRTCHost] ⚠️ SignalR reconnecting (attempt ${attempt}) - clearing grace period timeout`);
          logger.info('remote-support', 'SignalR reconnecting - clearing grace period timeout', {
            sessionId: this.sessionId,
            attempt,
          });
          this.clearSignalRDisconnectGracePeriod();
        },
        onReconnected: () => {
          console.log('[WebRTCHost] ✅ SignalR reconnected - clearing grace period timeout');
          logger.info('remote-support', 'SignalR reconnected - clearing grace period timeout', {
            sessionId: this.sessionId,
          });
          this.clearSignalRDisconnectGracePeriod();
        },
      });

      // Set up SignalR event handlers
      this.setupSignalRHandlers(connection);

      // Join the remote access session
      await signalRRemoteAccess.invoke('JoinSession', this.sessionId, 'requester');

      this.signalRConnected = true;
      console.log("[WebRTCHost] ✅ SignalR connected and joined session successfully");
    } catch (error) {
      console.error("[WebRTCHost] ❌ SignalR connection failed:", error);
      throw new Error("Failed to connect to signaling server");
    }
  }

  /**
   * Set up SignalR event handlers for remote access signaling
   */
  private setupSignalRHandlers(connection: HubConnection): void {
    // Remove any existing handlers
    connection.off('SdpOffer');
    connection.off('IceCandidate');
    connection.off('ControlEnabled');
    connection.off('ControlDisabled');
    connection.off('ParticipantLeft');
    connection.off('ParticipantJoined');
    connection.off('SessionJoined');

    // Session joined confirmation (we successfully joined)
    connection.on('SessionJoined', (data: { sessionId: string; participantType: string }) => {
      console.log('[WebRTCHost] ✅ Session joined confirmation received:', data.sessionId);
    });

    // Participant joined (agent connected to our session)
    connection.on('ParticipantJoined', (data: { sessionId: string; participantType: string; userId: string }) => {
      console.log('[WebRTCHost] 👤 Participant joined:', data.participantType, 'userId:', data.userId);
      if (data.sessionId === this.sessionId) {
        console.log('[WebRTCHost] Agent joined session - ready for WebRTC signaling');
      }
    });

    // SDP Offer from agent
    connection.on('SdpOffer', (data: { sessionId: string; payload: { sdp: string; type: string }; fromUserId: string }) => {
      console.log('[WebRTCHost] Received SdpOffer via SignalR');
      if (data.sessionId === this.sessionId) {
        this.handleOffer(data.payload);
      }
    });

    // ICE Candidate from agent
    connection.on('IceCandidate', (data: { sessionId: string; payload: { candidate: string; sdpMLineIndex: number | null; sdpMid: string | null }; fromUserId: string }) => {
      console.log('[WebRTCHost] Received IceCandidate via SignalR');
      if (data.sessionId === this.sessionId) {
        this.handleIceCandidate({
          candidate: data.payload.candidate,
          sdpMLineIndex: data.payload.sdpMLineIndex,
          sdpMid: data.payload.sdpMid,
        });
      }
    });

    // Control enabled by agent
    connection.on('ControlEnabled', (data: { sessionId: string }) => {
      console.log('[WebRTCHost] Control enabled by agent via SignalR');
      if (data.sessionId === this.sessionId) {
        this.controlEnabled = true;
        this.callbacks.onControlEnabled?.();
      }
    });

    // Control disabled by agent
    connection.on('ControlDisabled', (data: { sessionId: string }) => {
      console.log('[WebRTCHost] Control disabled by agent via SignalR');
      if (data.sessionId === this.sessionId) {
        this.controlEnabled = false;
        this.callbacks.onControlDisabled?.();
      }
    });

    // Participant left (agent disconnected)
    connection.on('ParticipantLeft', (data: { sessionId: string; userId: string }) => {
      console.log('[WebRTCHost] Participant left session via SignalR');
      if (data.sessionId === this.sessionId) {
        // Agent left - stop the session
        this.stop();
      }
    });

    // Session left confirmation (we successfully left the session)
    // Register both PascalCase and camelCase to handle SignalR serialization
    const handleSessionLeft = (sessionId: string) => {
      console.log('[WebRTCHost] Session left confirmation received:', sessionId);
    };
    connection.on('SessionLeft', handleSessionLeft);
    connection.on('sessionleft', handleSessionLeft);

    // Store cleanup function
    this.signalREventCleanup = () => {
      connection.off('SdpOffer');
      connection.off('IceCandidate');
      connection.off('ControlEnabled');
      connection.off('ControlDisabled');
      connection.off('ParticipantLeft');
      connection.off('ParticipantJoined');
      connection.off('SessionJoined');
      connection.off('SessionLeft');
      connection.off('sessionleft');
    };
  }

  /**
   * Start screen capture using Tauri (bypasses browser picker)
   * Falls back to browser's getDisplayMedia if Tauri capture fails
   */
  private async startScreenCapture(): Promise<void> {
    try {
      let stream: MediaStream;
      const profileConfig = RESOLUTION_PROFILES[this.resolutionProfile];

      // If we have a selected source from the custom picker, use Tauri capture
      if (this.selectedSource && this.selectedSource.type === "screen") {
        console.log("[WebRTCHost] Using Tauri screen capture for monitor:", this.selectedSource.id);
        console.log("[WebRTCHost] Resolution profile:", this.resolutionProfile, `(${profileConfig.width}x${profileConfig.height})`);
        try {
          stream = await createTauriScreenStream({
            monitorId: this.selectedSource.id,
            frameRate: 24,
            profile: this.resolutionProfile,
          });
        } catch (tauriError) {
          console.warn("[WebRTCHost] Tauri capture failed, falling back to getDisplayMedia:", tauriError);
          // Fallback to browser picker with profile resolution
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              cursor: 'always',
              width: { ideal: profileConfig.width, max: 1920 },
              height: { ideal: profileConfig.height, max: 1080 },
              frameRate: { ideal: 24, max: 30 },
            },
            audio: false,
          });
        }
      } else {
        // No source selected or window source - use browser picker
        console.log("[WebRTCHost] Using browser getDisplayMedia");
        console.log("[WebRTCHost] Resolution profile:", this.resolutionProfile, `(${profileConfig.width}x${profileConfig.height})`);
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            cursor: 'always',
            width: { ideal: profileConfig.width, max: 1920 },
            height: { ideal: profileConfig.height, max: 1080 },
            frameRate: { ideal: 24, max: 30 },
          },
          audio: false,
        });
      }

      this.screenStream = stream;

      // Log actual capture settings
      const videoTrack = stream.getVideoTracks()[0];
      const settings = videoTrack.getSettings();
      console.log("[WebRTCHost] Screen capture started:", {
        width: settings.width,
        height: settings.height,
        frameRate: settings.frameRate,
        source: this.selectedSource ? "tauri" : "browser",
      });

      // Handle user stopping screen share
      videoTrack.onended = () => {
        console.log("[WebRTCHost] Screen sharing stopped by user");
        this.stop();
      };
    } catch (error) {
      console.error("[WebRTCHost] Error starting screen capture:", error);
      throw new Error("Failed to start screen capture");
    }
  }

  /**
   * Handle SDP offer from agent
   */
  private async handleOffer(data: any): Promise<void> {
    try {
      console.log("[WebRTCHost] Handling SDP offer, current state:", this.peerConnection?.signalingState);

      // If we already have a peer connection in stable state with tracks added,
      // this is likely a duplicate offer - ignore it
      if (this.peerConnection && this.peerConnection.signalingState === "stable") {
        const senders = this.peerConnection.getSenders();
        if (senders.length > 0) {
          console.log("[WebRTCHost] Ignoring duplicate offer - already have stable connection with", senders.length, "senders");
          return;
        }
      }

      // Create peer connection if not exists
      if (!this.peerConnection) {
        await this.createPeerConnection();  // Now async - wait for TURN credentials
      }

      const pc = this.peerConnection!;

      // Set remote description (offer)
      const offer = new RTCSessionDescription({
        type: "offer",
        sdp: data.sdp,
      });
      await pc.setRemoteDescription(offer);

      // Process any ICE candidates that arrived before peer connection was ready
      await this.processPendingIceCandidates();

      // Add screen stream to peer connection (only if not already added)
      if (this.screenStream) {
        const existingSenders = pc.getSenders();
        const existingTracks = existingSenders.map(s => s.track).filter(Boolean);
        const tracks = this.screenStream.getTracks();

        console.log(`[WebRTCHost] Screen stream has ${tracks.length} track(s), peer connection has ${existingSenders.length} sender(s)`);

        for (const track of tracks) {
          // Check if this track is already added
          if (existingTracks.includes(track)) {
            console.log(`[WebRTCHost] Track already added, skipping: ${track.kind}`);
            continue;
          }

          // Apply constraints to video track before adding to peer connection
          if (track.kind === "video") {
            const currentSettings = track.getSettings();
            const profileConfig = RESOLUTION_PROFILES[this.resolutionProfile];
            console.log(`[WebRTCHost] Current track settings before constraints:`, {
              width: currentSettings.width,
              height: currentSettings.height,
              frameRate: currentSettings.frameRate,
              profile: this.resolutionProfile,
            });

            try {
              // Apply constraints based on resolution profile
              await track.applyConstraints({
                width: { ideal: profileConfig.width, min: profileConfig.width },
                height: { ideal: profileConfig.height, min: profileConfig.height },
                frameRate: { ideal: 24, max: 30 },
              });

              const newSettings = track.getSettings();
              console.log(`[WebRTCHost] ✅ Track constraints applied:`, {
                width: newSettings.width,
                height: newSettings.height,
                frameRate: newSettings.frameRate,
              });
            } catch (error) {
              console.error(`[WebRTCHost] ❌ Failed to apply track constraints:`, error);
            }

            // Set content hint to 'detail' for better text/UI clarity
            (track as any).contentHint = 'detail';
            console.log(`[WebRTCHost] ✅ Set contentHint='detail' for screen sharing`);
          }

          console.log(`[WebRTCHost] Adding track: ${track.kind}, enabled: ${track.enabled}, readyState: ${track.readyState}`);
          pc.addTrack(track, this.screenStream!);
        }
      } else {
        console.error("[WebRTCHost] No screen stream available when handling offer!");
      }

      // Create and send answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Configure sender parameters AFTER negotiation is complete
      // This is the correct time to set parameters according to WebRTC spec
      const senders = pc.getSenders();
      for (const sender of senders) {
        if (sender.track?.kind === "video") {
          // Log current track settings
          const trackSettings = sender.track.getSettings();
          console.log("[WebRTCHost] Video track settings:", {
            width: trackSettings.width,
            height: trackSettings.height,
            frameRate: trackSettings.frameRate,
          });

          const params = sender.getParameters();

          // Determine bitrate based on resolution profile
          // Screen content needs higher bitrate than video for sharp text/UI
          // extreme (1920x1080): 35 Mbps for pristine quality
          // standard (960x540): 12 Mbps for near-lossless quality
          const maxBitrate = this.resolutionProfile === "extreme" ? 35000000 : 12000000;

          // Create encoding object with settings to prevent downscaling
          const encoding: RTCRtpEncodingParameters = {
            active: true,
            scaleResolutionDownBy: 1.0, // No downscaling
            maxBitrate: maxBitrate,
            maxFramerate: 30,
          };

          // Set encodings array with our configuration
          params.encodings = [encoding];

          // Set degradation preference to maintain resolution over framerate
          // This prevents WebRTC from downscaling due to bandwidth constraints
          (params as any).degradationPreference = 'maintain-resolution';

          try {
            await sender.setParameters(params);
            console.log("[WebRTCHost] ✅ Sender parameters configured:", {
              scaleResolutionDownBy: 1.0,
              maxBitrate: maxBitrate,
              profile: this.resolutionProfile,
              degradationPreference: 'maintain-resolution',
            });
          } catch (error) {
            console.error("[WebRTCHost] ❌ Failed to set sender parameters:", error);
          }
        }
      }

      console.log("[WebRTCHost] Sending SDP answer");
      this.sendSignalingMessage({
        type: "sdp_answer",
        data: {
          sdp: answer.sdp,
          type: answer.type,
        },
      });
    } catch (error) {
      console.error("[WebRTCHost] Error handling offer:", error);
      throw error;
    }
  }

  /**
   * Handle ICE candidate from agent
   */
  private async handleIceCandidate(data: any): Promise<void> {
    try {
      if (!data.candidate) return;

      const candidateInit: RTCIceCandidateInit = {
        candidate: data.candidate,
        sdpMLineIndex: data.sdpMLineIndex,
        sdpMid: data.sdpMid,
      };

      // Queue candidate if peer connection not ready yet
      if (!this.peerConnection || !this.peerConnection.remoteDescription) {
        console.log("[WebRTCHost] Queuing ICE candidate (peer connection not ready)");
        this.pendingIceCandidates.push(candidateInit);
        return;
      }

      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidateInit));
      console.log("[WebRTCHost] Added ICE candidate");
    } catch (error) {
      console.error("[WebRTCHost] Error handling ICE candidate:", error);
    }
  }

  /**
   * Process queued ICE candidates after peer connection is ready
   */
  private async processPendingIceCandidates(): Promise<void> {
    if (!this.peerConnection || this.pendingIceCandidates.length === 0) return;

    console.log(`[WebRTCHost] Processing ${this.pendingIceCandidates.length} queued ICE candidates`);

    for (const candidateInit of this.pendingIceCandidates) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidateInit));
      } catch (error) {
        console.error("[WebRTCHost] Error adding queued ICE candidate:", error);
      }
    }

    this.pendingIceCandidates = [];
  }

  /**
   * Create RTCPeerConnection with TURN support
   */
  private async createPeerConnection(): Promise<void> {
    // Fetch TURN credentials from backend
    logger.info('remote-support', 'Creating peer connection', { sessionId: this.sessionId });
    const iceServers = await fetchTURNCredentials();

    const configuration: RTCConfiguration = {
      iceServers: iceServers,
      iceTransportPolicy: 'all',  // Prefer P2P (host/srflx) on LAN, fallback to TURN (relay)
      iceCandidatePoolSize: 10,
    };

    const pc = new RTCPeerConnection(configuration);
    this.peerConnection = pc;

    // Enhanced ICE logging for debugging NAT traversal
    pc.onicegatheringstatechange = () => {
      logger.info('remote-support', 'ICE gathering state changed', {
        sessionId: this.sessionId,
        gatheringState: pc.iceGatheringState,
      });
      console.log("[WebRTCHost] ICE gathering state:", pc.iceGatheringState);
    };

    pc.oniceconnectionstatechange = () => {
      logger.info('remote-support', 'ICE connection state changed', {
        sessionId: this.sessionId,
        iceConnectionState: pc.iceConnectionState,
      });
      console.log("[WebRTCHost] ICE connection state:", pc.iceConnectionState);

      if (pc.iceConnectionState === 'failed') {
        logger.error('remote-support', 'ICE connection failed - NAT traversal issue', {
          sessionId: this.sessionId,
        });
        console.error("[WebRTCHost] ICE connection failed - NAT traversal issue");
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        // Parse candidate string to extract IP and type
        const candidateStr = event.candidate.candidate;
        const ipMatch = candidateStr.match(/(\d+\.\d+\.\d+\.\d+)/);
        const typeMatch = candidateStr.match(/typ (\w+)/);

        console.log("[WebRTCHost] ICE candidate:", {
          type: event.candidate.type || typeMatch?.[1] || 'unknown',  // 'relay' = TURN working!
          protocol: event.candidate.protocol,
          address: ipMatch ? ipMatch[1] : 'no-ip-found',
          candidate: candidateStr.substring(0, 50) + '...',  // Show first 50 chars of SDP
        });

        // Log TURN success when relay candidate is found
        if (event.candidate.type === 'relay' || candidateStr.includes('typ relay')) {
          logger.info('remote-support', 'TURN server working - relay candidate found', {
            sessionId: this.sessionId,
            protocol: event.candidate.protocol,
          });
          console.log("✅ [WebRTCHost] TURN server is working! Relay candidate found.");
        }

        this.sendSignalingMessage({
          type: "ice_candidate",
          data: {
            candidate: event.candidate.candidate,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
            sdpMid: event.candidate.sdpMid,
          },
        });
      }
    };

    // Handle connection state changes with faster disconnect detection
    pc.onconnectionstatechange = () => {
      logger.info('remote-support', 'WebRTC connection state changed', {
        sessionId: this.sessionId,
        connectionState: pc.connectionState,
      });
      console.log("[WebRTCHost] Connection state:", pc.connectionState);
      this.callbacks.onConnectionStateChange?.(pc.connectionState);

      // Clear any pending disconnect timeout
      if (this.disconnectedTimeoutId) {
        clearTimeout(this.disconnectedTimeoutId);
        this.disconnectedTimeoutId = null;
      }

      switch (pc.connectionState) {
        case "connected":
          logger.info('remote-support', 'WebRTC peer connected successfully', {
            sessionId: this.sessionId,
          });
          console.log("[WebRTCHost] ✅ WebRTC peer connected");
          break;

        case "disconnected":
          // Start a timeout - if we don't recover in 5 seconds, stop the session
          // This is faster than waiting for 'failed' state (which can take 25-30s)
          logger.warn('remote-support', 'WebRTC peer disconnected - starting recovery timeout', {
            sessionId: this.sessionId,
            timeoutMs: WebRTCHost.DISCONNECTED_TIMEOUT_MS,
          });
          console.log("[WebRTCHost] ⚠️ WebRTC peer disconnected - starting 5s recovery timeout");
          this.disconnectedTimeoutId = setTimeout(() => {
            logger.error('remote-support', 'WebRTC peer did not recover - stopping session', {
              sessionId: this.sessionId,
            });
            console.log("[WebRTCHost] ❌ WebRTC peer did not recover after 5s - stopping session");
            this.stop();
          }, WebRTCHost.DISCONNECTED_TIMEOUT_MS);
          break;

        case "failed":
        case "closed":
          logger.error('remote-support', 'WebRTC connection ended', {
            sessionId: this.sessionId,
            connectionState: pc.connectionState,
          });
          console.log("[WebRTCHost] ❌ WebRTC connection", pc.connectionState, "- stopping session");
          this.stop();
          break;
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log("[WebRTCHost] ICE connection state:", pc.iceConnectionState);
    };

    // Handle incoming data channels
    pc.ondatachannel = (event) => {
      const channel = event.channel;
      console.log("[WebRTCHost] Data channel received:", channel.label);

      if (channel.label === "control") {
        this.controlChannel = channel;
        this.setupControlChannel(channel);
      } else if (channel.label === "clipboard") {
        this.clipboardChannel = channel;
        this.setupClipboardChannel(channel);
      }
    };

    console.log("[WebRTCHost] Peer connection created");
  }

  /**
   * Start SignalR disconnect grace period
   * Waits for SignalR to reconnect before stopping the session
   */
  private startSignalRDisconnectGracePeriod(): void {
    // Clear existing timeout if any
    this.clearSignalRDisconnectGracePeriod();

    this.signalRDisconnectTimeoutId = setTimeout(() => {
      logger.error('remote-support', 'SignalR did not reconnect within grace period - stopping session', {
        sessionId: this.sessionId,
      });
      console.error('[WebRTCHost] ❌ SignalR did not recover after 15s - stopping session');
      this.stop();
    }, WebRTCHost.SIGNALR_DISCONNECT_TIMEOUT_MS);

    logger.info('remote-support', 'SignalR disconnect grace period started', {
      sessionId: this.sessionId,
      timeoutMs: WebRTCHost.SIGNALR_DISCONNECT_TIMEOUT_MS,
    });
  }

  /**
   * Clear SignalR disconnect grace period
   * Called when SignalR reconnects successfully
   */
  private clearSignalRDisconnectGracePeriod(): void {
    if (this.signalRDisconnectTimeoutId) {
      clearTimeout(this.signalRDisconnectTimeoutId);
      this.signalRDisconnectTimeoutId = null;
      logger.info('remote-support', 'SignalR disconnect grace period cleared', {
        sessionId: this.sessionId,
      });
    }
  }

  /**
   * Set up control data channel
   */
  private setupControlChannel(channel: RTCDataChannel): void {
    channel.onopen = () => {
      console.log("[WebRTCHost] Control channel opened");
    };

    channel.onmessage = (event) => {
      try {
        const controlEvent = JSON.parse(event.data);
        this.handleControlEvent(controlEvent);
      } catch (error) {
        console.error("[WebRTCHost] Error handling control event:", error);
      }
    };

    channel.onclose = () => {
      console.log("[WebRTCHost] ⚠️ Control channel closed - checking peer connection state");
      logger.warn('remote-support', 'Control channel closed', {
        sessionId: this.sessionId,
        peerConnectionState: this.peerConnection?.connectionState,
      });
      this.controlEnabled = false;

      // Control channel can close temporarily during network issues
      // Don't stop immediately - check if WebRTC peer connection is still healthy
      // Only stop if BOTH control channel is closed AND peer connection is failed
      if (this.peerConnection?.connectionState === 'connected') {
        // Peer is still connected - this is likely a temporary data channel issue
        // WebRTC media tracks can continue even if control channel is down
        console.log("[WebRTCHost] Peer still connected - waiting for control channel recovery");
        logger.info('remote-support', 'Control channel closed but peer connected - waiting for recovery', {
          sessionId: this.sessionId,
        });
      } else if (this.peerConnection?.connectionState === 'disconnected') {
        // Peer is also in disconnected state - let peer's 5s timeout handle it
        console.log("[WebRTCHost] Peer also disconnected - waiting for peer timeout");
        logger.info('remote-support', 'Both control channel and peer disconnected - waiting for peer timeout', {
          sessionId: this.sessionId,
        });
      } else if (this.peerConnection?.connectionState === 'failed' || this.peerConnection?.connectionState === 'closed') {
        // Peer has failed - safe to stop
        console.log("[WebRTCHost] Peer connection failed - stopping session");
        logger.error('remote-support', 'Both control channel closed and peer failed - stopping session', {
          sessionId: this.sessionId,
          peerState: this.peerConnection?.connectionState,
        });
        // Only call stop if we haven't already started stopping (channel would be null)
        if (this.controlChannel) {
          this.stop();
        }
      } else {
        // Peer is connecting, new, or checking - wait for peer to stabilize
        console.log("[WebRTCHost] Peer state:", this.peerConnection?.connectionState, "- waiting for peer to stabilize");
        logger.info('remote-support', 'Control channel closed, waiting for peer to stabilize', {
          sessionId: this.sessionId,
          peerState: this.peerConnection?.connectionState,
        });
      }
      // Don't call stop() immediately - let peer connection state determine session lifecycle
    };

    channel.onerror = (error) => {
      console.error("[WebRTCHost] Control channel error:", error);
    };
  }

  /**
   * Set up clipboard data channel
   */
  private setupClipboardChannel(channel: RTCDataChannel): void {
    channel.onopen = () => {
      console.log("[WebRTCHost] Clipboard channel opened");
    };

    channel.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "clipboard_update") {
          // Update local clipboard
          navigator.clipboard.writeText(data.content).catch((err) => {
            console.error("[WebRTCHost] Failed to write to clipboard:", err);
          });
        }
      } catch (error) {
        console.error("[WebRTCHost] Error handling clipboard event:", error);
      }
    };

    channel.onclose = () => {
      console.log("[WebRTCHost] Clipboard channel closed");
    };

    channel.onerror = (error) => {
      console.error("[WebRTCHost] Clipboard channel error:", error);
    };
  }

  // Debug counters for control events (temporary instrumentation)
  private controlEventCount: number = 0;
  private lastLogTime: number = Date.now();

  /**
   * Handle control events (mouse, keyboard) and configuration events
   * Mouse moves are processed asynchronously with latest-only semantics
   */
  private handleControlEvent(event: any): void {
    // Handle configuration events first (these don't require controlEnabled)
    switch (event.type) {
      case "set_color_depth":
        // Color depth is applied client-side on the viewer - just acknowledge
        console.log("[WebRTCHost] Color depth set to:", event.depth);
        return;
      // Add other config events here as needed
    }

    // For input control events, require controlEnabled
    if (!this.controlEnabled) {
      // Log dropped events (excluding mouse moves)
      if (event.type !== "mouse_move") {
        console.warn("[WebRTCHost] Control not enabled, ignoring event:", event.type);
      }
      return;
    }

    // Debug logging - count events per second
    this.controlEventCount++;
    const now = Date.now();
    if (now - this.lastLogTime >= 1000) {
      console.log(`[WebRTCHost] Received control events/sec: ${this.controlEventCount}`);
      this.controlEventCount = 0;
      this.lastLogTime = now;
    }

    // Log non-mouse-move events for debugging
    if (event.type !== "mouse_move") {
      console.log("[WebRTCHost] Control event:", event.type, event.code || event.button);
    }

    try {
      switch (event.type) {
        case "mouse_move":
          // Use fire-and-forget with latest-only semantics
          this.queueMouseMove(event.x, event.y);
          break;
        case "mouse_click":
          // Click events don't await - fire and forget
          this.handleMouseClick(event.x, event.y, event.button);
          break;
        case "mouse_down":
          this.handleMouseDown(event.button);
          break;
        case "mouse_up":
          this.handleMouseUp(event.button);
          break;
        case "mouse_wheel":
          this.handleMouseWheel(event.deltaX, event.deltaY);
          break;
        case "key_down":
          this.handleKeyDown(event);
          break;
        case "key_up":
          this.handleKeyUp(event);
          break;
        default:
          console.warn("[WebRTCHost] Unknown control event type:", event.type);
      }
    } catch (error) {
      console.error("[WebRTCHost] Error handling control event:", error);
    }
  }

  /**
   * Queue mouse move with latest-only semantics and fire-and-forget execution.
   * Only processes the most recent position, skips intermediate moves.
   * Uses non-blocking invoke to minimize latency.
   */
  private queueMouseMove(x: number, y: number): void {
    // Store latest position
    this.pendingMouseMove = { x, y };

    // If already processing, the next iteration will pick up the new position
    if (this.isProcessingMouseMove) {
      return;
    }

    // Start processing loop
    this.isProcessingMouseMove = true;
    this.processMouseMoveLoop();
  }

  /**
   * Process mouse moves in a tight loop using fire-and-forget.
   * Uses setTimeout(0) to yield to event loop between moves for responsiveness.
   * Does NOT await invoke - sends immediately and moves on.
   */
  private processMouseMoveLoop(): void {
    const processNext = () => {
      if (!this.pendingMouseMove) {
        this.isProcessingMouseMove = false;
        return;
      }

      const pos = this.pendingMouseMove;
      this.pendingMouseMove = null;

      // Fire-and-forget: don't await, just send and continue
      invoke("remote_mouse_move", { x: pos.x, y: pos.y }).catch((error) => {
        console.error("[WebRTCHost] Error injecting mouse move:", error);
      });

      // Check for more moves after a micro-yield (allows new events to arrive)
      if (this.pendingMouseMove) {
        // More moves pending - process immediately
        processNext();
      } else {
        // No pending moves - schedule check for next tick
        setTimeout(() => {
          if (this.pendingMouseMove) {
            processNext();
          } else {
            this.isProcessingMouseMove = false;
          }
        }, 0);
      }
    };

    processNext();
  }

  /**
   * Handle mouse click - fire and forget
   */
  private handleMouseClick(x: number, y: number, button: number): void {
    invoke("remote_mouse_click", { x, y, button }).catch((error) => {
      console.error("[WebRTCHost] Error injecting mouse click:", error);
    });
  }

  /**
   * Handle mouse down - fire and forget
   */
  private handleMouseDown(button: number): void {
    invoke("remote_mouse_down", { button }).catch((error) => {
      console.error("[WebRTCHost] Error injecting mouse down:", error);
    });
  }

  /**
   * Handle mouse up - fire and forget
   */
  private handleMouseUp(button: number): void {
    invoke("remote_mouse_up", { button }).catch((error) => {
      console.error("[WebRTCHost] Error injecting mouse up:", error);
    });
  }

  /**
   * Handle mouse wheel - fire and forget
   */
  private handleMouseWheel(deltaX: number, deltaY: number): void {
    // Convert wheel delta to Windows format (120 units per notch)
    const delta = Math.round(-deltaY);
    invoke("remote_mouse_wheel", { delta }).catch((error) => {
      console.error("[WebRTCHost] Error injecting mouse wheel:", error);
    });
  }

  /**
   * Handle key down - fire and forget
   */
  private handleKeyDown(event: any): void {
    invoke("remote_key_down", {
      code: event.code,
      ctrl: event.ctrlKey || false,
      shift: event.shiftKey || false,
      alt: event.altKey || false,
    }).catch((error) => {
      console.error("[WebRTCHost] Error injecting key down:", error);
    });
  }

  /**
   * Handle key up - fire and forget
   */
  private handleKeyUp(event: any): void {
    invoke("remote_key_up", {
      code: event.code,
      ctrl: event.ctrlKey || false,
      shift: event.shiftKey || false,
      alt: event.altKey || false,
    }).catch((error) => {
      console.error("[WebRTCHost] Error injecting key up:", error);
    });
  }

  /**
   * Enable control from agent (instant switch)
   *
   * In the auto-open flow, agent can enable control directly.
   * This is called when we receive 'control_enabled' message from backend.
   * No signaling message is sent back since agent already knows.
   */
  enableControlFromAgent(): void {
    this.controlEnabled = true;
    console.log("[WebRTCHost] Remote control enabled by agent (instant switch)");
  }

  /**
   * Disable remote control
   * Sends notification to agent via signaling
   */
  disableControl(): void {
    this.controlEnabled = false;
    this.sendSignalingMessage({
      type: "control_disable",
      data: {},
    });
    console.log("[WebRTCHost] Remote control disabled");
  }

  /**
   * Send message through SignalR
   */
  private sendSignalingMessage(message: SignalingMessage): void {
    if (!this.signalRConnected || !signalRRemoteAccess.isConnected()) {
      console.warn("[WebRTCHost] SignalR not connected, cannot send message");
      return;
    }

    // Map message types to SignalR hub methods
    const methodMap: Record<string, string> = {
      'sdp_answer': 'SendSdpAnswer',
      'ice_candidate': 'SendIceCandidate',
      'control_enable': 'EnableControl',
      'control_disable': 'DisableControl',
      'uac_detected': 'SendUacDetected',
      'uac_dismissed': 'SendUacDismissed',
    };

    const method = methodMap[message.type];
    if (!method) {
      console.warn("[WebRTCHost] Unknown message type:", message.type);
      return;
    }

    // Send via SignalR
    signalRRemoteAccess.invoke(method, this.sessionId, message.data).catch((error) => {
      console.error(`[WebRTCHost] Failed to send ${message.type}:`, error);
    });
  }

  /**
   * Stop the remote access session
   * IDEMPOTENT: Safe to call multiple times
   */
  async stop(): Promise<void> {
    logger.info('remote-support', 'Stopping remote access session', {
      sessionId: this.sessionId,
    });
    console.log("[WebRTCHost] 🛑 Stopping session:", this.sessionId);

    // Clear any pending disconnect timeout (prevent duplicate stops)
    if (this.disconnectedTimeoutId) {
      clearTimeout(this.disconnectedTimeoutId);
      this.disconnectedTimeoutId = null;
    }

    // Clear SignalR disconnect grace period timeout
    this.clearSignalRDisconnectGracePeriod();

    // Stop heartbeat
    this.stopHeartbeat();

    // Stop UAC detection
    if (this.uacUnlisten) {
      console.log("[WebRTCHost] Cleaning up UAC detection");
      this.uacUnlisten();
      this.uacUnlisten = null;
    }

    // Stop screen stream - CRITICAL: This stops the capture loop
    if (this.screenStream) {
      console.log("[WebRTCHost] 🎬 Stopping screen capture stream");
      this.screenStream.getTracks().forEach((track) => {
        console.log(`[WebRTCHost] Stopping track: ${track.kind}, readyState: ${track.readyState}`);
        track.stop();
      });
      this.screenStream = null;
      console.log("[WebRTCHost] ✅ Screen capture stopped");
    }

    // Close data channels - set to null BEFORE closing to prevent recursive stop() calls
    // (onclose handlers call stop(), which would try to close again)
    const controlCh = this.controlChannel;
    const clipboardCh = this.clipboardChannel;
    this.controlChannel = null;
    this.clipboardChannel = null;
    if (controlCh) {
      try { controlCh.close(); } catch { /* ignore */ }
    }
    if (clipboardCh) {
      try { clipboardCh.close(); } catch { /* ignore */ }
    }

    // Close peer connection
    if (this.peerConnection) {
      console.log("[WebRTCHost] Closing peer connection");
      this.peerConnection.close();
      this.peerConnection = null;
    }

    // Clean up SignalR event handlers and leave session
    if (this.signalRConnected) {
      // Remove event handlers
      if (this.signalREventCleanup) {
        this.signalREventCleanup();
        this.signalREventCleanup = null;
      }

      // Leave the session (best effort - SignalR may already be disconnected)
      try {
        await signalRRemoteAccess.invoke('LeaveSession', this.sessionId);
      } catch (error) {
        console.warn("[WebRTCHost] Failed to leave session (SignalR may be disconnected):", error);
      }

      this.signalRConnected = false;
    }

    // Clear pending ICE candidates
    this.pendingIceCandidates = [];
  }

  /**
   * Start sending periodic heartbeat to backend
   * Indicates session is still alive for orphan detection
   */
  private startHeartbeat(): void {
    // Clear any existing interval
    this.stopHeartbeat();

    console.log("[WebRTCHost] 💓 Starting heartbeat (every 15s)");
    logger.info('remote-support', 'Starting session heartbeat', {
      sessionId: this.sessionId,
      intervalMs: WebRTCHost.HEARTBEAT_INTERVAL_MS,
    });

    // Send initial heartbeat immediately
    this.sendHeartbeat();

    // Then send periodically
    this.heartbeatIntervalId = setInterval(() => {
      this.sendHeartbeat();
    }, WebRTCHost.HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Stop sending heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatIntervalId) {
      console.log("[WebRTCHost] 💔 Stopping heartbeat");
      clearInterval(this.heartbeatIntervalId);
      this.heartbeatIntervalId = null;
    }
  }

  /**
   * Send a single heartbeat ping to backend
   */
  private async sendHeartbeat(): Promise<void> {
    try {
      // Get runtime API URL (handles network detection)
      const apiBaseUrl = RuntimeConfig.getServerAddress();

      // Call backend heartbeat endpoint
      const response = await fetch(
        `${apiBaseUrl}/remote-access/${this.sessionId}/heartbeat`,
        {
          method: 'POST',
          credentials: 'include',
        }
      );

      if (!response.ok) {
        // Session may have ended or been cleaned up
        if (response.status === 404 || response.status === 400) {
          logger.warn('remote-support', 'Heartbeat failed - session no longer active', {
            sessionId: this.sessionId,
            status: response.status,
          });
          console.warn("[WebRTCHost] ⚠️ Heartbeat failed - session may have ended");
          // Don't stop here - let other mechanisms handle session end
        } else {
          logger.error('remote-support', 'Heartbeat failed with error', {
            sessionId: this.sessionId,
            status: response.status,
          });
        }
      } else {
        logger.debug('remote-support', 'Heartbeat sent successfully', {
          sessionId: this.sessionId,
        });
      }
    } catch (error) {
      // Network error or API unavailable - this is non-fatal
      logger.warn('remote-support', 'Heartbeat request failed', {
        sessionId: this.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      console.warn("[WebRTCHost] ⚠️ Heartbeat request failed:", error);
    }
  }

  /**
   * Check if session is active
   */
  isActive(): boolean {
    return this.peerConnection?.connectionState === "connected";
  }

  /**
   * Get current connection state
   */
  getConnectionState(): RTCPeerConnectionState | null {
    return this.peerConnection?.connectionState || null;
  }
}
