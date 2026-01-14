# Implementation Plan: Remote Session Termination Panel

**Branch**: `005-remote-session-panel` | **Date**: 2025-01-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-remote-session-panel/spec.md`

## Summary

Implement a persistent termination panel at the bottom of the screen that appears during active remote support sessions. The panel provides users with immediate awareness of remote access and a one-click termination button to revoke access. This builds on the existing Tauri multi-window architecture, SignalR event system, and remote session management patterns in the requester-app.

**Technical Approach**: Create a new always-on-top Tauri window (similar to floating-icon) that displays at screen bottom, integrates with existing remote session state management, and leverages the established event emission patterns for show/hide control.

## Technical Context

**Language/Version**: TypeScript (SolidJS), Rust (Tauri v2)
**Primary Dependencies**: Tauri v2 (multi-window), SignalR (real-time events), WebRTC (remote sessions)
**Storage**: N/A (session state only, no persistence)
**Testing**: Manual testing (Tauri desktop app)
**Target Platform**: Windows 10+ (requester-app desktop application)
**Project Type**: Desktop application (Tauri + SolidJS)
**Performance Goals**: Panel appears within 2 seconds, termination action <1 second
**Constraints**: Must remain visible when main window minimized, always-on-top required
**Scale/Scope**: Single user per desktop, one panel per session

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Commit Requirements

- [x] **HTTPSchemaModel Inheritance**: N/A (frontend-only feature)
- [x] **API Proxy Pattern**: N/A (no backend API calls)
- [x] **Bun Package Manager**: N/A (requester-app uses npm, not it-app)
- [x] **Service Layer Architecture**: N/A (UI feature only)
- [x] **Clean Code Removal**: Must delete any experimental/unused code completely

### Pull Request Checklist

- [x] Schema inheritance verified: N/A
- [x] API proxy pattern followed: N/A
- [x] Correct package manager used: N/A (requester-app uses npm)
- [x] Service layer pattern maintained: N/A
- [x] No legacy/dead code introduced: Must verify during implementation

### Compliance Status

✅ **PASSED** - This feature is a frontend UI component for the requester-app (Windows desktop). It does not involve backend schemas, API routes, or the it-app (which uses bun). The feature will be implemented using existing Tauri window patterns and SignalR event integration.

## Project Structure

### Documentation (this feature)

```text
specs/005-remote-session-panel/
├── plan.md              # This file
├── research.md          # Phase 0: Technical research findings
├── data-model.md        # Phase 1: State and entity definitions
├── quickstart.md        # Phase 1: Developer setup instructions
└── tasks.md             # Phase 2: Implementation tasks (NOT created by this command)
```

### Source Code (repository root)

```text
src/requester-app/
├── src/
│   ├── src-tauri/
│   │   ├── src/
│   │   │   └── lib.rs                    # Add termination panel window commands
│   │   ├── tauri.conf.json              # Add termination-panel window config
│   │   └── termination-panel.html        # NEW: Panel UI (HTML/CSS/JS)
│   └── src/
│       ├── stores/
│       │   └── remote-access-store.ts   # Add termination state & handlers
│       └── components/
│           └── remote-session-banner/   # Existing: Reference for styling patterns
```

**Structure Decision**: This is a Tauri desktop application feature. The termination panel will be implemented as a new Tauri window (similar to the existing floating-icon), with state management integrated into the existing `remote-access-store.ts` and UI following the patterns from `RemoteSessionBanner.tsx`.

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Desktop Screen                          │
│                                                              │
│  ┌──────────────┐        ┌──────────────────────────┐      │
│  │ Main Window  │        │   Floating Icon          │      │
│  │ (minimizable)│        │   (draggable, always-on)  │      │
│  └──────────────┘        └──────────────────────────┘      │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  🔴 A REMOTE ACCESS SESSION IS RUNNING               │  │
│  │  [Terminate Session]                                 │  │
│  └──────────────────────────────────────────────────────┘  │
│                    ↑ Termination Panel (always-on-top)      │
└─────────────────────────────────────────────────────────────┘
```

### Event Flow

```
SignalR Event (RemoteSessionAutoStart)
    ↓
remoteAccessStore.handleRemoteSessionAutoStart()
    ↓
1. Add session to bannerSessions
2. Show termination panel window (Tauri command)
3. Emit panel-update event with session info
    ↓
Termination Panel Window
    - Displays: "A remote Access Session is Running"
    - Displays: Agent name
    - Button: "Terminate Session"
    ↓
User clicks "Terminate Session"
    ↓
1. Emit termination-request event
2. Stop WebRTC session
3. Notify IT agent via SignalR
4. Hide termination panel
```

