"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Monitor,
  MousePointer,
  Maximize,
  X,
  Camera,
  Palette,
  ArrowLeft,
  RefreshCw,
} from "lucide-react";
import { useRemoteAccessSignaling } from "@/lib/signalr";

interface RemoteSessionClientProps {
  sessionId: string;
}

type ConnectionState =
  | "connecting"
  | "reconnecting"
  | "connected"
  | "disconnected"
  | "failed"
  | "closed"
  | "session_ended";

type ColorDepth = 256 | 16 | 1;

const COLOR_DEPTH_OPTIONS: { value: ColorDepth; label: string; description: string }[] = [
  { value: 256, label: "High Quality", description: "Full color - ~3 Mbps" },
  { value: 16, label: "Balanced", description: "Reduced color - ~1.5 Mbps" },
  { value: 1, label: "Grayscale", description: "Monochrome - ~800 Kbps" },
];

const SESSION_STORAGE_KEY = "active_remote_session";
const TOOLBAR_HIDE_DELAY = 3000; // 3 seconds
const TOOLBAR_SHOW_ZONE = 80; // pixels from top

// Reconnection configuration
const RECONNECT_MAX_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 15000;

export default function RemoteSessionClient({
  sessionId,
}: RemoteSessionClientProps) {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");
  const [controlEnabled, setControlEnabled] = useState(false);
  const [clipboardEnabled, setClipboardEnabled] = useState(false);
  const [uacDetected, setUacDetected] = useState(false);

  // New state for enhanced features
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const [colorDepth, setColorDepth] = useState<ColorDepth>(16);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [screenshotFlash, setScreenshotFlash] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [videoResolution, setVideoResolution] = useState<{ width: number; height: number } | null>(null);

  // Reconnection state
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [canReconnect, setCanReconnect] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const controlChannelRef = useRef<RTCDataChannel | null>(null);
  const clipboardChannelRef = useRef<RTCDataChannel | null>(null);
  // Queue ICE candidates that arrive before remote description is set
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  // Toolbar auto-hide refs
  const toolbarHideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const sessionStartTimeRef = useRef<number>(Date.now());

  // Guard against React StrictMode double-invoke
  const setupStartedRef = useRef(false);

  // Throttling refs for mouse input performance
  const lastMouseMoveTimeRef = useRef<number>(0);
  const pendingMouseMoveRef = useRef<{ x: number; y: number } | null>(null);
  const mouseMoveRafRef = useRef<number | null>(null);
  const MOUSE_THROTTLE_MS = 16; // ~60fps max for mouse moves

  // Reconnection refs
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isManualDisconnectRef = useRef(false);

  // Track signaling handshake completion - signaling errors are fatal only before this
  const signalingCompleteRef = useRef(false);

  // Track if SignalR was ever connected - we only react to disconnects after first connection
  const wasSignalingConnectedRef = useRef(false);

  // SignalR-based signaling
  const {
    signalingState,
    joinSession,
    leaveSession,
    sendSdpOffer,
    sendSdpAnswer,
    sendIceCandidate,
    enableControl,
    disableControl,
    isConnected: isSignalingConnected,
  } = useRemoteAccessSignaling({
    onSdpAnswer: async (eventSessionId, payload) => {
      if (eventSessionId !== sessionId) return;

      console.log("[RemoteSession] 📨 Received SDP answer via SignalR", {
        sessionId: eventSessionId,
        sdpLength: payload.sdp?.length,
        timestamp: new Date().toISOString(),
      });
      const pc = peerConnectionRef.current;
      if (!pc) {
        console.error("[RemoteSession] ⚠️ No peer connection available!");
        return;
      }

      // Only set remote description if we're in the right state
      if (pc.signalingState !== "have-local-offer") {
        console.warn("[RemoteSession] ⚠️ Ignoring SDP answer - wrong signaling state", {
          currentState: pc.signalingState,
          expectedState: "have-local-offer",
        });
        return;
      }

      try {
        const answer = new RTCSessionDescription({
          type: "answer",
          sdp: payload.sdp,
        });
        console.log("[RemoteSession] 📝 Setting remote description...");
        await pc.setRemoteDescription(answer);

        // Mark signaling handshake as complete
        signalingCompleteRef.current = true;
        console.log("[RemoteSession] ✅ Signaling handshake complete", {
          connectionState: pc.connectionState,
          iceConnectionState: pc.iceConnectionState,
          pendingCandidates: pendingIceCandidatesRef.current.length,
          timestamp: new Date().toISOString(),
        });

        // Process any ICE candidates that arrived before remote description was set
        if (pendingIceCandidatesRef.current.length > 0) {
          console.log("[RemoteSession] 🧊 Processing", pendingIceCandidatesRef.current.length, "queued ICE candidates");
          for (const candidateInit of pendingIceCandidatesRef.current) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidateInit));
            } catch (err) {
              console.error("[RemoteSession] ❌ Error adding queued ICE candidate:", err);
            }
          }
          pendingIceCandidatesRef.current = [];
        }
      } catch (error) {
        console.error("[RemoteSession] ❌ Failed to set remote description:", error);
        setConnectionState("failed");
      }
    },

    onIceCandidate: async (eventSessionId, payload) => {
      if (eventSessionId !== sessionId) return;

      const pc = peerConnectionRef.current;
      if (!pc) {
        console.warn("[RemoteSession] ⚠️ No peer connection when receiving ICE candidate");
        return;
      }

      if (payload.candidate) {
        const candidateInit: RTCIceCandidateInit = {
          candidate: payload.candidate,
          sdpMLineIndex: payload.sdpMLineIndex,
          sdpMid: payload.sdpMid,
        };

        // Parse candidate type for debugging
        const candidateType = payload.candidate.includes('typ relay') ? 'relay (TURN)' :
                              payload.candidate.includes('typ srflx') ? 'srflx (STUN)' :
                              payload.candidate.includes('typ host') ? 'host' : 'unknown';

        // Queue if remote description not set yet
        if (!pc.remoteDescription) {
          console.log("[RemoteSession] 🧊 Queuing ICE candidate (no remote description yet)", {
            type: candidateType,
            queueSize: pendingIceCandidatesRef.current.length + 1,
          });
          pendingIceCandidatesRef.current.push(candidateInit);
        } else {
          console.log("[RemoteSession] 🧊 Adding ICE candidate", {
            type: candidateType,
            iceConnectionState: pc.iceConnectionState,
          });
          await pc.addIceCandidate(new RTCIceCandidate(candidateInit)).catch((err) => {
            console.error("[RemoteSession] ❌ Failed to add ICE candidate:", err);
          });
        }
      }
    },

    onControlEnabled: (eventSessionId) => {
      if (eventSessionId !== sessionId) return;
      console.log("[RemoteSession] 🎮 Control enabled by remote party");
      setControlEnabled(true);
    },

    onControlDisabled: (eventSessionId) => {
      if (eventSessionId !== sessionId) return;
      console.log("[RemoteSession] 🎮 Control disabled by remote party");
      setControlEnabled(false);
    },

    onUacDetected: (eventSessionId) => {
      if (eventSessionId !== sessionId) return;
      console.log("[RemoteSession] 🛡️ UAC prompt detected");
      setUacDetected(true);
    },

    onUacDismissed: (eventSessionId) => {
      if (eventSessionId !== sessionId) return;
      console.log("[RemoteSession] 🛡️ UAC prompt dismissed");
      setUacDetected(false);
    },

    onParticipantLeft: (eventSessionId) => {
      if (eventSessionId !== sessionId) return;
      console.log("[RemoteSession] 👤 Remote participant left");
      setConnectionState("session_ended");
    },

    onError: (error) => {
      console.error("[RemoteSession] ❌ SignalR error:", error);
      // Only treat signaling errors as fatal before handshake completes
      if (!signalingCompleteRef.current) {
        setConnectionState("failed");
      }
    },
  });

  // Handle SignalR connection state changes
  // IMPORTANT: WebRTC connection state is authoritative, SignalR state is advisory only
  // NOTE: We must ignore the initial 'disconnected' state - only react to disconnects AFTER first connection
  useEffect(() => {
    const pc = peerConnectionRef.current;

    console.log("[RemoteSession] 📡 SignalR state changed", {
      signalingState,
      wasEverConnected: wasSignalingConnectedRef.current,
      webrtcState: pc?.connectionState ?? 'no-pc',
      iceState: pc?.iceConnectionState ?? 'no-pc',
      signalingComplete: signalingCompleteRef.current,
      isManualDisconnect: isManualDisconnectRef.current,
      timestamp: new Date().toISOString(),
    });

    // Track when we first achieve connection
    if (signalingState === "connected") {
      wasSignalingConnectedRef.current = true;
      console.log("[RemoteSession] ✅ SignalR connected for the first time - will now react to future disconnects");
    }

    if (signalingState === "reconnecting") {
      // SignalR is reconnecting - this is not fatal if peer connection is active
      if (pc && (pc.connectionState === "connected" || pc.connectionState === "connecting")) {
        console.log("[RemoteSession] ⏳ SignalR reconnecting, but WebRTC is", pc.connectionState, "- not changing UI state");
        // Don't change connection state - WebRTC is handling the session
      } else {
        console.log("[RemoteSession] 🔄 SignalR reconnecting, WebRTC not active - showing reconnecting UI");
        setConnectionState("reconnecting");
      }
    } else if (signalingState === "disconnected" && !isManualDisconnectRef.current) {
      // Only react to disconnects if we were previously connected
      // This prevents reacting to the initial "disconnected" state
      if (!wasSignalingConnectedRef.current) {
        console.log("[RemoteSession] ⏳ SignalR is 'disconnected' but was never connected yet - ignoring (initial state)");
        return;
      }

      // SignalR disconnected - only set UI to disconnected if WebRTC is also not active
      // This fixes the race condition where SignalR disconnects before WebRTC finishes connecting
      if (pc && (pc.connectionState === "connected" || pc.connectionState === "connecting")) {
        console.log("[RemoteSession] ✅ SignalR disconnected, but WebRTC is", pc.connectionState, "- keeping session alive");
        // WebRTC is active or connecting, don't declare failure
      } else if (!signalingCompleteRef.current) {
        // No active WebRTC and signaling never completed - this is a real failure
        console.log("[RemoteSession] ❌ SignalR disconnected before signaling complete, no WebRTC - declaring disconnected");
        setConnectionState("disconnected");
      } else {
        console.log("[RemoteSession] ⚠️ SignalR disconnected post-handshake, WebRTC is", pc?.connectionState, "- not changing UI state");
      }
    }
  }, [signalingState]);

  // Setup WebRTC connection with SignalR signaling
  useEffect(() => {
    // Guard against React StrictMode double-invoke
    if (setupStartedRef.current) {
      return;
    }
    setupStartedRef.current = true;

    setupWebRTCWithSignaling();

    return () => {
      // Don't reset the guard on cleanup - we want to prevent re-runs
      cleanup();
    };
  }, [sessionId]);

  // Load saved color depth from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("remote_color_depth");
    if (saved) {
      const parsedValue = parseInt(saved);
      if (parsedValue === 256 || parsedValue === 16 || parsedValue === 1) {
        setColorDepth(parsedValue as ColorDepth);
      }
    }
  }, []);

  // Session duration timer
  useEffect(() => {
    if (connectionState !== "connected") return;

    const interval = setInterval(() => {
      setSessionDuration(Math.floor((Date.now() - sessionStartTimeRef.current) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [connectionState]);

  // Toolbar auto-hide logic
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Show toolbar
      setToolbarVisible(true);

      // Clear existing timer
      if (toolbarHideTimerRef.current) {
        clearTimeout(toolbarHideTimerRef.current);
      }

      // If mouse is near top, keep toolbar visible
      if (e.clientY < TOOLBAR_SHOW_ZONE) {
        return;
      }

      // Set timer to hide toolbar after delay
      toolbarHideTimerRef.current = setTimeout(() => {
        setToolbarVisible(false);
      }, TOOLBAR_HIDE_DELAY);
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (toolbarHideTimerRef.current) {
        clearTimeout(toolbarHideTimerRef.current);
      }
    };
  }, []);

  const setupWebRTCWithSignaling = async () => {
    console.log("[RemoteSession] ========================================");
    console.log("[RemoteSession] Starting WebRTC setup with SignalR signaling");
    console.log("[RemoteSession] Session ID:", sessionId);
    console.log("[RemoteSession] ========================================");

    try {
      // Step 1: Fetch TURN credentials
      console.log("[RemoteSession] Step 1: Fetching TURN credentials");
      let iceServers: RTCIceServer[] = [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ];

      try {
        const turnResponse = await fetch("/api/turn/credentials", {
          credentials: "include",
        });

        if (turnResponse.ok) {
          const { iceServers: turnIceServers } = await turnResponse.json();
          iceServers = turnIceServers;
          console.log("[RemoteSession] TURN credentials obtained, ICE servers:", iceServers.length);
        } else {
          console.warn("[RemoteSession] Failed to fetch TURN, using STUN only, status:", turnResponse.status);
        }
      } catch (turnError) {
        console.error("[RemoteSession] Error fetching TURN:", turnError);
        console.warn("[RemoteSession] Falling back to STUN only");
      }

      // Step 2: Join session via SignalR
      console.log("[RemoteSession] Step 2: Joining session via SignalR");
      await joinSession(sessionId, "agent");
      console.log("[RemoteSession] Joined session via SignalR");

      // Step 2.5: Wait for requester to accept and start WebRTC host
      // The requester has a 10-second auto-accept timer, so we wait for acceptance
      // before sending our offer to ensure their WebRTC host is ready
      console.log("[RemoteSession] Step 2.5: Waiting for requester to accept...");
      const WAIT_FOR_ACCEPTANCE_MS = 11000; // Wait 11 seconds (10s auto-accept + 1s buffer)
      await new Promise(resolve => setTimeout(resolve, WAIT_FOR_ACCEPTANCE_MS));
      console.log("[RemoteSession] Wait complete, proceeding with WebRTC setup");

      // Step 3: Create RTCPeerConnection
      console.log("[RemoteSession] Step 3: Creating RTCPeerConnection");

      const configuration: RTCConfiguration = {
        iceServers: iceServers,
        iceTransportPolicy: 'all',
        iceCandidatePoolSize: 10,
      };

      console.log("[RemoteSession] RTCPeerConnection config:", JSON.stringify(configuration, null, 2));

      const pc = new RTCPeerConnection(configuration);
      peerConnectionRef.current = pc;

      console.log("[RemoteSession] RTCPeerConnection created");

      // Handle incoming streams
      pc.ontrack = (event) => {
        console.log("[RemoteSession] 🎥 Track received", {
          kind: event.track.kind,
          trackId: event.track.id,
          streamCount: event.streams.length,
          timestamp: new Date().toISOString(),
        });

        if (videoRef.current && event.streams[0]) {
          const video = videoRef.current;
          video.srcObject = event.streams[0];
          console.log("[RemoteSession] 🎥 Video srcObject set");

          // Add event listeners
          video.onloadedmetadata = () => {
            console.log("[RemoteSession] 🖥️ Video metadata loaded", {
              width: video.videoWidth,
              height: video.videoHeight,
              timestamp: new Date().toISOString(),
            });
            setVideoResolution({ width: video.videoWidth, height: video.videoHeight });
          };
          video.onerror = (e) => {
            const target = typeof e === 'object' && e !== null && 'target' in e ? (e.target as HTMLVideoElement) : null;
            console.error("[RemoteSession] ❌ Video error:", target?.error?.message ?? e);
          };

          // Ensure video plays
          console.log("[RemoteSession] ▶️ Attempting to play video");
          video.play().catch((err) => {
            console.warn("[RemoteSession] ⚠️ Video autoplay failed, retrying with muted");
            video.muted = true;
            video.play().catch((e) => console.error("[RemoteSession] ❌ Video play failed:", e.message));
          });

          console.log("[RemoteSession] ✅ Setting connectionState to 'connected' (track received)");
          setConnectionState("connected");
        }
      };

      // Track previous connection state for debugging
      let previousConnectionState = pc.connectionState;
      pc.onconnectionstatechange = () => {
        const newState = pc.connectionState;
        console.log("[RemoteSession] 🔄 WebRTC connectionState changed", {
          from: previousConnectionState,
          to: newState,
          iceConnectionState: pc.iceConnectionState,
          iceGatheringState: pc.iceGatheringState,
          signalingState: pc.signalingState,
          signalingComplete: signalingCompleteRef.current,
          timestamp: new Date().toISOString(),
        });
        previousConnectionState = newState;

        // Map peer connection state to our connection state
        switch (newState) {
          case "connected":
            setConnectionState("connected");
            break;
          case "disconnected":
            // Disconnected could be temporary - don't immediately fail
            // Only show disconnected UI if signaling is already complete
            if (signalingCompleteRef.current) {
              console.log("[RemoteSession] ⚠️ WebRTC disconnected (post-handshake) - may recover");
              // Don't immediately show disconnected UI - ICE might recover
            } else {
              console.log("[RemoteSession] ⏳ WebRTC disconnected during setup - ignoring");
            }
            break;
          case "failed":
            console.error("[RemoteSession] ❌ WebRTC connection failed");
            setConnectionState("failed");
            break;
          case "closed":
            setConnectionState("closed");
            break;
        }
      };

      // Track previous ICE connection state for debugging
      let previousIceState = pc.iceConnectionState;
      pc.oniceconnectionstatechange = () => {
        const newIceState = pc.iceConnectionState;
        console.log("[RemoteSession] 🧊 ICE connectionState changed", {
          from: previousIceState,
          to: newIceState,
          connectionState: pc.connectionState,
          iceGatheringState: pc.iceGatheringState,
          signalingComplete: signalingCompleteRef.current,
          timestamp: new Date().toISOString(),
        });
        previousIceState = newIceState;

        if (newIceState === 'failed') {
          console.error("[RemoteSession] ❌ ICE connection failed - check TURN server and firewall");
          setConnectionState("failed");
        } else if (newIceState === 'disconnected') {
          console.log("[RemoteSession] ⚠️ ICE disconnected (may recover)");
        } else if (newIceState === 'connected' || newIceState === 'completed') {
          console.log("[RemoteSession] ✅ ICE connected/completed");
        }
      };

      // Log ICE gathering state changes
      pc.onicegatheringstatechange = () => {
        console.log("[RemoteSession] 📡 ICE gathering state changed", {
          state: pc.iceGatheringState,
          timestamp: new Date().toISOString(),
        });
      };

      // Log signaling state changes
      pc.onsignalingstatechange = () => {
        console.log("[RemoteSession] 📞 Signaling state changed", {
          state: pc.signalingState,
          timestamp: new Date().toISOString(),
        });
      };

      // Handle ICE candidates - send via SignalR
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidateType = event.candidate.candidate.includes('typ relay') ? 'relay (TURN)' :
                                event.candidate.candidate.includes('typ srflx') ? 'srflx (STUN)' :
                                event.candidate.candidate.includes('typ host') ? 'host' : 'unknown';
          console.log("[RemoteSession] 🧊 Sending local ICE candidate", {
            type: candidateType,
            sdpMid: event.candidate.sdpMid,
          });
          sendIceCandidate(sessionId, {
            candidate: event.candidate.candidate,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
            sdpMid: event.candidate.sdpMid,
          }).catch((err) => {
            console.error("[RemoteSession] ❌ Failed to send ICE candidate:", err);
          });
        } else {
          console.log("[RemoteSession] 🧊 ICE gathering complete (null candidate)");
        }
      };

      // Create data channels for control and clipboard
      const controlChannel = pc.createDataChannel("control", {
        ordered: false,
        maxRetransmits: 0,
      });
      controlChannelRef.current = controlChannel;

      controlChannel.onerror = (error) => {
        console.error("[RemoteSession] Control data channel error:", error);
      };

      const clipboardChannel = pc.createDataChannel("clipboard", {
        ordered: true,
      });
      clipboardChannelRef.current = clipboardChannel;

      clipboardChannel.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "clipboard_update") {
            navigator.clipboard.writeText(data.content).catch((err) => {
              console.error("[RemoteSession] Failed to write to clipboard:", err);
            });
          }
        } catch (error) {
          console.error("[RemoteSession] Error handling clipboard message:", error);
        }
      };

      // Step 4: Create and send offer via SignalR
      console.log("[RemoteSession] Step 4: Creating SDP offer");
      const offer = await pc.createOffer({
        offerToReceiveVideo: true,
        offerToReceiveAudio: false,
      });

      console.log("[RemoteSession] SDP offer created");
      console.log("[RemoteSession] Offer SDP (first 100 chars):", offer.sdp?.substring(0, 100) + "...");

      await pc.setLocalDescription(offer);
      console.log("[RemoteSession] Local description set");

      console.log("[RemoteSession] Sending SDP offer to requester via SignalR");
      await sendSdpOffer(sessionId, {
        sdp: offer.sdp!,
        type: offer.type,
      });
      console.log("[RemoteSession] SDP offer sent, waiting for answer...");

    } catch (error) {
      console.error("[RemoteSession] Error setting up WebRTC:", error instanceof Error ? error.message : error);
      setConnectionState("failed");
    }
  };

  const sendControlEvent = (event: any) => {
    if (
      controlChannelRef.current?.readyState === "open" &&
      controlEnabled
    ) {
      controlChannelRef.current.send(JSON.stringify(event));
    }
  };

  const sendClipboardUpdate = (content: string) => {
    if (clipboardChannelRef.current?.readyState === "open") {
      clipboardChannelRef.current.send(
        JSON.stringify({
          type: "clipboard_update",
          content,
        })
      );
    }
  };

  // Format duration as HH:MM:SS
  const formatDuration = useCallback((seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }, []);

  // Screenshot capture function
  const handleScreenshot = useCallback(async () => {
    if (!videoRef.current) return;

    const video = videoRef.current;

    // Create canvas matching video dimensions
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || video.clientWidth;
    canvas.height = video.videoHeight || video.clientHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Draw current frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Add timestamp overlay
    const timestamp = new Date().toISOString();
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, canvas.height - 40, 320, 40);
    ctx.fillStyle = "#fff";
    ctx.font = "14px monospace";
    ctx.fillText(`Session: ${sessionId.slice(0, 8)}`, 10, canvas.height - 22);
    ctx.fillText(timestamp, 10, canvas.height - 6);

    // Flash animation
    setScreenshotFlash(true);
    setTimeout(() => setScreenshotFlash(false), 300);

    // Convert to blob and download
    canvas.toBlob((blob) => {
      if (!blob) return;

      const filename = `screenshot_${sessionId.slice(0, 8)}_${Date.now()}.png`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }, [sessionId]);

  // Color depth change handler
  const handleColorDepthChange = useCallback((depth: ColorDepth) => {
    setColorDepth(depth);
    localStorage.setItem("remote_color_depth", depth.toString());

    // Send color depth command to requester via control channel
    if (controlChannelRef.current?.readyState === "open") {
      controlChannelRef.current.send(
        JSON.stringify({
          type: "set_color_depth",
          depth,
        })
      );
    }
  }, []);

  // Get CSS filter for color depth
  const getColorDepthFilter = useCallback((depth: ColorDepth) => {
    switch (depth) {
      case 256:
        return "none";
      case 16:
        return "saturate(0.5) contrast(1.1)";
      case 1:
        return "grayscale(100%)";
      default:
        return "none";
    }
  }, []);

  // Attach mouse and keyboard event handlers when control is enabled
  useEffect(() => {
    if (!controlEnabled || !videoRef.current) return;

    const videoElement = videoRef.current;

    const getNormalizedCoords = (e: MouseEvent): { x: number; y: number } | null => {
      const rect = videoElement.getBoundingClientRect();
      const elementWidth = rect.width;
      const elementHeight = rect.height;
      const videoWidth = videoElement.videoWidth;
      const videoHeight = videoElement.videoHeight;

      if (!videoWidth || !videoHeight || videoWidth === 0 || videoHeight === 0) {
        console.warn("[RemoteSession] Video dimensions not available yet");
        return null;
      }

      const elementAspect = elementWidth / elementHeight;
      const videoAspect = videoWidth / videoHeight;

      let contentWidth: number;
      let contentHeight: number;
      let offsetX: number;
      let offsetY: number;

      if (videoAspect > elementAspect) {
        contentWidth = elementWidth;
        contentHeight = elementWidth / videoAspect;
        offsetX = 0;
        offsetY = (elementHeight - contentHeight) / 2;
      } else {
        contentHeight = elementHeight;
        contentWidth = elementHeight * videoAspect;
        offsetX = (elementWidth - contentWidth) / 2;
        offsetY = 0;
      }

      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (
        mouseX < offsetX ||
        mouseX > offsetX + contentWidth ||
        mouseY < offsetY ||
        mouseY > offsetY + contentHeight
      ) {
        return null;
      }

      const x = (mouseX - offsetX) / contentWidth;
      const y = (mouseY - offsetY) / contentHeight;

      return {
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y))
      };
    };

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      const coords = getNormalizedCoords(e);
      if (!coords) return;

      const { x, y } = coords;
      pendingMouseMoveRef.current = { x, y };

      const now = performance.now();
      const timeSinceLastMove = now - lastMouseMoveTimeRef.current;

      if (timeSinceLastMove >= MOUSE_THROTTLE_MS) {
        lastMouseMoveTimeRef.current = now;
        sendControlEvent({ type: "mouse_move", x, y });
        pendingMouseMoveRef.current = null;
      } else if (!mouseMoveRafRef.current) {
        mouseMoveRafRef.current = window.setTimeout(() => {
          mouseMoveRafRef.current = null;
          if (pendingMouseMoveRef.current) {
            lastMouseMoveTimeRef.current = performance.now();
            sendControlEvent({
              type: "mouse_move",
              ...pendingMouseMoveRef.current,
            });
            pendingMouseMoveRef.current = null;
          }
        }, MOUSE_THROTTLE_MS - timeSinceLastMove);
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      sendControlEvent({
        type: "mouse_down",
        button: e.button,
      });
    };

    const handleMouseUp = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      sendControlEvent({
        type: "mouse_up",
        button: e.button,
      });
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      sendControlEvent({
        type: "mouse_wheel",
        deltaX: e.deltaX,
        deltaY: e.deltaY,
      });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      sendControlEvent({
        type: "key_down",
        key: e.key,
        code: e.code,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
      });
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      e.preventDefault();
      sendControlEvent({
        type: "key_up",
        key: e.key,
        code: e.code,
      });
    };

    videoElement.addEventListener("mousemove", handleMouseMove);
    videoElement.addEventListener("mousedown", handleMouseDown);
    videoElement.addEventListener("mouseup", handleMouseUp);
    videoElement.addEventListener("contextmenu", handleContextMenu);
    videoElement.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      if (mouseMoveRafRef.current) {
        clearTimeout(mouseMoveRafRef.current);
        mouseMoveRafRef.current = null;
      }
      pendingMouseMoveRef.current = null;

      videoElement.removeEventListener("mousemove", handleMouseMove);
      videoElement.removeEventListener("mousedown", handleMouseDown);
      videoElement.removeEventListener("mouseup", handleMouseUp);
      videoElement.removeEventListener("contextmenu", handleContextMenu);
      videoElement.removeEventListener("wheel", handleWheel);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [controlEnabled]);

  /**
   * Attempt to reconnect to the session
   */
  const attemptReconnect = useCallback(async (attempt: number = 0) => {
    if (attempt >= RECONNECT_MAX_ATTEMPTS) {
      console.log("[RemoteSession] Max reconnect attempts reached");
      setCanReconnect(false);
      setIsReconnecting(false);
      setConnectionState("failed");
      return;
    }

    console.log(`[RemoteSession] Reconnect attempt ${attempt + 1}/${RECONNECT_MAX_ATTEMPTS}`);
    setIsReconnecting(true);
    setConnectionState("reconnecting");
    setReconnectAttempts(attempt + 1);

    try {
      // Clean up existing connections first
      cleanup();

      // Reset the setup guard to allow re-initialization
      setupStartedRef.current = false;
      signalingCompleteRef.current = false;

      // Call resume API to notify requester to reconnect
      const resumeResponse = await fetch(`/api/remote-access/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resume" }),
      });

      if (!resumeResponse.ok) {
        const error = await resumeResponse.json();
        throw new Error(error.error || "Failed to resume session");
      }

      console.log("[RemoteSession] Resume API called successfully");

      // Re-establish WebRTC connection with SignalR signaling
      await setupWebRTCWithSignaling();

      // Reset reconnection state on success
      setReconnectAttempts(0);
      setIsReconnecting(false);
      console.log("[RemoteSession] Reconnection successful");
    } catch (error) {
      console.error("[RemoteSession] Reconnect attempt failed:", error);

      // Calculate delay with exponential backoff and jitter
      const baseDelay = Math.min(
        RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt),
        RECONNECT_MAX_DELAY_MS
      );
      const jitter = Math.random() * 1000;
      const delay = baseDelay + jitter;

      console.log(`[RemoteSession] Next attempt in ${Math.round(delay)}ms`);

      reconnectTimerRef.current = setTimeout(() => {
        attemptReconnect(attempt + 1);
      }, delay);
    }
  }, [sessionId]);

  /**
   * Manual reconnect handler
   */
  const handleManualReconnect = useCallback(() => {
    console.log("[RemoteSession] Manual reconnect triggered");
    setCanReconnect(true);
    setReconnectAttempts(0);
    attemptReconnect(0);
  }, [attemptReconnect]);

  /**
   * Toggle remote control via SignalR
   */
  const handleToggleControl = async () => {
    if (controlEnabled) {
      // Disable control
      await disableControl(sessionId);
      setControlEnabled(false);
      console.log("[RemoteSession] Control disabled");
    } else {
      // Enable control
      await enableControl(sessionId);
      setControlEnabled(true);
      console.log("[RemoteSession] Control enabled via SignalR");
    }
  };

  const handleEndSession = async () => {
    isManualDisconnectRef.current = true;

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    sessionStorage.removeItem(SESSION_STORAGE_KEY);

    // Leave session via SignalR
    await leaveSession(sessionId).catch(console.error);

    window.close();
  };

  const handleGoBack = () => {
    isManualDisconnectRef.current = true;

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    window.close();
  };

  const handleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  };

  const cleanup = () => {
    pendingIceCandidatesRef.current = [];
    signalingCompleteRef.current = false;
    wasSignalingConnectedRef.current = false;

    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    controlChannelRef.current = null;
    clipboardChannelRef.current = null;
  };

  // Session ended state
  if (connectionState === "session_ended") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-900">
        <div className="text-center text-white">
          <Monitor className="h-16 w-16 mx-auto mb-4 text-gray-500" />
          <h2 className="text-2xl font-semibold mb-2">Session Ended</h2>
          <p className="text-gray-400 mb-6">
            The remote session has ended or expired.
          </p>
          <Button onClick={handleGoBack} variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Close Window
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-screen w-screen bg-black flex flex-col relative">
      {/* Video Container */}
      <div className="flex-1 relative min-h-0">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-contain bg-black"
          style={{
            userSelect: "none",
            WebkitUserSelect: "none",
            touchAction: "none",
            imageRendering: "crisp-edges",
            WebkitBackfaceVisibility: "hidden",
            backfaceVisibility: "hidden",
            transform: "translateZ(0)",
            ...(colorDepth !== 256 && { filter: getColorDepthFilter(colorDepth) }),
          }}
          onDragStart={(e) => e.preventDefault()}
        />

        {/* Privacy Indicator */}
        <div className="absolute inset-0 pointer-events-none border-4 border-red-500 opacity-30" />
      </div>

      {/* Floating Header Toolbar */}
      <div
        className={`absolute top-0 left-0 right-0 z-10 transition-all duration-300 ${
          toolbarVisible
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-full pointer-events-none"
        }`}
      >
        <div className="bg-gray-900/80 backdrop-blur-md border-b border-gray-700 px-4 py-3 flex items-center justify-between">
          {/* Left section */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Monitor className="h-5 w-5 text-blue-500" />
              <span className="text-white font-medium">
                Session {sessionId.slice(0, 8)}
              </span>
            </div>

            {/* Connection status */}
            <div className="flex items-center gap-2">
              <div
                className={`h-2 w-2 rounded-full ${
                  connectionState === "connected"
                    ? "bg-green-500"
                    : connectionState === "connecting" ||
                      connectionState === "reconnecting"
                    ? "bg-yellow-500 animate-pulse"
                    : "bg-red-500"
                }`}
              />
              <span className="text-gray-400 text-sm capitalize">
                {connectionState === "reconnecting"
                  ? "Reconnecting..."
                  : connectionState}
              </span>
            </div>

            {/* Session duration and resolution */}
            {connectionState === "connected" && (
              <div className="flex items-center gap-3 text-gray-400 text-sm font-mono">
                <span>{formatDuration(sessionDuration)}</span>
                {videoResolution && (
                  <span className="text-xs">
                    {videoResolution.width}x{videoResolution.height}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Right section - Controls */}
          <div className="flex items-center gap-2">
            {/* Color Depth Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={connectionState !== "connected"}
                  title="Color Depth"
                >
                  <Palette className="h-4 w-4 mr-2" />
                  {colorDepth === 256
                    ? "High"
                    : colorDepth === 16
                    ? "Balanced"
                    : "Grayscale"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {COLOR_DEPTH_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => handleColorDepthChange(option.value)}
                    className={colorDepth === option.value ? "bg-accent" : ""}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{option.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Screenshot button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleScreenshot}
              disabled={connectionState !== "connected"}
              title="Take Screenshot"
            >
              <Camera className="h-4 w-4" />
            </Button>

            {/* Control toggle button */}
            <Button
              variant={controlEnabled ? "default" : "outline"}
              size="sm"
              onClick={handleToggleControl}
              disabled={connectionState !== "connected"}
              title={controlEnabled ? "Click to disable control" : "Click to enable control"}
            >
              <MousePointer className="h-4 w-4 mr-2" />
              {controlEnabled ? "Control ON" : "Control OFF"}
            </Button>

            {/* Fullscreen button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleFullscreen}
              title="Toggle Fullscreen"
            >
              <Maximize className="h-4 w-4" />
            </Button>

            {/* End session button */}
            <Button variant="destructive" size="sm" onClick={handleEndSession}>
              <X className="h-4 w-4 mr-2" />
              End
            </Button>
          </div>
        </div>
      </div>

      {/* Screenshot Flash Overlay */}
      {screenshotFlash && (
        <div
          className="absolute inset-0 bg-white pointer-events-none z-50 animate-flash"
          style={{
            animation: "flash 0.3s ease-out",
          }}
        />
      )}

      {/* Connection/Reconnection Overlay */}
      {(connectionState === "connecting" ||
        connectionState === "reconnecting" ||
        connectionState === "disconnected" ||
        connectionState === "failed") && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/75 z-20">
          <div className="text-center text-white bg-gray-800/90 p-8 rounded-lg">
            {connectionState === "reconnecting" ? (
              <>
                <RefreshCw className="h-12 w-12 mx-auto mb-4 animate-spin text-blue-500" />
                <p className="text-lg font-medium mb-2">Reconnecting...</p>
                <p className="text-gray-400 text-sm">
                  Attempt {reconnectAttempts} of {RECONNECT_MAX_ATTEMPTS}
                </p>
                <Button
                  onClick={handleGoBack}
                  variant="ghost"
                  size="sm"
                  className="mt-4 text-gray-400"
                >
                  Cancel
                </Button>
              </>
            ) : connectionState === "failed" ? (
              <>
                <X className="h-12 w-12 mx-auto mb-4 text-red-500" />
                <p className="text-lg font-medium mb-2">Connection Failed</p>
                <p className="text-gray-400 text-sm mb-4">
                  {reconnectAttempts >= RECONNECT_MAX_ATTEMPTS
                    ? "Max reconnection attempts reached"
                    : "Unable to establish remote connection"}
                </p>
                <div className="flex gap-2">
                  <Button onClick={handleManualReconnect} variant="default">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Try Again
                  </Button>
                  <Button onClick={handleGoBack} variant="outline">
                    Close Window
                  </Button>
                </div>
              </>
            ) : connectionState === "disconnected" ? (
              <>
                <Monitor className="h-12 w-12 mx-auto mb-4 text-yellow-500" />
                <p className="text-lg font-medium mb-2">Disconnected</p>
                <p className="text-gray-400 text-sm mb-4">
                  The connection was lost
                </p>
                <div className="flex gap-2">
                  <Button onClick={handleManualReconnect} variant="default">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Reconnect
                  </Button>
                  <Button onClick={handleGoBack} variant="outline">
                    Close Window
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4" />
                <p className="text-lg">Connecting...</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* UAC Overlay */}
      {uacDetected && (
        <div className="absolute inset-0 flex items-center justify-center bg-yellow-900/80 z-20">
          <div className="text-center text-white bg-yellow-800 p-6 rounded-lg">
            <p className="text-xl font-semibold mb-2">UAC Prompt Detected</p>
            <p className="text-gray-200">
              Waiting for user to complete UAC authorization...
            </p>
          </div>
        </div>
      )}

      {/* Flash animation keyframes */}
      <style jsx>{`
        @keyframes flash {
          0% {
            opacity: 0;
          }
          50% {
            opacity: 0.8;
          }
          100% {
            opacity: 0;
          }
        }
        .animate-flash {
          animation: flash 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
