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
        'z-index': 9998,
        'pointer-events': 'none'
      }}>
        <For each={remoteAccessStore.state.bannerSessions}>
          {(session, index) => (
            <div
              style={{
                position: 'relative',
                background: 'linear-gradient(90deg, rgba(220, 38, 38, 0.95) 0%, rgba(185, 28, 28, 0.95) 100%)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                display: 'flex',
                'align-items': 'center',
                'justify-content': 'space-between',
                padding: '16px 28px',
                'box-shadow': '0 8px 32px rgba(220, 38, 38, 0.25), 0 1px 3px rgba(0, 0, 0, 0.1)',
                'pointer-events': 'auto',
                'border-bottom': '1px solid rgba(255, 255, 255, 0.15)'
              }}
            >
              <div style={{
                display: 'flex',
                'align-items': 'center',
                gap: '16px',
                color: 'white',
                flex: 1
              }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  background: 'rgba(255, 255, 255, 0.2)',
                  'border-radius': '12px',
                  display: 'flex',
                  'align-items': 'center',
                  'justify-content': 'center',
                  'flex-shrink': 0,
                  'box-shadow': '0 2px 8px rgba(0, 0, 0, 0.1)'
                }}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    style={{ width: '20px', height: '20px' }}
                  >
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                    <line x1="8" y1="21" x2="16" y2="21"></line>
                    <line x1="12" y1="17" x2="12" y2="21"></line>
                  </svg>
                </div>
                <div style={{
                  display: 'flex',
                  'flex-direction': 'column',
                  gap: '2px'
                }}>
                  <div style={{
                    'font-size': '13px',
                    'font-weight': 600,
                    'letter-spacing': '0.3px',
                    'text-transform': 'uppercase',
                    opacity: 0.95
                  }}>
                    Remote Access Session Active
                  </div>
                  <div style={{
                    'font-size': '13px',
                    'font-weight': 500,
                    opacity: 1
                  }}>
                    Accessed by: <strong>{session.agentName}</strong>
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleTerminate(session.sessionId)}
                style={{
                  background: 'white',
                  color: '#dc2626',
                  border: 'none',
                  padding: '11px 24px',
                  'border-radius': '10px',
                  'font-size': '13px',
                  'font-weight': 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  'text-transform': 'uppercase',
                  'letter-spacing': '0.3px',
                  'box-shadow': '0 2px 8px rgba(0, 0, 0, 0.1)',
                  'flex-shrink': 0
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#fef2f2';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'white';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
                }}
              >
                End Session
              </button>
            </div>
          )}
        </For>
      </div>
      {/* Spacer to push content down when banner is visible */}
      {/* Stacking: Add 72px for incoming banner if pending */}
      <div style={{
        height: `${remoteAccessStore.state.bannerSessions.length * 64}px`,
        'pointer-events': 'none'
      }} />
      {/* Additional spacer for incoming banner (shown above this one) */}
      <Show when={remoteAccessStore.state.pendingSession}>
        <div style={{
          height: '72px',
          'pointer-events': 'none'
        }} />
      </Show>
    </Show>
  );
}

export default RemoteSessionBanner;
