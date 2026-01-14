# Research: Remote Session Termination Panel

**Feature**: 005-remote-session-panel
**Date**: 2025-01-14
**Status**: Complete

## Overview

This research document validates the technical approach for implementing a persistent termination panel at the bottom of the screen during active remote support sessions. The research confirms that existing patterns and infrastructure can be leveraged with minimal new code.

## Technical Findings

### 1. Tauri Window Management Patterns

#### Existing Window Infrastructure
The requester-app already uses Tauri's multi-window architecture with two windows:

1. **Main Window** (`label: "main"`):
   - Standard application window
   - Minimizable, resizable
   - Contains the main SolidJS application

2. **Floating Icon** (`label: "floating-icon"`):
   - 48x48px circular draggable icon
   - Always-on-top, skip taskbar
   - Transparent background
   - Position persists across sessions

#### Window Configuration Pattern
```json
{
  "label": "termination-panel",
  "title": "Remote Session Termination Panel",
  "width": 600,
  "height": 80,
  "resizable": false,
  "fullscreen": false,
  "center": false,
  "visible": false,
  "alwaysOnTop": true,
  "decorations": false,
  "skipTaskbar": true,
  "transparent": true,
  "shadow": true,
  "focus": false
}
```

**Key Findings**:
- `visible: false` ensures panel starts hidden
- `alwaysOnTop: true` meets FR-005 requirement
- `skipTaskbar: true` prevents taskbar clutter
- `transparent: true` allows custom styling
- `focus: false` prevents stealing focus when shown

#### Window Positioning
Existing `get_primary_monitor_dims()` function returns:
```rust
let (_mx, _my, screen_width, screen_height) = get_primary_monitor_dims();
```

**Positioning Calculation**:
```rust
let panel_width = 600;
let panel_height = 80;
let x = (screen_width - panel_width) / 2;  // Center horizontally
let y = screen_height - panel_height - 10;  // Bottom with margin
```

**Decision**: Use physical positioning for bottom-of-screen placement with 10px margin.

### 2. Event Emission Patterns (Rust → WebView)

#### Existing Event Patterns
The codebase uses Tauri's event system for window-to-window communication:

**Rust Side (lib.rs)**:
```rust
// Emit event to specific window
window.emit("event-name", payload)?;

// Emit to all windows
app.emit("event-name", payload)?;
```

**WebView Side (JavaScript)**:
```javascript
// Listen for events
window.__TAURI__.event.listen('event-name', (event) => {
    const data = event.payload;
    // Handle event
});
```

#### Current Events in Use
| Event | Source | Purpose |
|-------|--------|---------|
| `remote-session-state` | remote-access-store | Update floating icon indicator |
| `update-unread-count` | notification system | Update message count |
| `new-message-flash` | notification system | Visual flash effect |
| `floating-icon-click` | floating-icon window | Toggle main window |

#### New Events Required
| Event | Direction | Payload | Purpose |
|-------|-----------|---------|---------|
| `termination-panel-show` | Store → Panel | `{sessionId, agentName}` | Display panel with session info |
| `termination-panel-hide` | Store → Panel | `{}` | Hide panel |
| `termination-request` | Panel → Store | `{sessionId}` | User clicked terminate button |

**Decision**: Use existing event emission patterns for bi-directional communication.

### 3. WebRTC Session Termination Flow

#### Existing Termination Logic
Location: `src/lib/remote/webrtc-host.ts`

**Stop Method**:
```typescript
async stop(): Promise<void> {
  if (this.peerConnection) {
    this.peerConnection.close();
    this.peerConnection = null;
  }

  if (this.dataChannel) {
    this.dataChannel.close();
    this.dataChannel = null;
  }

  if (this.webSocket) {
    this.webSocket.close();
    this.webSocket = null;
  }

  // Clear all tracks
  this.localStream?.getTracks().forEach(track => track.stop());
  this.localStream = null;
}
```

**Integration Point**:
```typescript
// In remote-access-store.ts
async function terminateSession(sessionId: string): Promise<void> {
  if (webrtcHost) {
    await webrtcHost.stop();  // Clean shutdown
  }

  // Notify agent via SignalR
  await signalrManager.invoke('UserTerminatedSession', { sessionId });

  // Hide panel
  await hideTerminationPanel();
}
```

**Decision**: Reuse existing `webrtcHost.stop()` for clean session termination.

### 4. SignalR Notification Patterns

#### Existing SignalR Integration
Location: `src/signalr/signalr-manager.ts`

**Current Methods**:
```typescript
// Invoke server method
await signalrManager.invoke('methodName', { payload });

// Listen for server events
signalrManager.on('eventName', (data) => {
  // Handle event
});
```

#### Server-Side Notification
When user terminates session, emit SignalR event to agent:

**Client-side invoke**:
```typescript
await signalrManager.invoke('NotifyAgentOfUserTermination', {
  sessionId,
  terminatedBy: 'user',
  timestamp: new Date().toISOString()
});
```

**Server-side handling** (backend):
```python
# Agent receives notification via SignalR
await hub.clients.user(agent_id).send_async(
    "UserTerminatedSession",
    {"session_id": session_id, "terminated_by": "user"}
)
```

**Decision**: Use existing SignalR infrastructure for agent notifications.

