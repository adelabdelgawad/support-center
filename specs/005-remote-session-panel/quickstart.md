# Quickstart: Remote Session Termination Panel

**Feature**: 005-remote-session-panel
**Date**: 2025-01-14
**Status**: Complete

## Overview

This guide provides step-by-step instructions for developing, testing, and debugging the remote session termination panel feature.

## Prerequisites

### Required Software

- **Node.js**: v18+ (for requester-app)
- **Rust**: 1.70+ (for Tauri)
- **Visual Studio Build Tools** (Windows) - Required for Tauri compilation
- **Git**: For version control

### Required Accounts

- **IT Support Backend Access**: For testing remote sessions
- **Agent Portal Access**: For initiating remote sessions

## Development Setup

### 1. Clone and Setup

```bash
# Navigate to requester-app
cd src/requester-app/src

# Install dependencies
npm install

# Start development server
npm run tauri dev
```

**Expected Output**:
- Main application window opens
- Floating icon appears in top-left corner
- DevTools console opens (for debugging)

### 2. Verify Environment

```bash
# Check Tauri CLI
npm run tauri -- version

# Check Rust toolchain
rustc --version

# Check Node version
node --version
```

**Expected Versions**:
- Tauri: v2.0.0+
- Rust: 1.70.0+
- Node: 18.0.0+

## Development Workflow

### Project Structure

```
src/requester-app/src/
├── src-tauri/
│   ├── src/
│   │   └── lib.rs                    # Tauri commands (modify)
│   ├── tauri.conf.json              # Window config (modify)
│   └── termination-panel.html        # NEW: Panel UI
└── src/
    └── stores/
        └── remote-access-store.ts   # State management (modify)
```

### Hot Reload

**Frontend Changes** (TypeScript/HTML/CSS):
- Automatic hot reload via Vite
- Changes reflect in ~2 seconds

**Rust Changes** (Tauri commands):
```bash
# Restart Tauri dev server
# Ctrl+C to stop, then:
npm run tauri dev
```

## Testing the Termination Panel

### Test Scenario 1: Manual Panel Display

**Purpose**: Verify panel window appears and positions correctly

**Steps**:
```bash
# 1. Start dev server
npm run tauri dev

# 2. Open DevTools console (F12)

# 3. Manually trigger panel show
window.__TAURI__.core.invoke('show_termination_panel', {
  sessionId: 'test-session-123',
  agentName: 'Test Agent'
});

# 4. Verify panel appears at bottom of screen
# 5. Verify panel shows "A REMOTE ACCESS SESSION IS RUNNING"
# 6. Verify "Terminate Session" button is visible

# 7. Hide panel
window.__TAURI__.core.invoke('hide_termination_panel');
```

**Expected Result**: Panel appears centered at bottom of screen with correct content

### Test Scenario 2: Remote Session Integration

**Purpose**: Verify panel shows during real remote session

**Prerequisites**:
- IT Support backend running
- Agent portal accessible
- Two machines (requester + agent) or single machine with agent portal

**Steps**:
```
Requester Side:
1. Start requester-app: npm run tauri dev
2. Log in as employee user
3. Keep app open (can minimize main window)

Agent Side:
1. Open agent portal (http://localhost:3010)
2. Navigate to support requests
3. Find test user's request
4. Click "Start Remote Session"

Requester Side:
5. Observe floating icon changes (red dot appears)
6. Verify termination panel appears at screen bottom
7. Verify panel shows agent name
8. Verify "Terminate Session" button is visible
```

**Expected Result**: Panel appears automatically when session starts

### Test Scenario 3: Terminate Session

**Purpose**: Verify terminate button ends session correctly

**Steps**:
```
1. Ensure remote session is active (Test Scenario 2)
2. Click "Terminate Session" button on panel
3. Verify confirmation message appears (optional)
4. Verify panel disappears
5. Verify floating icon returns to green
6. Verify WebRTC connection closed (check DevTools Network tab)

Agent Side:
7. Verify notification: "User terminated the session"
8. Verify remote view closes/disconnects
```

**Expected Result**: Session ends, panel hides, agent notified

