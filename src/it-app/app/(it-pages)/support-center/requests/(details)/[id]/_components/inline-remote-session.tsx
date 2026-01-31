'use client';

/**
 * Inline Remote Session Component
 * Renders WebRTC remote access session inline on the request details page
 *
 * Features:
 * - Inline rendering (not fullscreen)
 * - Compact toolbar
 * - Uses RemoteAccessContext for state management
 * - SignalR-based signaling (replaces WebSocket)
 * - Cleanup on close
 */

import { useEffect, useRef, useState, useCallback, startTransition } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  Monitor,
  Maximize,
  X,
  Camera,
  Palette,
  RefreshCw,
  Minimize2,
} from 'lucide-react';
import { useRemoteAccess } from '../_context/remote-access-context';
import { RemoteModeSelector } from './remote-mode-selector';
import { cn } from '@/lib/utils';
import { useRemoteAccessSignaling } from '@/lib/signalr';

type ColorDepth = 256 | 16 | 1;

const COLOR_DEPTH_OPTIONS: { value: ColorDepth; label: string; description: string }[] = [
  { value: 256, label: 'High Quality', description: 'Full color' },
  { value: 16, label: 'Balanced', description: 'Reduced color' },
  { value: 1, label: 'Grayscale', description: 'Monochrome' },
];

const MOUSE_THROTTLE_MS = 16; // ~60fps max for mouse moves

interface InlineRemoteSessionProps {
  className?: string;
}