### State Management

```typescript
interface RemoteAccessState {
  // Existing fields
  activeSession: { sessionId: string; connectionState } | null;
  bannerSessions: BannerSession[];

  // New field for termination panel
  terminationPanelVisible: boolean;
}
```

## Implementation Phases

### Phase 0: Research & Technical Decisions

**Objective**: Validate technical approach and identify all integration points.

**Research Tasks**:
1. Tauri window positioning patterns for bottom-of-screen placement
2. Event emission patterns from Rust → WebView
3. WebRTC session termination flow and cleanup
4. SignalR notification patterns for agent-side updates

**Deliverable**: `research.md` with technical decisions and code patterns

### Phase 1: Design & Contracts

**Objective**: Define data models, state management, and API contracts.

**Data Model** (`data-model.md`):
- `TerminationPanelState` interface
- Session lifecycle state transitions
- Event payload schemas

**Quickstart** (`quickstart.md`):
- Development setup for Tauri windows
- Testing procedures for remote sessions
- Debugging SignalR events

**Contracts** (`contracts/`):
- Tauri command signatures (Rust)
- Event payload schemas (TypeScript)

**Deliverables**:
- `data-model.md`
- `quickstart.md`
- `contracts/tauri-commands.md`
- `contracts/event-schemas.md`

### Phase 2: Implementation (out of scope for this command)

**Will be covered by `/speckit.tasks` command**:
- Create termination panel HTML/CSS/JS
- Add Tauri window configuration
- Implement Rust commands for panel control
- Integrate with remote-access-store
- Handle termination events
- Test and validate

## Critical Files

### New Files to Create

| File | Purpose |
|------|---------|
| `src/requester-app/src/src-tauri/termination-panel.html` | Panel UI (HTML/CSS/JS) |
| `specs/005-remote-session-panel/research.md` | Technical research findings |
| `specs/005-remote-session-panel/data-model.md` | State and entity definitions |
| `specs/005-remote-session-panel/quickstart.md` | Developer setup guide |

### Files to Modify

| File | Changes |
|------|---------|
| `src/requester-app/src/src-tauri/src/lib.rs` | Add panel show/hide commands, event handlers |
| `src/requester-app/src/src-tauri/tauri.conf.json` | Add termination-panel window definition |
| `src/requester-app/src/src/stores/remote-access-store.ts` | Add termination state, handlers, Tauri invokes |

### Reference Files (no changes)

| File | Purpose |
|------|---------|
| `src/requester-app/src/src-tauri/icons/floating-icon.html` | Pattern for always-on-top window |
| `src/requester-app/src/src/components/remote-session-banner/RemoteSessionBanner.tsx` | Styling patterns, animations |
| `src/requester-app/src/src/lib/remote/webrtc-host.ts` | Session termination logic |

## Technical Decisions

### Window Management

**Decision**: Create a dedicated Tauri window for the termination panel (not an HTML overlay within main window)

**Rationale**:
- Panel must remain visible when main window is minimized (FR-004)
- Always-on-top requirement (FR-005) is natively supported by Tauri windows
- Consistent with existing floating-icon pattern
- Cleaner separation of concerns

**Alternatives Considered**:
- HTML overlay within main window: Rejected because it disappears when window is minimized
- Browser notification API: Rejected because it doesn't support custom buttons or persistent display

### Panel Positioning

**Decision**: Use Tauri's `Position::Physical` with calculated bottom-of-screen coordinates

**Rationale**:
- Primary monitor detection is already implemented in `get_primary_monitor_dims()`
- Consistent with existing `position_window_near_icon()` pattern
- Handles multi-monitor setups correctly

**Alternatives Considered**:
- CSS `position: fixed; bottom: 0`: Rejected because it only works within window bounds

### Event Communication

**Decision**: Use Tauri's event emission system (app.emit() + window.listen())

**Rationale**:
- Already used for floating-icon communication
- Bi-directional communication (Rust → WebView, WebView → Rust)
- Consistent with existing patterns

**Alternatives Considered**:
- Direct Tauri invokes from panel: Rejected because events are more flexible for state synchronization

### Session Termination

**Decision**: Terminate via existing `webrtcHost.stop()` + SignalR notification

