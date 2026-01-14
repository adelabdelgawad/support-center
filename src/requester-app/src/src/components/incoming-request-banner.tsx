/**
 * Incoming Request Banner
 *
 * Displays a banner at the top of the app when an incoming remote session
 * request is received. Shows a countdown timer with Accept/Reject buttons.
 *
 * TIMEOUT BEHAVIOR: Timeout (10s) results in ACCEPT, not reject.
 * Only explicit Reject click triggers termination.
 *
 * This component runs in the main window, so it has full Tauri permissions.
 */

import { Show, onMount, onCleanup, createSignal } from 'solid-js';
import { remoteAccessStore } from '@/stores/remote-access-store';

/**
 * Incoming Request Banner Component
 *
 * Shows incoming remote session requests at the top of the application window.
 * User can Accept (start session) or Reject (terminate) the request.
 * Auto-accepts after 10 seconds if no action taken.
 */
export function IncomingRequestBanner() {
  const [countdown, setCountdown] = createSignal(10);
  const [isClosing, setIsClosing] = createSignal(false);

  let intervalId: ReturnType<typeof setInterval> | undefined;

  // Function to handle accept - defined before use in interval
  const handleAccept = async () => {
    if (isClosing()) return;

    console.log("[IncomingRequestBanner] User clicked Accept or timeout");
    setIsClosing(true);

    // Clear countdown interval
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = undefined;
    }

    await remoteAccessStore.acceptPendingSession();
  };

  const handleReject = async () => {
    if (isClosing()) return;

    console.log("[IncomingRequestBanner] User clicked Reject");
    setIsClosing(true);

    // Clear countdown interval
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = undefined;
    }

    await remoteAccessStore.rejectPendingSession("user");
  };

  onMount(() => {
    console.log("[IncomingRequestBanner] Component mounted, setting up countdown");

    const pending = remoteAccessStore.state.pendingSession;
    if (!pending) {
      console.log("[IncomingRequestBanner] No pending session, skipping countdown");
      return;
    }

    console.log("[IncomingRequestBanner] Pending session found, starting countdown");

    // Reset countdown to 10
    setCountdown(10);
    console.log("[IncomingRequestBanner] Countdown started at:", countdown());

    // Simple decrementing timer - updates every second
    intervalId = setInterval(() => {
      setCountdown(prev => {
        const newValue = Math.max(0, prev - 1);
        console.log(`[IncomingRequestBanner] Countdown: ${prev} -> ${newValue}`);

        // Auto-ACCEPT when countdown reaches 0 (timeout = accept)
        if (newValue === 0) {
          console.log("[IncomingRequestBanner] Countdown reached 0, auto-accepting");
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = undefined;
          }
          // Delay accept slightly to ensure state update propagates
          setTimeout(() => handleAccept(), 50);
        }

        return newValue;
      });
    }, 1000);
  });

  onCleanup(() => {
    console.log("[IncomingRequestBanner] Component unmounting, cleaning up interval");
    // Clear countdown interval
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = undefined;
    }
  });

  return (
    <Show when={remoteAccessStore.state.pendingSession && !isClosing()}>
      {(pending) => (
        <>
          <div style={{
            position: 'fixed',
            top: '0',
            left: '0',
            right: '0',
            'z-index': 9999,
            'pointer-events': 'none'
          }}>
            <div
              style={{
                position: 'relative',
                width: '100%',
                background: 'white',
                'border-radius': '0 0 12px 12px',
                padding: '12px 24px',
                'box-shadow': '0 4px 16px rgba(0, 0, 0, 0.12), 0 1px 4px rgba(0, 0, 0, 0.08)',
                'pointer-events': 'auto',
                'max-width': '100%',
                'box-sizing': 'border-box'
              }}
            >
              {/* Badge - Top Left */}
              <div style={{
                display: 'inline-flex',
                'align-items': 'center',
                gap: '4px',
                background: '#fef3c7',
                padding: '2px 8px',
                'border-radius': '8px',
                'font-size': '9px',
                'font-weight': 600,
                color: '#b45309',
                'text-transform': 'uppercase',
                'letter-spacing': '0.3px',
                'margin-bottom': '6px'
              }}>
                <span
                  style={{
                    width: '5px',
                    height: '5px',
                    background: '#f59e0b',
                    'border-radius': '50%',
                    animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                    display: 'inline-block'
                  }}
                />
                Incoming Request
              </div>

              {/* Icon + Text Row - Horizontal */}
              <div style={{
                display: 'flex',
                'align-items': 'center',
                gap: '12px'
              }}>
                {/* Icon Container */}
                <div style={{
                  width: '36px',
                  height: '36px',
                  background: '#eff6ff',
                  border: '1px solid #dbeafe',
                  'border-radius': '10px',
                  display: 'flex',
                  'align-items': 'center',
                  'justify-content': 'center',
                  'flex-shrink': 0
                }}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    style={{ width: '17px', height: '17px', color: '#3b82f6' }}
                  >
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                    <line x1="8" y1="21" x2="16" y2="21"></line>
                    <line x1="12" y1="17" x2="12" y2="21"></line>
                  </svg>
                </div>

                {/* Text Content */}
                <div style={{
                  display: 'flex',
                  'flex-direction': 'column',
                  gap: '1px',
                  flex: 1,
                  'min-width': 0
                }}>
                  {/* Title */}
                  <div style={{
                    'font-size': '13px',
                    'font-weight': 600,
                    color: '#1e293b',
                    'white-space': 'nowrap',
                    overflow: 'hidden',
                    'text-overflow': 'ellipsis'
                  }}>
                    {pending().requestTitle || 'Remote Support Session'}
                  </div>
                  {/* Subtitle */}
                  <div style={{
                    'font-size': '12px',
                    color: '#64748b'
                  }}>
                    From:{' '}
                    <span style={{
                      color: '#334155',
                      'font-weight': 500
                    }}>
                      {pending().agentName}
                    </span>
                  </div>
                </div>

                {/* Buttons - Side by Side */}
                <div style={{
                  display: 'flex',
                  gap: '8px',
                  'flex-shrink': 0
                }}>
                  <button
                    onClick={handleAccept}
                    style={{
                      background: '#22c55e',
                      color: 'white',
                      border: 'none',
                      padding: '7px 16px',
                      'border-radius': '8px',
                      'font-size': '12px',
                      'font-weight': 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#16a34a';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#22c55e';
                    }}
                  >
                    Accept
                  </button>
                  <button
                    onClick={handleReject}
                    style={{
                      background: '#ef4444',
                      color: 'white',
                      border: 'none',
                      padding: '7px 16px',
                      'border-radius': '8px',
                      'font-size': '12px',
                      'font-weight': 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#dc2626';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#ef4444';
                    }}
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>

            {/* Pulse animation keyframes */}
            <style>{`
              @keyframes pulse {
                0%, 100% {
                  opacity: 1;
                  transform: scale(1);
                }
                50% {
                  opacity: 0.7;
                  transform: scale(1.1);
                }
              }
            `}</style>
          </div>
          {/* Spacer to push content down when banner is visible */}
          <div style={{
            height: '72px',
            'pointer-events': 'none'
          }} />
        </>
      )}
    </Show>
  );
}

export default IncomingRequestBanner;