## Code Patterns Reference

### Floating Icon Window (Reference Implementation)

**File**: `src-tauri/icons/floating-icon.html`

**HTML Structure**:
```html
<div class="icon-container" id="iconContainer">
  <div class="notification" id="notification"></div>
  <div class="remote-indicator" id="remoteIndicator"></div>
  <div class="icon-text">IT</div>
</div>
```

**CSS Styling**:
```css
.icon-container {
  width: 60px;
  height: 60px;
  background: #4CAF50;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  cursor: pointer;
}

.remote-indicator {
  position: absolute;
  bottom: 5px;
  right: 5px;
  width: 10px;
  height: 10px;
  background: #dc2626;
  border-radius: 50%;
}
```

**JavaScript Event Handling**:
```javascript
// Listen for remote session state changes
window.__TAURI__.event.listen('remote-session-state', (event) => {
  const data = event.payload;
  remoteIndicator.style.display = data.isActive ? 'block' : 'none';
});
```

### Remote Session Banner (Styling Reference)

**File**: `src/components/remote-session-banner/RemoteSessionBanner.tsx`

**CSS Pattern**:
```css
.remote-session-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 99999;
  background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
  color: white;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}
```

**Adaptation for Termination Panel**:
- Change `top: 0` to `bottom: 0` for bottom positioning
- Use `z-index: 99999` to ensure always-on-top
- Reuse gradient background for consistency
- Add button styling for terminate action

## Integration Points Summary

### 1. Remote Access Store (state management)

**Current State**:
```typescript
interface RemoteAccessState {
  activeSession: { sessionId: string; connectionState } | null;
  bannerSessions: BannerSession[];
}
```

**New State Required**:
```typescript
interface RemoteAccessState {
  // ... existing fields
  terminationPanelVisible: boolean;
}
```

**New Methods Required**:
- `showTerminationPanel(session: BannerSession): Promise<void>`
- `hideTerminationPanel(): Promise<void>`
- `handleTerminationRequest(sessionId: string): Promise<void>`

### 2. Tauri Commands (Rust)

**New Commands Required**:
```rust
#[tauri::command]
fn show_termination_panel(app: AppHandle, session_id: String, agent_name: String) -> Result<(), String>

#[tauri::command]
fn hide_termination_panel(app: AppHandle) -> Result<(), String>

#[tauri::command]
fn position_termination_panel(app: AppHandle) -> Result<(), String>
```

### 3. Session Lifecycle Integration

**Integration Points**:

1. **Session Start** (`handleRemoteSessionAutoStart`):
   ```typescript
   // After adding to bannerSessions
   await showTerminationPanel(newBannerSession);
   ```

2. **Session End** (`handleRemoteSessionEnded`):
   ```typescript
   // After removing from bannerSessions
   if (updatedSessions.length === 0) {
     await hideTerminationPanel();
   }
   ```

3. **User Termination** (new flow):
   ```typescript
   // User clicks terminate button
   await handleTerminationRequest(sessionId);
   ```

## Risk Analysis

### Low Risk Items
✅ Window management: Proven pattern from floating-icon
✅ Event communication: Existing event infrastructure
✅ Session termination: Reuses `webrtcHost.stop()`
✅ Agent notification: Existing SignalR infrastructure

### Medium Risk Items
⚠️ Panel positioning on multi-monitor: Need to test edge cases
⚠️ Panel cleanup on app crash: May need orphan cleanup logic
⚠️ Z-index conflicts: Use 99999 to avoid conflicts

### Mitigation Strategies

| Risk | Mitigation |
|------|------------|
| Panel doesn't show | Log to console, add fallback error display |
| Panel stays visible | Add cleanup on app exit, timeout after session end |
| Positioning wrong | Test on different screen resolutions, use primary monitor |
| Termination fails | Add retry logic, verify WebRTC cleanup, force close if needed |

## Recommended Implementation Order

1. **Phase 1: Core Panel UI**
   - Create `termination-panel.html`
   - Add window config to `tauri.conf.json`
   - Implement basic show/hide commands
   - Test panel visibility and positioning

2. **Phase 2: Store Integration**
   - Add termination panel state to `remote-access-store.ts`
   - Implement `showTerminationPanel()` and `hideTerminationPanel()`
   - Connect to session lifecycle (start/end events)

3. **Phase 3: Termination Logic**
   - Implement `handleTerminationRequest()`
   - Add WebRTC session stop logic
   - Add SignalR notification to agent
   - Test complete termination flow

4. **Phase 4: Polish & Edge Cases**
   - Add confirmation dialog
   - Handle network interruptions
   - Test multi-monitor scenarios
   - Add error logging and recovery

## Conclusions

✅ **Technically Feasible**: All required patterns and infrastructure exist

✅ **Low Complexity**: Leverages existing code, minimal new code required

✅ **Low Risk**: Proven patterns from floating-icon and remote session banner

✅ **Recommended Approach**: Create dedicated Tauri window with event-based communication

## Next Steps

1. ✅ Research complete
2. ⏳ Create `data-model.md` with state definitions
3. ⏳ Create `quickstart.md` with setup instructions
4. ⏳ Create contract definitions
5. ⏳ Run `/speckit.tasks` to generate implementation tasks
