# Data Model: Remote Session Termination Panel

**Feature**: 005-remote-session-panel
**Date**: 2025-01-14
**Status**: Complete

## Overview

This document defines the data structures, state management, and entity relationships for the remote session termination panel feature.

## State Management

### Remote Access State Extension

**Current State** (in `remote-access-store.ts`):
```typescript
interface RemoteAccessState {
  isProcessing: boolean;
  error: string | null;
  activeSession: {
    sessionId: string;
    connectionState: RTCPeerConnectionState;
  } | null;
  controlEnabled: boolean;
  isPickerOpen: boolean;
  pendingSessionId: string | null;
  resolutionProfile: ResolutionProfile;
  bannerSessions: BannerSession[];
}
```

**Extended State** (new field):
```typescript
interface RemoteAccessState {
  // ... existing fields ...

  /** Termination panel visibility state */
  terminationPanelVisible: boolean;
}
```

### State Transitions

```
┌─────────────────────────────────────────────────────────────┐
│                    State Transitions                        │
└─────────────────────────────────────────────────────────────┘

Session Start (RemoteSessionAutoStart)
    ↓
bannerSessions.add(newSession)
    ↓
terminationPanelVisible = true
    ↓
Panel shows with session info

User Clicks Terminate
    ↓
Terminate WebRTC session
    ↓
Notify agent via SignalR
    ↓
bannerSessions.remove(sessionId)
    ↓
terminationPanelVisible = false (if no more sessions)
    ↓
Panel hides

Agent Ends Session
    ↓
handleRemoteSessionEnded()
    ↓
bannerSessions.remove(sessionId)
    ↓
terminationPanelVisible = false (if no more sessions)
    ↓
Panel hides
```

## Entities

### BannerSession (Existing)

**Location**: `src/stores/remote-access-store.ts`

```typescript
interface BannerSession {
  sessionId: string;
  agentName: string;
  startedAt: string;  // ISO 8601 timestamp
}
```

**Purpose**: Tracks active remote sessions for banner display

**Lifecycle**:
- Created: When `RemoteSessionAutoStart` event received
- Removed: When session ends (user or agent terminated)

### TerminationPanelState (New)

**Location**: `src/stores/remote-access-store.ts` (internal state)

```typescript
interface TerminationPanelState {
  /** Whether panel is currently visible */
  isVisible: boolean;

  /** Active session ID (null if no session) */
  sessionId: string | null;

  /** Agent name for display */
  agentName: string | null;

  /** Session start timestamp */
  startedAt: string | null;
}
```

**Purpose**: Internal state for termination panel management

**Computed from**: `bannerSessions` array

**Default State**:
```typescript
{
  isVisible: false,
  sessionId: null,
  agentName: null,
  startedAt: null
}
```

## Event Payloads

### Termination Panel Events

#### Event: `termination-panel-show`

**Direction**: Store → Termination Panel Window

**Payload**:
```typescript
interface TerminationPanelShowPayload {
  sessionId: string;
  agentName: string;
  startedAt: string;
}
```

**Purpose**: Display panel with session information

**Example**:
```json
{
  "sessionId": "abc-123-def",
  "agentName": "John Smith (IT Support)",
  "startedAt": "2025-01-14T10:30:00Z"
}
```

#### Event: `termination-panel-hide`

**Direction**: Store → Termination Panel Window

**Payload**:
```typescript
interface TerminationPanelHidePayload {
  reason: 'session-ended' | 'user-terminated' | 'agent-terminated';
}
```

**Purpose**: Hide panel and optionally display reason

**Example**:
```json
{
  "reason": "user-terminated"
}
```

#### Event: `termination-request`

**Direction**: Termination Panel Window → Store

**Payload**:
```typescript
interface TerminationRequestPayload {
  sessionId: string;
  timestamp: string;
}
```

**Purpose**: User clicked terminate button

**Example**:
```json
{
  "sessionId": "abc-123-def",
  "timestamp": "2025-01-14T10:35:00Z"
}
```

### SignalR Events

#### Event: `UserTerminatedSession`

**Direction**: Client → Server → Agent

**Payload**:
```typescript
interface UserTerminatedSessionPayload {
  sessionId: string;
  userId: string;
  username: string;
  terminatedAt: string;
}
```

**Purpose**: Notify agent that user terminated the session

**Server-Side Handling** (Backend):
```python
# Agent receives via SignalR
await hub.clients.user(agent_id).send_async(
    "UserTerminatedSession",
    {
        "session_id": session_id,
        "user_id": user_id,
        "username": username,
        "terminated_at": datetime.now().isoformat()
    }
)
```

## Tauri Command Parameters

### Command: `show_termination_panel`

**Parameters**:
```rust
struct ShowTerminationPanelParams {
    session_id: String,
    agent_name: String,
}
```

**Return**: `Result<(), String>`

**Error Cases**:
- Panel window not found
- Panel already visible
- Failed to position window

### Command: `hide_termination_panel`

**Parameters**: None

**Return**: `Result<(), String>`

**Error Cases**:
- Panel window not found
- Failed to hide window

### Command: `position_termination_panel`

**Parameters**: None

**Return**: `Result<(), String>`

**Error Cases**:
- Failed to get monitor dimensions
- Failed to set window position

## UI State Mapping

### Panel Visibility Logic

```typescript
function shouldShowPanel(state: RemoteAccessState): boolean {
  return state.bannerSessions.length > 0;
}

function getActiveSession(state: RemoteAccessState): BannerSession | null {
  return state.bannerSessions.length > 0
    ? state.bannerSessions[0]  // First session (assuming single session)
    : null;
}
```

