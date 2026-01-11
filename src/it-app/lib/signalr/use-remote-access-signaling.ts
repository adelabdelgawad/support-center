'use client';

/**
 * Remote Access Signaling Hook (SignalR)
 *
 * Provides WebRTC signaling over SignalR for remote access sessions.
 * Replaces the previous WebSocket-based signaling implementation.
 *
 * Features:
 * - Automatic connection management
 * - SDP offer/answer exchange
 * - ICE candidate relay
 * - Control enable/disable signaling
 * - Reconnection handling
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { signalRRemoteAccess, SignalRState } from './signalr-manager';
import type { HubConnection } from '@microsoft/signalr';
import * as signalR from '@microsoft/signalr';

export type SignalingState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed';

export interface RemoteAccessSignalingHandlers {
  onSdpOffer?: (sessionId: string, payload: { sdp: string; type: string }) => void;
  onSdpAnswer?: (sessionId: string, payload: { sdp: string; type: string }) => void;
  onIceCandidate?: (sessionId: string, payload: { candidate: string; sdpMLineIndex: number | null; sdpMid: string | null }) => void;
  onControlEnabled?: (sessionId: string) => void;
  onControlDisabled?: (sessionId: string) => void;
  onUacDetected?: (sessionId: string) => void;
  onUacDismissed?: (sessionId: string) => void;
  onParticipantJoined?: (sessionId: string, participantType: string) => void;
  onParticipantLeft?: (sessionId: string) => void;
  onSessionJoined?: (sessionId: string) => void;
  onError?: (error: Error) => void;
}

export interface UseRemoteAccessSignalingResult {
  /** Current signaling connection state */
  signalingState: SignalingState;

  /** Join a remote access session */
  joinSession: (sessionId: string, participantType: 'agent' | 'requester') => Promise<void>;

  /** Leave the current session */
  leaveSession: (sessionId: string) => Promise<void>;

  /** Send SDP offer */
  sendSdpOffer: (sessionId: string, sdp: { sdp: string; type: string }) => Promise<void>;

  /** Send SDP answer */
  sendSdpAnswer: (sessionId: string, sdp: { sdp: string; type: string }) => Promise<void>;

  /** Send ICE candidate */
  sendIceCandidate: (sessionId: string, candidate: { candidate: string; sdpMLineIndex: number | null; sdpMid: string | null }) => Promise<void>;

  /** Enable remote control */
  enableControl: (sessionId: string) => Promise<void>;

  /** Disable remote control */
  disableControl: (sessionId: string) => Promise<void>;

  /** Check if SignalR is connected */
  isConnected: boolean;
}

/**
 * Hook for remote access signaling over SignalR
 */
