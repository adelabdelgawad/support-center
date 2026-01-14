/**
 * Remote Session Banner Component
 *
 * Displays a persistent, non-dismissable top banner when a remote support
 * session is active. Shows the IT agent's username for user awareness.
 *
 * Requirements:
 * - FR-002: Fixed top banner, persistent, non-dismissable
 * - FR-003: Display "Remote support session active"
 * - FR-004: Display IT agent username
 * - FR-005: Remain visible during navigation
 */

import { Component, For, Show } from "solid-js";
import "./remote-session-banner.css";

export interface RemoteSession {
  sessionId: string;
  agentName: string;
  startedAt: string;
}

export interface RemoteSessionBannerProps {
  sessions: RemoteSession[];
}

/**
 * Formats agent names for display
 * - Single agent: "Accessed by: john.doe"
 * - Multiple agents: "Accessed by: john.doe, jane.smith"
 */
function formatAgentNames(sessions: RemoteSession[]): string {
  if (sessions.length === 0) return "";

  const names = sessions.map((s) => s.agentName || "IT Support");
  return names.join(", ");
}

export const RemoteSessionBanner: Component<RemoteSessionBannerProps> = (props) => {
  return (
    <Show when={props.sessions.length > 0}>
      <div class="remote-session-banner" role="status" aria-live="polite">
        <div class="remote-session-banner__content">
          <div class="remote-session-banner__icon">
            {/* Screen share icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </div>
          <div class="remote-session-banner__text">
            <span class="remote-session-banner__title">
              Remote support session active
            </span>
            <span class="remote-session-banner__separator">—</span>
            <span class="remote-session-banner__agent">
              Accessed by: {formatAgentNames(props.sessions)}
            </span>
          </div>
        </div>
      </div>
    </Show>
  );
};

export default RemoteSessionBanner;
