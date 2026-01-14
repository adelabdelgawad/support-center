/**
 * Remote Session Banner
 *
 * Displays a banner at the top of the app when a remote session is active.
 * Shows the agent name and provides a button to terminate the session.
 *
 * This component runs in the main window, so it has full Tauri permissions.
 */

import { Show, For } from 'solid-js';
import { remoteAccessStore } from '@/stores/remote-access-store';

/**
 * Remote Session Banner Component
 *
 * Shows active remote sessions at the top of the application window.
 */
export function RemoteSessionBanner() {
  const handleTerminate = async (sessionId: string) => {
    await remoteAccessStore.handleTerminationRequest(sessionId);
  };

  return (
    <Show when={remoteAccessStore.state.bannerSessions.length > 0}>
      <div style={{
        position: 'fixed',
        top: '0',
        left: '0',
        right: '0',
        'z-index': 9999,
        'pointer-events': 'none'
      }}>
        <For each={remoteAccessStore.state.bannerSessions}>
          {(session, index) => (
            <div
              style={{
                position: 'relative',
                'background': 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                display: 'flex',
                'align-items': 'center',
                'justify-content': 'space-between',
                padding: '12px 24px',
                'box-shadow': '0 4px 20px rgba(0, 0, 0, 0.3)',
                'pointer-events': 'auto',
                'border-bottom': '2px solid rgba(255, 255, 255, 0.2)'
              }}
            >
              <div style={{
                display: 'flex',
                'align-items': 'center',
                gap: '12px',
                color: 'white',
                flex: 1
              }}>
                <div style={{
                  width: '24px',
                  height: '24px',
                  background: 'rgba(255, 255, 255, 0.2)',
                  'border-radius': '50%',
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
                    stroke-width="2.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    style={{ width: '14px', height: '14px' }}
                  >
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                </div>
                <div style={{
                  display: 'flex',
                  'flex-direction': 'column',
                  gap: '2px'
                }}>
                  <div style={{
                    'font-size': '13px',
                    'font-weight': 700,
                    'letter-spacing': '0.5px',
                    'text-transform': 'uppercase'
                  }}>
                    A REMOTE ACCESS SESSION IS RUNNING
                  </div>
                  <div style={{
                    'font-size': '11px',
                    opacity: 0.95
                  }}>
                    Accessed by: {session.agentName}
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleTerminate(session.sessionId)}
                style={{
                  background: 'white',
                  color: '#dc2626',
                  border: 'none',
                  padding: '8px 16px',
                  'border-radius': '6px',
                  'font-size': '12px',
                  'font-weight': 600,
                  cursor: 'pointer',
                  'transition': 'all 0.2s ease',
                  'text-transform': 'uppercase',
                  'letter-spacing': '0.5px',
                  'flex-shrink': 0
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f8f8f8';
                  e.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'white';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                Terminate Session
              </button>
            </div>
          )}
        </For>
      </div>
      {/* Spacer to push content down when banner is visible */}
      <div style={{
        height: `${remoteAccessStore.state.bannerSessions.length * 56}px`,
        'pointer-events': 'none'
      }} />
    </Show>
  );
}

export default RemoteSessionBanner;