export function useRemoteAccessSignaling(
  handlers: RemoteAccessSignalingHandlers = {}
): UseRemoteAccessSignalingResult {
  const [signalingState, setSignalingState] = useState<SignalingState>('disconnected');
  const handlersRef = useRef(handlers);
  const connectionRef = useRef<HubConnection | null>(null);
  const currentSessionRef = useRef<string | null>(null);
  const isConnectingRef = useRef(false);

  // Keep handlers ref updated
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  // Connect to SignalR and set up event handlers
  const connect = useCallback(async () => {
    // Check if already connected using the actual hub state
    if (signalRRemoteAccess.isConnected()) {
      console.log('[RemoteAccessSignaling] Already connected');
      setSignalingState('connected');
      return;
    }

    if (isConnectingRef.current) {
      console.log('[RemoteAccessSignaling] Already connecting, waiting...');
      // Wait for existing connection attempt
      const isReady = await signalRRemoteAccess.waitForConnected(5000);
      if (isReady) {
        setSignalingState('connected');
      }
      return;
    }

    isConnectingRef.current = true;
    setSignalingState('connecting');

    try {
      console.log('[RemoteAccessSignaling] Connecting to SignalR...');
      await signalRRemoteAccess.connect();

      // Verify connection is truly established
      const isReady = await signalRRemoteAccess.waitForConnected(5000);
      if (!isReady) {
        throw new Error('Connection established but hub not in Connected state');
      }

      // Get the internal connection for event handling
      // Note: signalRRemoteAccess wraps the connection, we use invoke through the manager
      connectionRef.current = (signalRRemoteAccess as any).connection;

      console.log('[RemoteAccessSignaling] Connected to SignalR');
      setSignalingState('connected');
    } catch (error) {
      console.error('[RemoteAccessSignaling] Connection failed:', error);
      setSignalingState('failed');
      handlersRef.current.onError?.(error instanceof Error ? error : new Error(String(error)));
    } finally {
      isConnectingRef.current = false;
    }
  }, []);

  // Set up SignalR event handlers
  useEffect(() => {
    // Set global handlers for connection state
    signalRRemoteAccess.setGlobalHandlers({
      onConnect: () => {
        console.log('[RemoteAccessSignaling] ✅ SignalR connected', {
          timestamp: new Date().toISOString(),
        });
        setSignalingState('connected');
      },
      onDisconnect: () => {
        console.log('[RemoteAccessSignaling] ❌ SignalR disconnected', {
          timestamp: new Date().toISOString(),
        });
        setSignalingState('disconnected');
      },
      onReconnecting: (attempt) => {
        console.log('[RemoteAccessSignaling] 🔄 SignalR reconnecting', {
          attempt,
          timestamp: new Date().toISOString(),
        });
        setSignalingState('reconnecting');
      },
      onError: (error) => {
        console.error('[RemoteAccessSignaling] ❌ SignalR error:', {
          error,
          timestamp: new Date().toISOString(),
        });
        handlersRef.current.onError?.(new Error(error));
      },
    });

    // We need to register message handlers on the underlying connection
    // The signalRRemoteAccess manager doesn't expose .on() directly for custom events
    // We'll use a workaround by accessing the connection after it's established
    const setupMessageHandlers = () => {
      const connection = (signalRRemoteAccess as any).connection as HubConnection | null;
      if (!connection) {
        console.log('[RemoteAccessSignaling] No connection yet for message handlers');
        return;
      }

      // SDP Offer from remote party
      connection.off('SdpOffer');
      connection.on('SdpOffer', (data: { sessionId: string; payload: { sdp: string; type: string }; fromUserId: string }) => {
        console.log('[RemoteAccessSignaling] 📨 Received SdpOffer', {
          sessionId: data.sessionId,
          fromUserId: data.fromUserId,
          sdpLength: data.payload.sdp?.length,
          timestamp: new Date().toISOString(),
        });
        handlersRef.current.onSdpOffer?.(data.sessionId, data.payload);
      });

      // SDP Answer from remote party
      connection.off('SdpAnswer');
      connection.on('SdpAnswer', (data: { sessionId: string; payload: { sdp: string; type: string }; fromUserId: string }) => {
        console.log('[RemoteAccessSignaling] 📨 Received SdpAnswer', {
          sessionId: data.sessionId,
          fromUserId: data.fromUserId,
          sdpLength: data.payload.sdp?.length,
          timestamp: new Date().toISOString(),
        });
        handlersRef.current.onSdpAnswer?.(data.sessionId, data.payload);
      });

      // ICE Candidate from remote party
      connection.off('IceCandidate');
      connection.on('IceCandidate', (data: { sessionId: string; payload: { candidate: string; sdpMLineIndex: number | null; sdpMid: string | null }; fromUserId: string }) => {
        const candidateType = data.payload.candidate?.includes('typ relay') ? 'relay (TURN)' :
                              data.payload.candidate?.includes('typ srflx') ? 'srflx (STUN)' :
                              data.payload.candidate?.includes('typ host') ? 'host' : 'unknown';
        console.log('[RemoteAccessSignaling] 🧊 Received IceCandidate', {
          sessionId: data.sessionId,
          fromUserId: data.fromUserId,
          type: candidateType,
          timestamp: new Date().toISOString(),
        });
        handlersRef.current.onIceCandidate?.(data.sessionId, data.payload);
      });

      // Control enabled
      connection.off('ControlEnabled');
      connection.on('ControlEnabled', (data: { sessionId: string }) => {
        console.log('[RemoteAccessSignaling] 🎮 Control enabled', {
          sessionId: data.sessionId,
          timestamp: new Date().toISOString(),
        });
        handlersRef.current.onControlEnabled?.(data.sessionId);
      });

      // Control disabled
      connection.off('ControlDisabled');
      connection.on('ControlDisabled', (data: { sessionId: string }) => {
        console.log('[RemoteAccessSignaling] 🎮 Control disabled', {
          sessionId: data.sessionId,
          timestamp: new Date().toISOString(),
        });
        handlersRef.current.onControlDisabled?.(data.sessionId);
      });

      // UAC detected
      connection.off('UacDetected');
      connection.on('UacDetected', (data: { sessionId: string }) => {
        console.log('[RemoteAccessSignaling] 🛡️ UAC detected', {
          sessionId: data.sessionId,
          timestamp: new Date().toISOString(),
        });
        handlersRef.current.onUacDetected?.(data.sessionId);
      });

      // UAC dismissed
      connection.off('UacDismissed');
      connection.on('UacDismissed', (data: { sessionId: string }) => {
        console.log('[RemoteAccessSignaling] 🛡️ UAC dismissed', {
          sessionId: data.sessionId,
          timestamp: new Date().toISOString(),
        });
        handlersRef.current.onUacDismissed?.(data.sessionId);
      });

      // Participant joined
      connection.off('ParticipantJoined');
      connection.on('ParticipantJoined', (data: { sessionId: string; participantType: string; userId: string }) => {
        console.log('[RemoteAccessSignaling] 👤 Participant joined', {
          sessionId: data.sessionId,
          participantType: data.participantType,
          userId: data.userId,
          timestamp: new Date().toISOString(),
        });
        handlersRef.current.onParticipantJoined?.(data.sessionId, data.participantType);
      });

      // Participant left
      connection.off('ParticipantLeft');
      connection.on('ParticipantLeft', (data: { sessionId: string; userId: string }) => {
        console.log('[RemoteAccessSignaling] 👤 Participant left', {
          sessionId: data.sessionId,
          userId: data.userId,
          timestamp: new Date().toISOString(),
        });
        handlersRef.current.onParticipantLeft?.(data.sessionId);
      });

      // Session joined confirmation
      connection.off('SessionJoined');
      connection.on('SessionJoined', (data: { sessionId: string; participantType: string }) => {
        console.log('[RemoteAccessSignaling] ✅ Session joined confirmation', {
          sessionId: data.sessionId,
          participantType: data.participantType,
          timestamp: new Date().toISOString(),
        });
        handlersRef.current.onSessionJoined?.(data.sessionId);
      });

      console.log('[RemoteAccessSignaling] ✅ Message handlers registered');
    };

    // Set up handlers when state changes to connected
    if (signalingState === 'connected') {
      setupMessageHandlers();
    }

    return () => {
      // Cleanup handlers on unmount
      const connection = (signalRRemoteAccess as any).connection as HubConnection | null;
      if (connection) {
        connection.off('SdpOffer');
        connection.off('SdpAnswer');
        connection.off('IceCandidate');
        connection.off('ControlEnabled');
        connection.off('ControlDisabled');
        connection.off('UacDetected');
        connection.off('UacDismissed');
        connection.off('ParticipantJoined');
        connection.off('ParticipantLeft');
        connection.off('SessionJoined');
      }
    };
  }, [signalingState]);

  // Join session
  const joinSession = useCallback(async (sessionId: string, participantType: 'agent' | 'requester') => {
    console.log(`[RemoteAccessSignaling] Joining session ${sessionId} as ${participantType}`);

    // Connect if not already connected (use actual hub state, not React state)
    if (!signalRRemoteAccess.isConnected()) {
      await connect();
    }

    // Wait for connection to be fully established
    const isReady = await signalRRemoteAccess.waitForConnected(5000);
    if (!isReady) {
      const error = new Error('SignalR connection not ready after timeout');
      console.error('[RemoteAccessSignaling] Connection not ready:', error);
      setSignalingState('failed');
      handlersRef.current.onError?.(error);
      throw error;
    }

    try {
      await signalRRemoteAccess.invoke('JoinSession', sessionId, participantType);
      currentSessionRef.current = sessionId;
      console.log('[RemoteAccessSignaling] Joined session successfully');
    } catch (error) {
      console.error('[RemoteAccessSignaling] Failed to join session:', error);
      throw error;
    }
  }, [connect]);

  // Leave session
  const leaveSession = useCallback(async (sessionId: string) => {
    console.log('[RemoteAccessSignaling] Leaving session:', sessionId);

    if (!signalRRemoteAccess.isConnected()) {
      console.log('[RemoteAccessSignaling] Not connected, skipping leave');
      return;
    }

    try {
      await signalRRemoteAccess.invoke('LeaveSession', sessionId);
      currentSessionRef.current = null;
      console.log('[RemoteAccessSignaling] Left session successfully');
    } catch (error) {
      console.error('[RemoteAccessSignaling] Failed to leave session:', error);
    }
  }, []);

  // Send SDP offer
  const sendSdpOffer = useCallback(async (sessionId: string, sdp: { sdp: string; type: string }) => {
    console.log('[RemoteAccessSignaling] Sending SDP offer');

    if (!signalRRemoteAccess.isConnected()) {
      throw new Error('Not connected to SignalR');
    }

    await signalRRemoteAccess.invoke('SendSdpOffer', sessionId, sdp);
    console.log('[RemoteAccessSignaling] SDP offer sent');
  }, []);

  // Send SDP answer
  const sendSdpAnswer = useCallback(async (sessionId: string, sdp: { sdp: string; type: string }) => {
    console.log('[RemoteAccessSignaling] Sending SDP answer');

    if (!signalRRemoteAccess.isConnected()) {
      throw new Error('Not connected to SignalR');
    }

    await signalRRemoteAccess.invoke('SendSdpAnswer', sessionId, sdp);
    console.log('[RemoteAccessSignaling] SDP answer sent');
  }, []);

  // Send ICE candidate
  const sendIceCandidate = useCallback(async (sessionId: string, candidate: { candidate: string; sdpMLineIndex: number | null; sdpMid: string | null }) => {
    if (!signalRRemoteAccess.isConnected()) {
      console.warn('[RemoteAccessSignaling] Not connected, cannot send ICE candidate');
      return;
    }

    await signalRRemoteAccess.invoke('SendIceCandidate', sessionId, candidate);
  }, []);

  // Enable control
  const enableControl = useCallback(async (sessionId: string) => {
    console.log('[RemoteAccessSignaling] Enabling control');

    if (!signalRRemoteAccess.isConnected()) {
      throw new Error('Not connected to SignalR');
    }

    await signalRRemoteAccess.invoke('EnableControl', sessionId);
    console.log('[RemoteAccessSignaling] Control enabled');
  }, []);

  // Disable control
  const disableControl = useCallback(async (sessionId: string) => {
    console.log('[RemoteAccessSignaling] Disabling control');

    if (!signalRRemoteAccess.isConnected()) {
      throw new Error('Not connected to SignalR');
    }

    await signalRRemoteAccess.invoke('DisableControl', sessionId);
    console.log('[RemoteAccessSignaling] Control disabled');
  }, []);

  return {
    signalingState,
    joinSession,
    leaveSession,
    sendSdpOffer,
    sendSdpAnswer,
    sendIceCandidate,
    enableControl,
    disableControl,
    isConnected: signalingState === 'connected',
  };
}
