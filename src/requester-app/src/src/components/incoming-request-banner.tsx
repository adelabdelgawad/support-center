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
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                display: 'flex',
                'align-items': 'center',
                'justify-content': 'space-between',
                padding: '14px 24px',
                'box-shadow': '0 4px 20px rgba(0, 0, 0, 0.3)',
                'pointer-events': 'auto',
                'border-bottom': '2px solid rgba(255, 255, 255, 0.3)'
              }}
            >
              <div style={{
                display: 'flex',
                'align-items': 'center',
                gap: '14px',
                color: 'white',
                flex: 1
              }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  background: 'rgba(255, 255, 255, 0.25)',
                  'border-radius': '50%',
                  display: 'flex',
                  'align-items': 'center',
                  'justify-content': 'center',
                  'flex-shrink': 0,
                  'font-size': '16px',
                  'font-weight': 700
                }}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    style={{ width: '14px', height: '14px' }}
                  >
                    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <div style={{
                  display: 'flex',
                  'flex-direction': 'column',
                  gap: '3px'
                }}>
                  <div style={{
                    'font-size': '14px',
                    'font-weight': 700,
                    'letter-spacing': '0.5px',
                    'text-transform': 'uppercase'
                  }}>
                    INCOMING REMOTE SUPPORT REQUEST
                  </div>
                  <div style={{
                    'font-size': '12px',
                    opacity: 0.95
                  }}>
                    From: {pending().agentName}
                  </div>
                </div>
              </div>
              <div style={{
                display: 'flex',
                gap: '10px',
                'flex-shrink': 0
              }}>
                <button
                  onClick={handleAccept}
                  style={{
                    background: 'white',
                    color: '#16a34a',
                    border: 'none',
                    padding: '10px 20px',
                    'border-radius': '6px',
                    'font-size': '13px',
                    'font-weight': 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    'text-transform': 'uppercase',
                    'letter-spacing': '0.5px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#f0fdf4';
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'white';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  Accept
                </button>
                <button
                  onClick={handleReject}
                  style={{
                    background: 'rgba(255, 255, 255, 0.2)',
                    color: 'white',
                    border: '2px solid white',
                    padding: '10px 20px',
                    'border-radius': '6px',
                    'font-size': '13px',
                    'font-weight': 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    'text-transform': 'uppercase',
                    'letter-spacing': '0.5px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
          {/* Spacer to push content down when banner is visible */}
          <div style={{
            height: '64px',
            'pointer-events': 'none'
          }} />
        </>
      )}
    </Show>
  );
}

export default IncomingRequestBanner;
