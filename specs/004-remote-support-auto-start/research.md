# Research: Remote Support Auto-Start with User Awareness

**Feature**: 004-remote-support-auto-start
**Date**: 2026-01-14

## Executive Summary

Research confirms the existing remote support system already implements auto-start without user approval. The primary work is adding a visible indicator banner to the requester app and audit logging to the backend.

## Research Findings

### 1. Current Remote Support Flow

**Decision**: No changes needed to session initiation - already auto-starts
**Rationale**: The existing flow in `remote_access_service.py` and `signalr-manager.ts` already:
- Auto-approves sessions (`autoApproved: true`)
- Silently starts screen sharing without user prompts
- Transmits IT agent identity via `agentName` field

**Alternatives Considered**:
- Adding approval dialog (rejected - contradicts feature requirement)
- Modifying backend to require acceptance (rejected - already removed)

### 2. IT Agent Identity Transmission

**Decision**: Use existing `agentName` field from SignalR payload
**Rationale**: The SignalR `RemoteSessionAutoStart` message already includes:
```typescript
{
  sessionId: string;
  agentId: string;
  agentName: string;  // ← Already available
  requestId: string;
  requestTitle: string;
  autoApproved: boolean;
}
```

**Key Files**:
- Backend sends: `src/backend/api/v1/endpoints/remote_access.py:136-147`
- Frontend receives: `src/requester-app/src/src/signalr/signalr-manager.ts:450-490`
- Store handles: `src/requester-app/src/src/stores/remote-access-store.ts:264-335`

**Alternatives Considered**:
- Adding separate API call to fetch agent info (rejected - adds latency, already available)
- Storing agent info in localStorage (rejected - unnecessary, SignalR provides it)

### 3. Banner UI Implementation

**Decision**: SolidJS component at App.tsx root level with fixed positioning
**Rationale**:
- Root-level mounting ensures banner persists across all routes
- Fixed positioning keeps it visible during scroll
- SolidJS reactive store (`remote-access-store.ts`) provides real-time state

**Implementation Pattern**:
```tsx
// App.tsx
<Show when={remoteAccessStore.isSessionActive()}>
  <RemoteSessionBanner
    agentName={remoteAccessStore.currentSession()?.agentName}
  />
</Show>
```

**Alternatives Considered**:
- Portal to document.body (rejected - complicates Tauri window management)
- Global CSS overlay (rejected - harder to bind to reactive state)
- Notification system (rejected - can be dismissed, doesn't persist)

### 4. Session State Persistence

**Decision**: Use existing SolidJS store + SignalR reconnection handling
**Rationale**:
- `remote-access-store.ts` already tracks active sessions
- SignalR reconnection logic re-syncs state on reconnect
- No additional persistence needed (SignalR is source of truth)

**Key Considerations**:
- App restart: SignalR reconnects and receives current session state
- Network disconnect: Banner shows until explicit session end received
- Multiple sessions: Store supports array of sessions, banner shows all

**Alternatives Considered**:
- localStorage persistence (rejected - SignalR handles reconnection)
- Tauri state persistence (rejected - adds complexity, SignalR sufficient)

### 5. Audit Logging

**Decision**: Add structured logging in `remote_access_service.py`
**Rationale**:
- Service layer already has logging infrastructure
- Use existing `logger` from `core/logging_config.py`
- Log format: `{event, session_id, agent_username, requester_id, timestamp}`

**Events to Log**:
- `remote_session_started`: When IT agent initiates session
- `remote_session_ended`: When session terminates (any reason)

**Alternatives Considered**:
- Database audit table (rejected - overkill for this feature, logs sufficient)
- External audit service (rejected - not in scope, logs meet requirement)

## Technical Risks

| Risk | Mitigation |
|------|------------|
| Banner blocks UI interaction | Use pointer-events: none for non-interactive banner |
| SignalR disconnect loses state | Existing reconnection logic re-syncs; banner disappears only on explicit end |
| Multiple IT agents connected | Banner shows all agent names (comma-separated or stacked) |
| Agent name unavailable | Fallback to "IT Support" generic identifier |

## Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| SolidJS | 1.8+ | Reactive UI for banner |
| Tauri | 2.x | Desktop app framework |
| SignalR | Existing | Real-time session events |
| Python logging | stdlib | Audit logging |

## Conclusion

No new technical decisions required beyond UI implementation. The existing architecture fully supports the feature. Implementation focuses on:
1. Creating `RemoteSessionBanner` SolidJS component
2. Mounting at App.tsx root level
3. Adding audit logging to service layer
