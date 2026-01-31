'use client';

/**
 * Remote Access Context
 * Manages remote access session state for inline viewing
 *
 * Features:
 * - Session lifecycle management (start, end, cleanup)
 * - View mode switching (chat ↔ remote)
 * - Remote interaction mode (view ↔ control)
 * - WebRTC connection state
 * - Cleanup on page exit
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  startTransition,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';

/**
 * Session status for remote access.
 */
type SessionStatus =
  | 'idle'           // No active session
  | 'requesting'     // Requesting new session
  | 'active'         // Session is active
  | 'ending'         // Session is ending
  | 'error';         // Error occurred

/**
 * Connection state for WebRTC
 */
type ConnectionState =
  | 'connecting'
  | 'reconnecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed'
  | 'session_ended';

/**
 * Active view mode (chat vs remote display)
 */
type ViewMode = 'chat' | 'remote';

/**
 * Remote interaction mode
 * - view: Watch only, no input forwarded
 * - control: Full input forwarding (mouse, keyboard)
 */
export type RemoteMode = 'view' | 'control';

interface RemoteAccessContextType {
  // Session state
  sessionId: string | null;
  sessionStatus: SessionStatus;
  connectionState: ConnectionState;
  errorMessage: string | null;

  // View mode (chat vs remote panel)
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  // Remote interaction mode (view vs control)
  remoteMode: RemoteMode;
  setRemoteMode: (mode: RemoteMode) => void;

  // Legacy alias for backwards compatibility
  controlEnabled: boolean;
  setControlEnabled: (enabled: boolean) => void;

  // Actions
  startSession: (requestId: string) => Promise<void>;
  endSession: (reason?: string) => Promise<void>;
  clearError: () => void;

  // Session info
  sessionDuration: number;
  videoResolution: { width: number; height: number } | null;
  setVideoResolution: (resolution: { width: number; height: number } | null) => void;

  // WebSocket/WebRTC refs for cleanup
  registerCleanup: (cleanup: () => void) => void;

  // Connection state setter (used by inline client)
  setConnectionState: (state: ConnectionState) => void;
}

const RemoteAccessContext = createContext<RemoteAccessContextType | undefined>(undefined);

interface RemoteAccessProviderProps {
  children: ReactNode;
  requestId: string;
}