### Test Scenario 4: Edge Cases

**4a. Main Window Minimized**
```
1. Start remote session
2. Minimize main application window
3. Verify panel still visible
4. Click terminate button
5. Verify session ends correctly
```

**4b. Multiple Monitors**
```
1. Connect multiple monitors
2. Start remote session
3. Verify panel appears on primary monitor
4. Verify panel positioning is correct (bottom with margin)
```

**4c. Screen Resolution Change**
```
1. Start remote session with panel visible
2. Change screen resolution (display settings)
3. Verify panel repositions correctly
4. Verify panel remains at bottom of screen
```

**4d. Application Crash**
```
1. Start remote session with panel visible
2. Force-close application (Task Manager)
3. Restart application
4. Verify no orphaned panel window
5. Verify new session works correctly
```

## Debugging

### Enable Detailed Logging

**In `src-tauri/src/lib.rs`**:
```rust
// Add to Tauri commands
println!("[TerminationPanel] show_termination_panel called with session_id={}", session_id);

// Check window retrieval
let panel = match app.get_webview_window("termination-panel") {
    Some(window) => window,
    None => {
        eprintln!("[TerminationPanel] ERROR: termination-panel window not found");
        return Err("Window not found".to_string());
    }
};

println!("[TerminationPanel] Window found, emitting event...");
```

**In `remote-access-store.ts`**:
```typescript
logger.info('remote-support', 'Showing termination panel', {
  sessionId,
  agentName,
  timestamp: new Date().toISOString()
});

console.log('[TerminationPanel] Invoking show_termination_panel command...');
await invoke('show_termination_panel', { session_id: sessionId, agent_name: agentName });
console.log('[TerminationPanel] Command completed');
```

### Browser DevTools

**Open DevTools**:
```bash
# In development, DevTools opens automatically
# In production, enable via tauri.conf.json:
```

**In `tauri.conf.json`**:
```json
{
  "app": {
    "windows": [{
      "label": "main",
      "devtools": true  // Enable DevTools in production
    }]
  }
}
```

**Useful Console Commands**:
```javascript
// Check Tauri availability
console.log(window.__TAURI__);

// Check current remote session state
import { remoteAccessStore } from './stores/remote-access-store';
console.log(remoteAccessStore.state);

// Manually trigger panel
window.__TAURI__.core.invoke('show_termination_panel', {
  sessionId: 'debug-123',
  agentName: 'Debug Agent'
});

// Manually hide panel
window.__TAURI__.core.invoke('hide_termination_panel');
```

### Tauri Inspector

```bash
# Open Tauri Inspector (alternative to DevTools)
npm run tauri info
```

### Network Tab

**Monitor WebRTC Connection**:
1. Open DevTools → Network tab
2. Filter by "WS" (WebSocket)
3. Look for WebSocket connection to signaling server
4. Verify connection closes after termination

**Monitor SignalR Events**:
1. Open DevTools → Network tab
2. Filter by "signalr" or "EventSource"
3. Look for `UserTerminatedSession` invoke
4. Verify request succeeds (200 status)

## Common Issues and Solutions

### Issue: Panel Doesn't Appear

**Symptoms**: Session starts but panel doesn't show

**Debug Steps**:
```javascript
// 1. Check if window is defined
console.log('Tauri available:', !!window.__TAURI__);

// 2. Check command invocation
await window.__TAURI__.core.invoke('show_termination_panel', {
  sessionId: 'test',
  agentName: 'Test'
}).catch(err => console.error('Invoke failed:', err));

// 3. Check Tauri logs (terminal where `npm run tauri dev` is running)
```

**Solutions**:
- Ensure `termination-panel` window exists in `tauri.conf.json`
- Check window label matches exactly (case-sensitive)
- Verify window `visible: false` initially (should be hidden)
- Restart Tauri dev server after config changes

### Issue: Panel Wrong Position

**Symptoms**: Panel appears but not at bottom of screen

**Debug Steps**:
```javascript
// Check monitor dimensions
window.__TAURI__.core.invoke('get_primary_monitor_dims')
  .then(dims => console.log('Monitor dims:', dims));
```