**Rationale**:
- Reuses proven session cleanup logic
- Ensures agent is notified via existing SignalR infrastructure
- Consistent with existing `handleRemoteSessionEnded()` flow

**Alternatives Considered**:
- New termination endpoint: Rejected because it duplicates existing cleanup logic

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Panel fails to show | Add logging to Tauri commands, test with devtools |
| Panel doesn't close | Add timeout cleanup, listen for window close events |
| Termination doesn't work | Verify WebRTC cleanup, add fallback cleanup on app exit |
| Agent not notified | Test SignalR message delivery, add retry logic |
| Multi-monitor issues | Use primary monitor detection, test with different configurations |

## Complexity Tracking

> No constitution violations - this section not required

## Planning Phase Complete

### Generated Artifacts

✅ **research.md** - Technical research findings with:
- Tauri window management patterns
- Event emission patterns (Rust ↔ WebView)
- WebRTC session termination flow
- SignalR notification patterns
- Code pattern references from existing implementation

✅ **data-model.md** - State and entity definitions with:
- Extended `RemoteAccessState` interface
- `TerminationPanelState` entity
- Event payload schemas (show/hide/terminate)
- State transition diagrams
- Validation rules

✅ **quickstart.md** - Developer setup guide with:
- Development environment setup
- Testing procedures (4 test scenarios)
- Debugging instructions
- Common issues and solutions
- Performance testing guidelines

⏳ **contracts/** - To be created during implementation:
- `tauri-commands.md` - Rust command signatures
- `event-schemas.md` - Event payload definitions

### Integration Points Identified

1. **Remote Access Store** (`src/stores/remote-access-store.ts`):
   - Add `terminationPanelVisible: boolean` to state
   - Add methods: `showTerminationPanel()`, `hideTerminationPanel()`, `handleTerminationRequest()`
   - Integrate with `handleRemoteSessionAutoStart()` and `handleRemoteSessionEnded()`

2. **Tauri Commands** (`src-tauri/src/lib.rs`):
   - `show_termination_panel(session_id, agent_name)`
   - `hide_termination_panel()`
   - `position_termination_panel()`

3. **Tauri Window Config** (`src-tauri/tauri.conf.json`):
   - Add `termination-panel` window definition (600x80px, always-on-top, transparent)

4. **Panel UI** (`src-tauri/termination-panel.html`):
   - NEW: Panel HTML/CSS/JS with terminate button
   - Event listeners for show/hide/terminate

5. **SignalR Events**:
   - Emit `UserTerminatedSession` to agent on user termination

### Architecture Decisions Validated

✅ **Dedicated Tauri Window** (not HTML overlay):
- Meets FR-004 (visible when main window minimized)
- Meets FR-005 (always-on-top natively)
- Consistent with existing floating-icon pattern

✅ **Event-Based Communication** (not direct invokes):
- Flexible state synchronization
- Proven pattern from floating-icon
- Bi-directional (Rust ↔ WebView)

✅ **Reuse Existing Termination Logic**:
- Leverage `webrtcHost.stop()`
- Use existing SignalR infrastructure
- Consistent with `handleRemoteSessionEnded()`

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Panel positioning issues | Low | Medium | Use existing `get_primary_monitor_dims()`, test multi-monitor |
| Termination fails | Low | High | Fallback cleanup, verify WebRTC closure, add timeout |
| Panel doesn't hide | Low | Medium | Cleanup on app exit, timeout after session end |
| Agent not notified | Low | Medium | Retry logic, verify SignalR connection |

## Next Steps

1. ✅ **Complete** - Specification created and validated
2. ✅ **Complete** - Implementation plan drafted
3. ✅ **Complete** - Research findings documented
4. ✅ **Complete** - Data model defined
5. ✅ **Complete** - Quickstart guide created
6. ⏳ **Next** - Run `/speckit.tasks` to generate detailed implementation tasks
7. ⏳ **Future** - Execute implementation tasks
8. ⏳ **Future** - Testing and validation

## References

- [Feature Specification](./spec.md)
- [Requirements Checklist](./checklists/requirements.md)
- [Research Findings](./research.md)
- [Data Model](./data-model.md)
- [Quickstart Guide](./quickstart.md)
- [Tauri v2 Documentation](https://tauri.app/v2/)
- [SignalR Client Documentation](https://docs.microsoft.com/en-us/aspnet/core/signalr/)