export function RemoteAccessProvider({ children, requestId }: RemoteAccessProviderProps) {
  // Session state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('idle');
  const [connectionState, setConnectionStateInternal] = useState<ConnectionState>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Wrapper for setConnectionState with debugging
  const setConnectionState = (state: ConnectionState) => {
    console.log('[RemoteAccessContext] 🔄 connectionState changing', {
      from: connectionState,
      to: state,
      sessionId,
      sessionStatus,
      timestamp: new Date().toISOString(),
    });
    setConnectionStateInternal(state);
  };

  // View mode (chat vs remote panel)
  const [viewMode, setViewMode] = useState<ViewMode>('chat');

  // Remote interaction mode (view vs control) - default is 'view'
  const [remoteMode, setRemoteMode] = useState<RemoteMode>('view');

  // Session info
  const [sessionDuration, setSessionDuration] = useState(0);
  const [videoResolution, setVideoResolution] = useState<{ width: number; height: number } | null>(null);

  // Derived state: controlEnabled for backwards compatibility
  const controlEnabled = remoteMode === 'control';

  // Refs
  const sessionStartTimeRef = useRef<number>(Date.now());
  const cleanupFnRef = useRef<(() => void) | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Session duration timer
  useEffect(() => {
    if (connectionState === 'connected' && sessionStatus === 'active') {
      sessionStartTimeRef.current = Date.now();

      durationIntervalRef.current = setInterval(() => {
        const duration = Math.floor((Date.now() - sessionStartTimeRef.current) / 1000);
        startTransition(() => {
          setSessionDuration(duration);
        });
      }, 1000);
    } else {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    }

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, [connectionState, sessionStatus]);

  // Register cleanup function from inline client
  const registerCleanup = useCallback((cleanup: () => void) => {
    cleanupFnRef.current = cleanup;
  }, []);

  // Start a new remote access session
  const startSession = useCallback(async (reqId: string) => {
    if (sessionStatus === 'requesting' || sessionStatus === 'active') {
      console.log('[RemoteAccessContext] ⚠️ Session already active or requesting', {
        sessionStatus,
        sessionId,
      });
      return;
    }

    const startTime = performance.now();
    console.log('[RemoteAccessContext] 🚀 Starting remote access session', {
      requestId: reqId,
      timestamp: new Date().toISOString(),
    });
    setSessionStatus('requesting');
    setErrorMessage(null);

    try {
      console.log('[RemoteAccessContext] 📡 Calling /api/remote-access/request...');
      const response = await fetch('/api/remote-access/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ requestId: reqId }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let error;
        try {
          error = JSON.parse(errorText);
        } catch {
          error = { error: errorText };
        }
        throw new Error(error.error || error.detail || 'Failed to request remote access');
      }

      const session = await response.json();
      console.log('[RemoteAccessContext] ✅ Session created', {
        sessionId: session.id,
        elapsed: Math.round(performance.now() - startTime) + 'ms',
        timestamp: new Date().toISOString(),
      });

      setSessionId(session.id);
      setSessionStatus('active');
      setConnectionState('connecting');
      setViewMode('remote'); // Auto-switch to remote view
      setSessionDuration(0);
      sessionStartTimeRef.current = Date.now();

      toast.success('Remote access starting!', {
        description: 'Connecting to remote session...',
      });
    } catch (error: any) {
      console.error('[RemoteAccessContext] ❌ Error starting session:', {
        error: error.message,
        elapsed: Math.round(performance.now() - startTime) + 'ms',
        timestamp: new Date().toISOString(),
      });
      const message = error.message || 'Failed to request remote access';
      setErrorMessage(message);
      setSessionStatus('error');

      // Show warning for offline users, error for other issues
      if (message.includes('not online')) {
        toast.warning('Requester is offline', {
          description: 'The requester must be online to start remote access.',
        });
      } else {
        toast.error(message);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setConnectionState is a stable wrapper function
  }, [sessionStatus, sessionId]);

  // End the remote access session (ephemeral - cleanup only, no API call)
  const endSession = useCallback(async (reason: string = 'agent_ended') => {
    if (!sessionId) {
      console.log('[RemoteAccessContext] ⚠️ No active session to end');
      return;
    }

    console.log('[RemoteAccessContext] 🛑 Ending session', {
      sessionId,
      reason,
      connectionState,
      sessionStatus,
      timestamp: new Date().toISOString(),
    });
    setSessionStatus('ending');

    try {
      // End session in backend database (triggers RemoteSessionEnded event)
      console.log('[RemoteAccessContext] 📡 Calling backend to end session...');
      await fetch(`/api/remote-access/${sessionId}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason }),
      }).catch(err => console.error('[RemoteAccessContext] Failed to end session in backend:', err));

      // Run cleanup - this will close WebSocket and peer connection
      if (cleanupFnRef.current) {
        console.log('[RemoteAccessContext] 🧹 Running cleanup function...');
        cleanupFnRef.current();
        cleanupFnRef.current = null;
      }

      console.log('[RemoteAccessContext] ✅ Session cleanup complete');
    } catch (error) {
      console.error('[RemoteAccessContext] ❌ Error during cleanup:', error);
    } finally {
      // Reset state
      console.log('[RemoteAccessContext] 🔄 Resetting state to idle');
      setSessionId(null);
      setSessionStatus('idle');
      setConnectionStateInternal('connecting'); // Use internal to avoid logging noise
      setRemoteMode('view'); // Reset to view mode
      setViewMode('chat'); // Switch back to chat
      setSessionDuration(0);
      setVideoResolution(null);
      setErrorMessage(null);
    }
  }, [sessionId, connectionState, sessionStatus]);

  // Wrapper for setting control state via legacy API
  const setControlEnabled = useCallback((enabled: boolean) => {
    setRemoteMode(enabled ? 'control' : 'view');
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setErrorMessage(null);
    setSessionStatus('idle');
  }, []);

  // Cleanup on unmount (ephemeral - cleanup only, no API call)
  useEffect(() => {
    return () => {
      if (cleanupFnRef.current) {
        cleanupFnRef.current();
      }
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      // Note: Ephemeral sessions - cleanup closes WebSocket, ending session automatically
      // No API call needed
      if (sessionId) {
        console.log('[RemoteAccess] Page unmounting - session cleanup (ephemeral, no API call)');
      }
    };
  }, [sessionId]);

  // Handle view mode changes
  const handleSetViewMode = useCallback((mode: ViewMode) => {
    // If switching to chat while remote is active, session stays alive
    // If switching to remote while no session, stay on chat
    if (mode === 'remote' && sessionStatus !== 'active') {
      return;
    }
    setViewMode(mode);
  }, [sessionStatus]);

  const value: RemoteAccessContextType = {
    sessionId,
    sessionStatus,
    connectionState,
    errorMessage,
    viewMode,
    setViewMode: handleSetViewMode,
    remoteMode,
    setRemoteMode,
    controlEnabled,
    setControlEnabled,
    startSession,
    endSession,
    clearError,
    sessionDuration,
    videoResolution,
    setVideoResolution,
    registerCleanup,
    setConnectionState,
  };

  return (
    <RemoteAccessContext.Provider value={value}>
      {children}
    </RemoteAccessContext.Provider>
  );
}

export function useRemoteAccess() {
  const context = useContext(RemoteAccessContext);
  if (context === undefined) {
    throw new Error('useRemoteAccess must be used within a RemoteAccessProvider');
  }
  return context;
}