**Solutions**:
- Verify `position_termination_panel` command is called after show
- Check screen height calculation in Rust
- Test on different screen resolutions
- Adjust margin value if needed

### Issue: Panel Stays Visible After Session Ends

**Symptoms**: Session ends but panel doesn't hide

**Debug Steps**:
```typescript
// Check bannerSessions array
console.log('Banner sessions:', remoteAccessStore.state.bannerSessions);

// Check hide command invocation
await window.__TAURI__.core.invoke('hide_termination_panel')
  .catch(err => console.error('Hide failed:', err));
```

**Solutions**:
- Verify `handleRemoteSessionEnded` calls `hideTerminationPanel`
- Check that `bannerSessions` array is empty
- Add cleanup on app exit
- Implement timeout fallback (hide after 5 seconds if session ended)

### Issue: Termination Button Doesn't Work

**Symptoms**: Clicking terminate button has no effect

**Debug Steps**:
```javascript
// Check event listener is attached
console.log('Event listeners:', window.__TAURI__.event);

// Manually trigger termination
window.__TAURI__.event.emit('termination-request', {
  sessionId: 'test-session',
  timestamp: new Date().toISOString()
});
```

**Solutions**:
- Verify button has click event listener
- Check event name matches (`termination-request`)
- Verify store is listening for event
- Add console.log in event handler

## Performance Testing

### Panel Show Performance

**Target**: Panel appears within 2 seconds (FR-007)

**Test**:
```javascript
const start = performance.now();
await window.__TAURI__.core.invoke('show_termination_panel', {
  sessionId: 'test',
  agentName: 'Test'
});
const end = performance.now();
console.log(`Panel show time: ${end - start}ms`);
```

**Expected**: < 500ms in development, < 200ms in production

### Termination Performance

**Target**: Session ends within 1 second (FR-002)

**Test**:
```javascript
const start = performance.now();
await remoteAccessStore.handleTerminationRequest(sessionId);
const end = performance.now();
console.log(`Termination time: ${end - start}ms`);
```

**Expected**: < 1000ms total (WebRTC stop + SignalR notify + panel hide)

## Integration Testing

### End-to-End Test Flow

```
1. Start requester-app (dev mode)
2. Start agent portal (separate browser/machine)
3. Create support request as employee
4. Assign request to agent
5. Agent initiates remote session
   → Verify panel appears (within 2s)
   → Verify correct agent name displayed
   → Verify terminate button visible
6. Minimize main app window
   → Verify panel still visible
7. Click terminate button
   → Verify confirmation (if implemented)
   → Verify session ends
   → Verify panel disappears
   → Verify agent notified
8. Verify floating icon returns to green
9. Verify WebRTC connection closed
```

### Success Criteria

- ✅ Panel appears within 2 seconds of session start
- ✅ Panel visible when main window minimized
- ✅ Terminate button functional (click works)
- ✅ Session ends within 1 second of click
- ✅ Agent receives notification
- ✅ Panel disappears when session ends
- ✅ No orphaned windows after app restart

## Deployment

### Build for Production

```bash
# Navigate to requester-app
cd src/requester-app/src

# Build production bundle
npm run tauri build

# Output: src-tauri/target/release/bundle/msi/
# Installer: IT Support Center_1.0.0_x64_en-US.msi
```

### Test Production Build

```bash
# 1. Install MSI
# 2. Launch application
# 3. Repeat Test Scenarios 1-4
# 4. Verify performance is better than dev build
```

## Next Steps

1. ✅ Complete development setup
2. ✅ Test manual panel display
3. ✅ Test remote session integration
4. ✅ Test termination flow
5. ✅ Test edge cases
6. ⏳ Fix any bugs found
7. ⏳ Build production release
8. ⏳ Deploy to users

## Support

**Issues**: Create GitHub issue with label `feature:termination-panel`

**Questions**: Contact team lead or reference:
- [Feature Specification](./spec.md)
- [Implementation Plan](./plan.md)
- [Data Model](./data-model.md)
- [Research Findings](./research.md)