export function InlineRemoteSession({ className }: InlineRemoteSessionProps) {
  const {
    sessionId,
    connectionState,
    setConnectionState,
    remoteMode,
    setRemoteMode,
    controlEnabled, // Derived from remoteMode for input handling
    endSession,
    sessionDuration,
    videoResolution,
    setVideoResolution,
    registerCleanup,
  } = useRemoteAccess();

  const [clipboardEnabled, setClipboardEnabled] = useState(false);
  const [uacDetected, setUacDetected] = useState(false);
  // Initialize from localStorage safely using lazy initializer
  const [colorDepth, setColorDepth] = useState<ColorDepth>(() => {
    if (typeof window === 'undefined') return 16;
    const saved = localStorage.getItem('remote_color_depth');
    return saved ? (parseInt(saved) as ColorDepth) : 16;
  });
  const [screenshotFlash, setScreenshotFlash] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Local cursor position for custom cursor overlay (pixel coordinates relative to video container)
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [cursorVisible, setCursorVisible] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const controlChannelRef = useRef<RTCDataChannel | null>(null);
  const clipboardChannelRef = useRef<RTCDataChannel | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const setupStartedRef = useRef(false);
  // Track signaling handshake completion - signaling errors are fatal only before this
  const signalingCompleteRef = useRef(false);

  // Throttling refs for mouse input
  const lastMouseMoveTimeRef = useRef<number>(0);
  const pendingMouseMoveRef = useRef<{ x: number; y: number } | null>(null);
  const mouseMoveRafRef = useRef<number | null>(null);

  // Track pressed keys for cleanup on mode switch (prevents stuck keys)
  const pressedKeysRef = useRef<Set<string>>(new Set());
  const pressedMouseButtonsRef = useRef<Set<number>>(new Set());

  // SignalR-based signaling
  const {
    signalingState,
    joinSession,
    leaveSession,
    sendSdpOffer,
    sendIceCandidate,
    enableControl: signalREnableControl,
    disableControl: signalRDisableControl,
    isConnected: isSignalingConnected,
  } = useRemoteAccessSignaling({
    onSdpAnswer: async (eventSessionId, payload) => {
      if (!sessionId || eventSessionId !== sessionId) return;

      console.log('[InlineRemote] 📨 Received SDP answer via SignalR', {
        sessionId: eventSessionId,
        sdpLength: payload.sdp?.length,
        timestamp: new Date().toISOString(),
      });
      const pc = peerConnectionRef.current;
      if (!pc) {
        console.warn('[InlineRemote] ⚠️ No peer connection when receiving SDP answer');
        return;
      }

      // Guard: Only process answer if connection is still viable
      if (pc.connectionState === 'closed' || pc.connectionState === 'failed') {
        console.warn('[InlineRemote] ⚠️ Ignoring SDP answer - connection is', pc.connectionState);
        return;
      }

      // CRITICAL: Only accept answer in "have-local-offer" state
      // If in "stable", the answer was already processed (duplicate message)
      if (pc.signalingState !== 'have-local-offer') {
        console.warn('[InlineRemote] ⚠️ Ignoring SDP answer - signaling state is', pc.signalingState, '(expected \'have-local-offer\')');
        return;
      }

      // Guard: Don't process if already have remote description (additional safety check)
      if (pc.remoteDescription) {
        console.warn('[InlineRemote] ⚠️ Ignoring duplicate SDP answer - already have remote description');
        return;
      }

      try {
        const answer = new RTCSessionDescription({
          type: 'answer',
          sdp: payload.sdp,
        });
        console.log('[InlineRemote] 📝 Setting remote description...');
        await pc.setRemoteDescription(answer);

        // Mark signaling handshake as complete
        signalingCompleteRef.current = true;
        console.log('[InlineRemote] ✅ Signaling handshake complete', {
          connectionState: pc.connectionState,
          iceConnectionState: pc.iceConnectionState,
          pendingCandidates: pendingIceCandidatesRef.current.length,
          timestamp: new Date().toISOString(),
        });

        // Process queued ICE candidates
        if (pendingIceCandidatesRef.current.length > 0) {
          console.log('[InlineRemote] 🧊 Processing', pendingIceCandidatesRef.current.length, 'queued ICE candidates');

          for (const candidateInit of pendingIceCandidatesRef.current) {
            await pc.addIceCandidate(new RTCIceCandidate(candidateInit)).catch((err) => {
              console.error('[InlineRemote] ❌ Failed to add queued ICE candidate:', err);
            });
          }

          pendingIceCandidatesRef.current = [];
        }
      } catch (error) {
        console.error('[InlineRemote] ❌ Failed to set remote description:', error);
        setConnectionState('failed');
      }
    },

    onIceCandidate: async (eventSessionId, payload) => {
      if (!sessionId || eventSessionId !== sessionId) return;

      const pc = peerConnectionRef.current;
      if (!pc) {
        console.warn('[InlineRemote] ⚠️ No peer connection when receiving ICE candidate');
        return;
      }

      if (payload.candidate) {
        const candidateInit: RTCIceCandidateInit = {
          candidate: payload.candidate,
          sdpMLineIndex: payload.sdpMLineIndex,
          sdpMid: payload.sdpMid,
        };

        // Parse candidate details for debugging
        const candidateStr = payload.candidate;
        const candidateType = candidateStr.includes('typ relay') ? 'relay' :
                              candidateStr.includes('typ srflx') ? 'srflx' :
                              candidateStr.includes('typ host') ? 'host' : 'unknown';
        const ipMatch = candidateStr.match(/(\d+\.\d+\.\d+\.\d+)/);
        const portMatch = candidateStr.match(/(\d+\.\d+\.\d+\.\d+)\s+(\d+)/);
        const protocolMatch = candidateStr.match(/udp|tcp/i);

        const candidateDetails = {
          type: candidateType,
          protocol: protocolMatch?.[0] || 'unknown',
          address: ipMatch?.[1] || 'no-ip',
          port: portMatch?.[2] || 'no-port',
          sdpMid: payload.sdpMid,
          fullCandidate: candidateStr.substring(0, 80) + (candidateStr.length > 80 ? '...' : ''),
        };

        if (!pc.remoteDescription) {
          console.log('[InlineRemote] 🧊 Queuing REMOTE ICE candidate (no remote description yet)', {
            ...candidateDetails,
            queueSize: pendingIceCandidatesRef.current.length + 1,
          });
          pendingIceCandidatesRef.current.push(candidateInit);
        } else {
          console.log('[InlineRemote] 🧊 Adding REMOTE ICE candidate from peer', candidateDetails);

          // Special logging for relay candidates
          if (candidateType === 'relay') {
            console.log('[InlineRemote] ✅ REMOTE peer has TURN relay candidate!', {
              relayAddress: ipMatch?.[1],
              relayPort: portMatch?.[2],
            });
          }

          await pc.addIceCandidate(new RTCIceCandidate(candidateInit)).catch((err) => {
            console.error('[InlineRemote] ❌ Failed to add REMOTE ICE candidate:', err, candidateDetails);
          });
        }
      }
    },

    onControlEnabled: (eventSessionId) => {
      if (!sessionId || eventSessionId !== sessionId) return;
      setRemoteMode('control');
    },

    onControlDisabled: (eventSessionId) => {
      if (!sessionId || eventSessionId !== sessionId) return;
      setRemoteMode('view');
    },

    onUacDetected: (eventSessionId) => {
      if (!sessionId || eventSessionId !== sessionId) return;
      setUacDetected(true);
    },

    onUacDismissed: (eventSessionId) => {
      if (!sessionId || eventSessionId !== sessionId) return;
      setUacDetected(false);
    },

    onParticipantLeft: (eventSessionId) => {
      if (!sessionId || eventSessionId !== sessionId) return;
      console.log('[InlineRemote] Remote participant left');
      setConnectionState('disconnected');
    },

    onError: (error) => {
      // Only treat errors as fatal before signaling handshake completes
      if (!signalingCompleteRef.current) {
        console.error('[InlineRemote] Signaling error (pre-handshake, fatal):', error);
        setConnectionState('failed');
      } else {
        // Post-handshake: WebRTC peer connection is established, signaling errors are non-critical
        console.warn('[InlineRemote] Signaling error (post-handshake, non-fatal)');
      }
    },
  });

  // Cleanup function
  const cleanup = useCallback(() => {
    pendingIceCandidatesRef.current = [];
    signalingCompleteRef.current = false;

    if (mouseMoveRafRef.current) {
      clearTimeout(mouseMoveRafRef.current);
      mouseMoveRafRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Leave session via SignalR
    if (sessionId) {
      leaveSession(sessionId).catch(console.error);
    }

    controlChannelRef.current = null;
    clipboardChannelRef.current = null;
  }, [sessionId, leaveSession]);

  // Register cleanup with context
  useEffect(() => {
    registerCleanup(cleanup);
    return cleanup;
  }, [cleanup, registerCleanup]);

  // Setup WebRTC connection with SignalR signaling
  const setupWebRTCWithSignaling = async () => {
    if (!sessionId) return;

    const setupStartTime = performance.now();
    console.log('[InlineRemote] 🚀 Starting WebRTC setup with SignalR signaling', {
      sessionId,
      timestamp: new Date().toISOString(),
    });

    try {
      // Fetch TURN credentials
      let iceServers: RTCIceServer[] = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ];

      try {
        console.log('[InlineRemote] 🔑 Fetching TURN credentials...');
        const turnResponse = await fetch('/api/turn/credentials', {
          credentials: 'include',
        });

        if (turnResponse.ok) {
          const { iceServers: turnIceServers } = await turnResponse.json();
          iceServers = turnIceServers;

          // Log detailed ICE server configuration for debugging
          console.log('[InlineRemote] ✅ TURN credentials received', {
            serverCount: iceServers.length,
            elapsed: Math.round(performance.now() - setupStartTime) + 'ms',
          });

          // Log each ICE server (hide credentials)
          iceServers.forEach((server, index) => {
            const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
            const hasTurn = urls.some(url => url.startsWith('turn:'));
            console.log(`[InlineRemote] 🔧 ICE Server ${index + 1}:`, {
              urls: urls,
              hasTurnServer: hasTurn,
              hasUsername: !!server.username,
              hasCredential: !!server.credential,
              usernamePrefix: server.username ? server.username.substring(0, 20) + '...' : 'none',
            });
          });

          // Warn if no TURN servers
          const turnServers = iceServers.filter(s => {
            const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
            return urls.some(url => url.startsWith('turn:'));
          });
          if (turnServers.length === 0) {
            console.error('[InlineRemote] ❌ NO TURN SERVERS IN ICE CONFIG!');
          }
        } else {
          console.warn('[InlineRemote] ⚠️ TURN credentials request failed', {
            status: turnResponse.status,
          });
        }
      } catch (turnError) {
        console.warn('[InlineRemote] ⚠️ Failed to fetch TURN, using STUN only', turnError);
      }

      // Join session via SignalR
      console.log('[InlineRemote] 📡 Joining session via SignalR...');
      await joinSession(sessionId, 'agent');
      console.log('[InlineRemote] ✅ Joined session via SignalR', {
        elapsed: Math.round(performance.now() - setupStartTime) + 'ms',
      });

      // Create RTCPeerConnection
      const pc = new RTCPeerConnection({
        iceServers,
        iceTransportPolicy: 'all',  // Allow all candidates (host, srflx, relay)
        iceCandidatePoolSize: 10,
      });
      peerConnectionRef.current = pc;

      // Handle incoming streams
      pc.ontrack = (event) => {
        console.log('[InlineRemote] 🎥 Track received', {
          kind: event.track.kind,
          trackId: event.track.id,
          streamCount: event.streams.length,
          timestamp: new Date().toISOString(),
        });
        if (videoRef.current && event.streams[0]) {
          const video = videoRef.current;
          video.srcObject = event.streams[0];

          video.onloadedmetadata = () => {
            console.log('[InlineRemote] 🖥️ Video metadata loaded', {
              width: video.videoWidth,
              height: video.videoHeight,
              timestamp: new Date().toISOString(),
            });
            setVideoResolution({ width: video.videoWidth, height: video.videoHeight });
          };

          video.play().catch(() => {
            video.muted = true;
            video.play().catch(console.error);
          });

          console.log('[InlineRemote] ✅ Setting connectionState to "connected" (track received)');
          setConnectionState('connected');
        }
      };

      // Track previous connection state for debugging
      let previousConnectionState = pc.connectionState;
      pc.onconnectionstatechange = () => {
        const newState = pc.connectionState;
        console.log('[InlineRemote] 🔄 WebRTC connectionState changed', {
          from: previousConnectionState,
          to: newState,
          iceConnectionState: pc.iceConnectionState,
          iceGatheringState: pc.iceGatheringState,
          signalingState: pc.signalingState,
          signalingComplete: signalingCompleteRef.current,
          timestamp: new Date().toISOString(),
        });
        previousConnectionState = newState;

        // Don't immediately show "disconnected" if signaling is still in progress
        // This prevents the flash during initial ICE negotiation
        if (newState === 'disconnected' && !signalingCompleteRef.current) {
          console.log('[InlineRemote] ⏳ Ignoring "disconnected" state - signaling not complete yet');
          return;
        }

        setConnectionState(newState as any);
      };

      // Track previous ICE connection state for debugging
      let previousIceState = pc.iceConnectionState;
      pc.oniceconnectionstatechange = () => {
        const newIceState = pc.iceConnectionState;
        console.log('[InlineRemote] 🧊 ICE connectionState changed', {
          from: previousIceState,
          to: newIceState,
          connectionState: pc.connectionState,
          iceGatheringState: pc.iceGatheringState,
          signalingComplete: signalingCompleteRef.current,
          timestamp: new Date().toISOString(),
        });
        previousIceState = newIceState;

        if (newIceState === 'failed') {
          console.log('[InlineRemote] ❌ ICE connection failed - setting connectionState to "failed"');
          setConnectionState('failed');
        } else if (newIceState === 'disconnected') {
          console.log('[InlineRemote] ⚠️ ICE disconnected (may recover)');
        } else if (newIceState === 'connected' || newIceState === 'completed') {
          console.log('[InlineRemote] ✅ ICE connected/completed');
        }
      };

      // Log ICE gathering state changes
      pc.onicegatheringstatechange = () => {
        console.log('[InlineRemote] 📡 ICE gathering state changed', {
          state: pc.iceGatheringState,
          timestamp: new Date().toISOString(),
        });
      };

      // Log signaling state changes
      pc.onsignalingstatechange = () => {
        console.log('[InlineRemote] 📞 Signaling state changed', {
          state: pc.signalingState,
          timestamp: new Date().toISOString(),
        });
      };

      // Handle ICE candidates - send via SignalR
      // Track gathered candidate types for debugging
      const gatheredCandidates = { host: 0, srflx: 0, relay: 0, unknown: 0 };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candidateStr = event.candidate.candidate;
          const candidateType = candidateStr.includes('typ relay') ? 'relay' :
                                candidateStr.includes('typ srflx') ? 'srflx' :
                                candidateStr.includes('typ host') ? 'host' : 'unknown';

          // Track candidate counts
          gatheredCandidates[candidateType as keyof typeof gatheredCandidates]++;

          // Parse candidate details for debugging
          const ipMatch = candidateStr.match(/(\d+\.\d+\.\d+\.\d+)/);
          const portMatch = candidateStr.match(/(\d+\.\d+\.\d+\.\d+)\s+(\d+)/);
          const protocolMatch = candidateStr.match(/udp|tcp/i);

          console.log('[InlineRemote] 🧊 ICE candidate gathered', {
            type: candidateType,
            protocol: protocolMatch?.[0] || 'unknown',
            address: ipMatch?.[1] || 'no-ip',
            port: portMatch?.[2] || 'no-port',
            sdpMid: event.candidate.sdpMid,
            component: event.candidate.component,
            foundation: event.candidate.foundation,
            priority: event.candidate.priority,
            fullCandidate: candidateStr.substring(0, 80) + (candidateStr.length > 80 ? '...' : ''),
          });

          // Special logging for relay candidates (TURN)
          if (candidateType === 'relay') {
            console.log('[InlineRemote] ✅ TURN RELAY candidate found - NAT traversal available!', {
              relayAddress: ipMatch?.[1],
              relayPort: portMatch?.[2],
            });
          }

          sendIceCandidate(sessionId, {
            candidate: event.candidate.candidate,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
            sdpMid: event.candidate.sdpMid,
          }).catch((err) => {
            console.error('[InlineRemote] ❌ Failed to send ICE candidate:', err);
          });
        } else {
          console.log('[InlineRemote] 🧊 ICE gathering complete', {
            totalCandidates: gatheredCandidates,
            hasRelayCandidates: gatheredCandidates.relay > 0,
            timestamp: new Date().toISOString(),
          });

          // Warn if no relay candidates were gathered
          if (gatheredCandidates.relay === 0) {
            console.warn('[InlineRemote] ⚠️ NO RELAY (TURN) CANDIDATES GATHERED!', {
              message: 'TURN server may be unreachable or misconfigured',
              host: gatheredCandidates.host,
              srflx: gatheredCandidates.srflx,
            });
          }
        }
      };

      // Create data channels - use RELIABLE transport for control events
      const controlChannel = pc.createDataChannel('control', {
        ordered: true,
      });
      controlChannelRef.current = controlChannel;

      const clipboardChannel = pc.createDataChannel('clipboard', {
        ordered: true,
      });
      clipboardChannelRef.current = clipboardChannel;

      clipboardChannel.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'clipboard_update') {
            navigator.clipboard.writeText(data.content).catch(console.error);
          }
        } catch (error) {
          console.error('[InlineRemote] Clipboard error:', error);
        }
      };

      // Create and send offer via SignalR
      console.log('[InlineRemote] 📝 Creating SDP offer...');
      const offer = await pc.createOffer({
        offerToReceiveVideo: true,
        offerToReceiveAudio: false,
      });

      console.log('[InlineRemote] 📝 Setting local description...');
      await pc.setLocalDescription(offer);
      console.log('[InlineRemote] ✅ Local description set', {
        signalingState: pc.signalingState,
        elapsed: Math.round(performance.now() - setupStartTime) + 'ms',
      });

      console.log('[InlineRemote] 📤 Sending SDP offer via SignalR...');
      await sendSdpOffer(sessionId, {
        sdp: offer.sdp!,
        type: offer.type,
      });
      console.log('[InlineRemote] ✅ SDP offer sent - waiting for answer', {
        sdpLength: offer.sdp!.length,
        elapsed: Math.round(performance.now() - setupStartTime) + 'ms',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[InlineRemote] ❌ Setup error:', error);
      setConnectionState('failed');
    }
  };

  // Setup WebRTC connection with SignalR signaling
  useEffect(() => {
    if (!sessionId || setupStartedRef.current) {
      return;
    }
    setupStartedRef.current = true;

    startTransition(() => {
      setupWebRTCWithSignaling();
    });

    return () => {
      setupStartedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setupWebRTCWithSignaling is defined inline and only called here
  }, [sessionId]);

  const sendControlEvent = useCallback((event: any) => {
    if (controlChannelRef.current?.readyState === 'open' && controlEnabled) {
      controlChannelRef.current.send(JSON.stringify(event));
    }
  }, [controlEnabled]);

  // Release all pressed keys and mouse buttons (called on mode switch/disconnect)
  const releaseAllInputs = useCallback(() => {
    const channel = controlChannelRef.current;
    if (!channel || channel.readyState !== 'open') return;

    // Release all pressed keys
    pressedKeysRef.current.forEach((code) => {
      channel.send(JSON.stringify({
        type: 'key_up',
        key: '',
        code,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
      }));
    });
    pressedKeysRef.current.clear();

    // Release all pressed mouse buttons
    pressedMouseButtonsRef.current.forEach((button) => {
      channel.send(JSON.stringify({
        type: 'mouse_up',
        button,
      }));
    });
    pressedMouseButtonsRef.current.clear();

    console.log('[InlineRemote] Released all inputs on mode switch');
  }, []);

  // Release all inputs when connection is lost or session ends
  useEffect(() => {
    if (connectionState === 'disconnected' || connectionState === 'failed' || connectionState === 'closed') {
      if (pressedKeysRef.current.size > 0 || pressedMouseButtonsRef.current.size > 0) {
        console.log('[InlineRemote] Clearing pressed keys/buttons on disconnect');
        pressedKeysRef.current.clear();
        pressedMouseButtonsRef.current.clear();
      }
    }
  }, [connectionState]);

  // Release all inputs when window loses focus
  useEffect(() => {
    if (!controlEnabled) return;

    const handleWindowBlur = () => {
      console.log('[InlineRemote] Window lost focus, releasing all inputs');
      releaseAllInputs();
    };

    window.addEventListener('blur', handleWindowBlur);
    return () => window.removeEventListener('blur', handleWindowBlur);
  }, [controlEnabled, releaseAllInputs]);

  // Format duration as HH:MM:SS
  const formatDuration = useCallback((seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }, []);

  // Screenshot
  const handleScreenshot = useCallback(async () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || video.clientWidth;
    canvas.height = video.videoHeight || video.clientHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Add timestamp
    const timestamp = new Date().toISOString();
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, canvas.height - 40, 320, 40);
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.fillText(`Session: ${sessionId?.slice(0, 8)}`, 10, canvas.height - 22);
    ctx.fillText(timestamp, 10, canvas.height - 6);

    setScreenshotFlash(true);
    setTimeout(() => setScreenshotFlash(false), 300);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const filename = `screenshot_${sessionId?.slice(0, 8)}_${Date.now()}.png`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }, [sessionId]);

  // Color depth
  const handleColorDepthChange = useCallback((depth: ColorDepth) => {
    setColorDepth(depth);
    localStorage.setItem('remote_color_depth', depth.toString());

    if (controlChannelRef.current?.readyState === 'open') {
      controlChannelRef.current.send(
        JSON.stringify({
          type: 'set_color_depth',
          depth,
        })
      );
    }
  }, []);

  const getColorDepthFilter = useCallback((depth: ColorDepth) => {
    switch (depth) {
      case 256:
        return 'none';
      case 16:
        return 'saturate(0.5) contrast(1.1)';
      case 1:
        return 'grayscale(100%)';
      default:
        return 'none';
    }
  }, []);

  // Mouse and keyboard handlers
  useEffect(() => {
    if (!controlEnabled || !videoRef.current) return;

    const videoElement = videoRef.current;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      const rect = videoElement.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;

      // Update local cursor position
      setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });

      pendingMouseMoveRef.current = { x, y };

      const now = performance.now();
      const timeSinceLastMove = now - lastMouseMoveTimeRef.current;

      if (timeSinceLastMove >= MOUSE_THROTTLE_MS) {
        lastMouseMoveTimeRef.current = now;
        sendControlEvent({ type: 'mouse_move', x, y });
        pendingMouseMoveRef.current = null;
      } else if (!mouseMoveRafRef.current) {
        mouseMoveRafRef.current = window.setTimeout(() => {
          mouseMoveRafRef.current = null;
          if (pendingMouseMoveRef.current) {
            lastMouseMoveTimeRef.current = performance.now();
            sendControlEvent({ type: 'mouse_move', ...pendingMouseMoveRef.current });
            pendingMouseMoveRef.current = null;
          }
        }, MOUSE_THROTTLE_MS - timeSinceLastMove);
      }
    };

    const handleMouseEnter = () => {
      setCursorVisible(true);
    };

    const handleMouseLeave = () => {
      setCursorVisible(false);
      setCursorPos(null);
    };

    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      pressedMouseButtonsRef.current.add(e.button);
      sendControlEvent({ type: 'mouse_down', button: e.button });
    };

    const handleMouseUp = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      pressedMouseButtonsRef.current.delete(e.button);
      sendControlEvent({ type: 'mouse_up', button: e.button });
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      sendControlEvent({ type: 'mouse_wheel', deltaX: e.deltaX, deltaY: e.deltaY });
    };

    const cannotPreventDefault = (e: KeyboardEvent): boolean => {
      if (e.altKey && e.key === 'Tab') return true;
      if (e.altKey && e.key === 'F4') return true;
      if (e.ctrlKey && e.altKey && e.key === 'Delete') return true;
      if (e.metaKey && ['Tab', 'd', 'l'].includes(e.key.toLowerCase())) return true;
      if (e.ctrlKey && ['w', 'n', 't'].includes(e.key.toLowerCase())) return true;
      if (e.key === 'F11') return true;
      return false;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      pressedKeysRef.current.add(e.code);

      if (!cannotPreventDefault(e)) {
        e.preventDefault();
        e.stopPropagation();
      }

      sendControlEvent({
        type: 'key_down',
        key: e.key,
        code: e.code,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
      });
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      pressedKeysRef.current.delete(e.code);

      if (!cannotPreventDefault(e)) {
        e.preventDefault();
        e.stopPropagation();
      }

      sendControlEvent({
        type: 'key_up',
        key: e.key,
        code: e.code,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
      });
    };

    videoElement.addEventListener('mousemove', handleMouseMove);
    videoElement.addEventListener('mouseenter', handleMouseEnter);
    videoElement.addEventListener('mouseleave', handleMouseLeave);
    videoElement.addEventListener('mousedown', handleMouseDown);
    videoElement.addEventListener('mouseup', handleMouseUp);
    videoElement.addEventListener('contextmenu', handleContextMenu);
    videoElement.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });

    return () => {
      if (mouseMoveRafRef.current) {
        clearTimeout(mouseMoveRafRef.current);
        mouseMoveRafRef.current = null;
      }
      videoElement.removeEventListener('mousemove', handleMouseMove);
      videoElement.removeEventListener('mouseenter', handleMouseEnter);
      videoElement.removeEventListener('mouseleave', handleMouseLeave);
      videoElement.removeEventListener('mousedown', handleMouseDown);
      videoElement.removeEventListener('mouseup', handleMouseUp);
      videoElement.removeEventListener('contextmenu', handleContextMenu);
      videoElement.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });

      // Release all pressed keys on cleanup
      releaseAllInputs();

      setCursorVisible(false);
      setCursorPos(null);
    };
  }, [controlEnabled, releaseAllInputs, sendControlEvent]);

  // Track previous mode to detect changes
  const prevRemoteModeRef = useRef<typeof remoteMode | null>(null);

  // Sync remote mode changes with SignalR signaling
  useEffect(() => {
    if (!sessionId || connectionState !== 'connected') return;

    // Skip initial render
    if (prevRemoteModeRef.current === null) {
      prevRemoteModeRef.current = remoteMode;
      return;
    }

    // Only send if mode actually changed
    if (prevRemoteModeRef.current === remoteMode) return;
    prevRemoteModeRef.current = remoteMode;

    console.log('[InlineRemote] Mode changed to:', remoteMode);

    // Send mode change via SignalR
    if (remoteMode === 'control') {
      signalREnableControl(sessionId).catch(console.error);
      console.log('[InlineRemote] Control enabled via SignalR');
    } else {
      // Release all pressed keys/buttons BEFORE notifying remote
      releaseAllInputs();
      signalRDisableControl(sessionId).catch(console.error);
      console.log('[InlineRemote] Control disabled via SignalR');
    }
  }, [remoteMode, sessionId, connectionState, releaseAllInputs, signalREnableControl, signalRDisableControl]);

  // End session
  const handleEndSession = () => {
    endSession('agent_ended');
  };

  // Fullscreen toggle
  const handleFullscreen = () => {
    if (!containerRef.current) return;

    if (document.fullscreenElement) {
      document.exitFullscreen();
      setIsFullscreen(false);
    } else {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    }
  };

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  if (!sessionId) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex flex-col bg-gray-900 rounded-lg overflow-hidden',
        isFullscreen ? 'fixed inset-0 z-50 rounded-none' : 'h-full',
        className
      )}
    >
      {/* NetSupport-style Compact Toolbar */}
      <div className="relative flex items-center justify-between bg-gray-800 px-2 py-1.5 border-b border-gray-700/50">
        {/* Left: Session Status */}
        <div className="flex items-center gap-2 text-xs">
          {/* Connection indicator */}
          <div
            className={cn(
              'h-2 w-2 rounded-full flex-shrink-0',
              connectionState === 'connected'
                ? 'bg-green-500'
                : connectionState === 'connecting' || connectionState === 'reconnecting'
                ? 'bg-yellow-500 animate-pulse'
                : 'bg-red-500'
            )}
          />

          {/* Elapsed time */}
          {connectionState === 'connected' && (
            <span className="text-gray-400 font-mono tabular-nums">
              {formatDuration(sessionDuration)}
            </span>
          )}

          {/* Resolution */}
          {videoResolution && connectionState === 'connected' && (
            <span className="text-gray-500">
              {videoResolution.width}x{videoResolution.height}
            </span>
          )}

          {/* Control Active badge */}
          {connectionState === 'connected' && remoteMode === 'control' && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/20 text-blue-400">
              Control Active
            </span>
          )}

          {/* Connecting/Reconnecting text */}
          {connectionState !== 'connected' && (
            <span className="text-gray-400 capitalize">
              {connectionState === 'reconnecting' ? 'Reconnecting...' : connectionState}
            </span>
          )}
        </div>

        {/* Center: Mode Selector */}
        <div className="absolute left-1/2 -translate-x-1/2">
          <RemoteModeSelector disabled={connectionState !== 'connected'} />
        </div>

        {/* Right: Action Icons */}
        <div className="flex items-center gap-0.5">
          {/* Color Depth */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={connectionState !== 'connected'}
                className={cn(
                  'p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors',
                  'focus:outline-none focus:ring-1 focus:ring-gray-500',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
                title="Color Depth"
              >
                <Palette className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {COLOR_DEPTH_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => handleColorDepthChange(option.value)}
                  className={colorDepth === option.value ? 'bg-accent' : ''}
                >
                  <div className="flex flex-col">
                    <span className="text-sm">{option.label}</span>
                    <span className="text-xs text-muted-foreground">{option.description}</span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Screenshot */}
          <button
            type="button"
            onClick={handleScreenshot}
            disabled={connectionState !== 'connected'}
            className={cn(
              'p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors',
              'focus:outline-none focus:ring-1 focus:ring-gray-500',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
            title="Screenshot"
          >
            <Camera className="h-4 w-4" />
          </button>

          {/* Fullscreen */}
          <button
            type="button"
            onClick={handleFullscreen}
            className={cn(
              'p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors',
              'focus:outline-none focus:ring-1 focus:ring-gray-500'
            )}
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize className="h-4 w-4" />
            )}
          </button>

          {/* Separator */}
          <div className="w-px h-4 bg-gray-600 mx-1" />

          {/* End Session (destructive) */}
          <button
            type="button"
            onClick={handleEndSession}
            className={cn(
              'p-1.5 rounded text-red-400 hover:text-red-300 hover:bg-red-900/30 transition-colors',
              'focus:outline-none focus:ring-1 focus:ring-red-500/50'
            )}
            title="End Session"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Video Container */}
      <div className="flex-1 relative min-h-0 bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={cn(
            'w-full h-full object-contain',
            remoteMode === 'control' ? 'cursor-none' : 'cursor-default'
          )}
          style={{
            userSelect: 'none',
            WebkitUserSelect: 'none',
            touchAction: 'none',
            imageRendering: 'crisp-edges',
            ...(colorDepth !== 256 && { filter: getColorDepthFilter(colorDepth) }),
          }}
          onDragStart={(e) => e.preventDefault()}
        />

        {/* Privacy/Mode Indicator Border */}
        <div className={cn(
          'absolute inset-0 pointer-events-none border-2',
          remoteMode === 'control'
            ? 'border-blue-500/50'
            : 'border-red-500/30'
        )} />

        {/* Custom Cursor Overlay */}
        {remoteMode === 'control' && cursorVisible && cursorPos && (
          <div
            className="absolute pointer-events-none z-10"
            style={{
              left: cursorPos.x,
              top: cursorPos.y,
              transform: 'translate(-2px, -2px)',
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="drop-shadow-lg"
            >
              <path
                d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.89 0 1.33-1.08.7-1.71L6.21 3.51c-.32-.32-.71-.3-.71.7z"
                fill="white"
                stroke="white"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              <path
                d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.89 0 1.33-1.08.7-1.71L6.21 3.51c-.32-.32-.71-.3-.71.7z"
                fill="#3B82F6"
                stroke="#1D4ED8"
                strokeWidth="1"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        )}

        {/* Screenshot Flash */}
        {screenshotFlash && (
          <div className="absolute inset-0 bg-white pointer-events-none animate-pulse" />
        )}

        {/* Connection Overlay */}
        {(connectionState === 'connecting' ||
          connectionState === 'reconnecting' ||
          connectionState === 'disconnected' ||
          connectionState === 'failed') && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/75">
            <div className="text-center text-white bg-gray-800/90 p-6 rounded-lg">
              {connectionState === 'reconnecting' ? (
                <>
                  <RefreshCw className="h-10 w-10 mx-auto mb-3 animate-spin text-blue-500" />
                  <p className="font-medium">Reconnecting...</p>
                </>
              ) : connectionState === 'failed' ? (
                <>
                  <X className="h-10 w-10 mx-auto mb-3 text-red-500" />
                  <p className="font-medium mb-2">Connection Failed</p>
                  <Button onClick={handleEndSession} variant="outline" size="sm">
                    Close
                  </Button>
                </>
              ) : connectionState === 'disconnected' ? (
                <>
                  <Monitor className="h-10 w-10 mx-auto mb-3 text-yellow-500" />
                  <p className="font-medium mb-2">Disconnected</p>
                  <Button onClick={handleEndSession} variant="outline" size="sm">
                    Close
                  </Button>
                </>
              ) : (
                <>
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white mx-auto mb-3" />
                  <p>Connecting...</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* UAC Overlay */}
        {uacDetected && (
          <div className="absolute inset-0 flex items-center justify-center bg-yellow-900/80">
            <div className="text-center text-white bg-yellow-800 p-4 rounded-lg">
              <p className="font-semibold">UAC Prompt Detected</p>
              <p className="text-sm text-gray-200 mt-1">
                Waiting for user to complete authorization...
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