### Panel Content Mapping

```typescript
function getPanelContent(session: BannerSession): PanelContent {
  return {
    title: "A REMOTE ACCESS SESSION IS RUNNING",
    agentLabel: `Accessed by: ${session.agentName}`,
    buttonText: "Terminate Session",
    warningColor: "#dc2626"  // Red
  };
}
```

## Data Flow

### Session Start Flow

```
1. SignalR Event: RemoteSessionAutoStart
   ↓
2. remoteAccessStore.handleRemoteSessionAutoStart(data)
   ↓
3. Create BannerSession {
     sessionId: data.sessionId,
     agentName: data.agentName,
     startedAt: new Date().toISOString()
   }
   ↓
4. setState({ bannerSessions: [...existing, newSession] })
   ↓
5. if (bannerSessions.length > 0) {
     await invoke('show_termination_panel', {
       session_id: newSession.sessionId,
       agent_name: newSession.agentName
     });
   }
   ↓
6. Termination Panel Window receives event
   ↓
7. Panel displays with session info
```

### Termination Flow

```
1. User clicks "Terminate Session" button
   ↓
2. Termination Panel emits 'termination-request' event
   ↓
3. remoteAccessStore.handleTerminationRequest(sessionId)
   ↓
4. Stop WebRTC session:
   await webrtcHost.stop();
   ↓
5. Notify agent via SignalR:
   await signalrManager.invoke('UserTerminatedSession', {
     sessionId,
     userId,
     username,
     terminatedAt: new Date().toISOString()
   });
   ↓
6. Remove from bannerSessions:
   setState({
     bannerSessions: bannerSessions.filter(s => s.sessionId !== sessionId)
   });
   ↓
7. if (bannerSessions.length === 0) {
     await invoke('hide_termination_panel');
   }
   ↓
8. Panel hides
```

### Session End Flow (Agent Terminated)

```
1. SignalR Event: RemoteSessionEnded
   ↓
2. remoteAccessStore.handleRemoteSessionEnded(sessionId)
   ↓
3. Remove from bannerSessions:
   const updatedSessions = bannerSessions.filter(s => s.sessionId !== sessionId);
   setState({ bannerSessions: updatedSessions });
   ↓
4. if (updatedSessions.length === 0) {
     await invoke('hide_termination_panel');
   }
   ↓
5. Panel hides
```

## Validation Rules

### BannerSession Validation

```typescript
function validateBannerSession(session: BannerSession): ValidationResult {
  const errors: string[] = [];

  // Session ID required
  if (!session.sessionId || session.sessionId.trim() === '') {
    errors.push('sessionId is required');
  }

  // Agent name required
  if (!session.agentName || session.agentName.trim() === '') {
    errors.push('agentName is required');
  }

  // Agent name max length
  if (session.agentName.length > 100) {
    errors.push('agentName must be <= 100 characters');
  }

  // Timestamp format validation
  if (!isValidISO8601(session.startedAt)) {
    errors.push('startedAt must be valid ISO 8601 timestamp');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
```

### Panel State Validation

```typescript
function validatePanelState(state: TerminationPanelState): ValidationResult {
  const errors: string[] = [];

  // If visible, must have session data
  if (state.isVisible) {
    if (!state.sessionId) {
      errors.push('sessionId required when panel is visible');
    }
    if (!state.agentName) {
      errors.push('agentName required when panel is visible');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}
```

## Error States

### Panel Show Failures

| Error | Recovery | User Impact |
|-------|----------|-------------|
| Window not found | Log error, retry once | Panel doesn't appear |
| Positioning failed | Use default position | Panel may be mispositioned |
| Event emission failed | Log error, update state directly | Panel may not receive session info |

### Termination Failures

| Error | Recovery | User Impact |
|-------|----------|-------------|
| WebRTC stop failed | Force close peer connection | Session may linger |
| SignalR notification failed | Retry once, log error | Agent not notified |
| Panel hide failed | Force hide after timeout | Panel stays visible |

## Persistence

**No persistence required** - All state is session-only and resets on application restart.

**Rationale**:
- Termination panel is only relevant during active sessions
- Sessions are ephemeral (no database persistence)
- State rebuilds from SignalR events on reconnect

## Relationships

```
┌─────────────────────────────────────────────────────────────┐
│                    Entity Relationships                     │
└─────────────────────────────────────────────────────────────┘

BannerSession (1) ←────────────────────────────┐
  - sessionId                                 │
  - agentName                                 │
  - startedAt                                 │
                                             │
TerminationPanelState (1) ────────────────────┘
  - isVisible (computed from bannerSessions)
  - sessionId (from BannerSession)
  - agentName (from BannerSession)
  - startedAt (from BannerSession)

WebRTC Session (1)
  - sessionId (matches BannerSession)
  - connectionState
  - controlEnabled
     ↓
  manages (remote screen sharing)
     ↓
  can be terminated by (Termination Panel)
```

## Summary

**Key Data Structures**:
1. `BannerSession` - Tracks active remote sessions
2. `TerminationPanelState` - Internal panel state (computed)
3. Event payloads for panel show/hide/terminate

**State Management Pattern**:
- Single source of truth: `bannerSessions` array
- Panel visibility: Computed from array length
- Panel content: Derived from first session

**Integration Points**:
- Remote access store (state management)
- Tauri commands (window control)
- SignalR events (session lifecycle)
- WebRTC host (session termination)
