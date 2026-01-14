# Implementation Tasks: Remote Session Termination Panel

**Feature Branch**: `005-remote-session-panel`
**Date**: 2025-01-14
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Overview

This document provides a complete, ordered list of implementation tasks for the Remote Session Termination Panel feature. Tasks are organized by user story to enable independent implementation and testing.

**Total Tasks**: 15
**Estimated Complexity**: Medium (leverages existing patterns)
**Target Platform**: Windows Desktop (Tauri v2)

---

## Phase 1: Setup

**Goal**: Prepare development environment and validate prerequisites

**Tasks**:

- [ ] T001 Verify Tauri v2 development environment is functional (run `npm run tauri dev` in `src/requester-app/src`)
- [ ] T002 Verify existing remote session infrastructure works (check `src/stores/remote-access-store.ts`, `src/lib/remote/webrtc-host.ts`)
- [ ] T003 Review reference implementations (`src-tauri/icons/floating-icon.html`, `src/components/remote-session-banner/RemoteSessionBanner.tsx`)

**Validation**: Dev server starts successfully, floating icon appears, remote session can be initiated

---

## Phase 2: Foundational Infrastructure

**Goal**: Implement shared infrastructure required by all user stories

**Tasks**:

- [ ] T004 Add termination-panel window definition to `src/requester-app/src/src-tauri/tauri.conf.json` (600x80px, alwaysOnTop: true, visible: false, transparent: true, decorations: false, skipTaskbar: true, focus: false, url: "/termination-panel.html")
- [ ] T005 [P] Implement `show_termination_panel` command in `src/requester-app/src/src-tauri/src/lib.rs` (parameters: session_id: String, agent_name: String, returns Result<(), String>)
- [ ] T006 [P] Implement `hide_termination_panel` command in `src/requester-app/src/src-tauri/src/lib.rs` (no parameters, returns Result<(), String>)
- [ ] T007 [P] Implement `position_termination_panel` command in `src/requester-app/src/src-tauri/src/lib.rs` (uses `get_primary_monitor_dims()`, calculates x: center, y: bottom-10px)
- [ ] T008 Register new Tauri commands in invoke_handler macro in `src/requester-app/src/src-tauri/src/lib.rs` (add: show_termination_panel, hide_termination_panel, position_termination_panel)
- [ ] T009 Add `terminationPanelVisible: boolean` field to `RemoteAccessState` interface in `src/requester-app/src/src/stores/remote-access-store.ts`

**Validation**: Tauri compiles successfully, new commands registered in invoke_handler, state field added

**Blocking**: ALL foundational tasks MUST complete before User Story 1

---

## Phase 3: User Story 1 - View Active Remote Session Panel (P1)

**Goal**: Display panel at screen bottom when remote session is active

**Why This Priority**: Core user awareness requirement - security/privacy risk without this

**Independent Test**: Initiate remote session → verify panel appears at bottom of screen with correct text

**Tasks**:

- [ ] T010 [US1] Create `src/requester-app/src/src-tauri/termination-panel.html` with panel UI structure (container, title text "A REMOTE ACCESS SESSION IS RUNNING", agent name display, terminate button placeholder)
- [ ] T011 [US1] Implement panel CSS in `src/requester-app/src/src-tauri/termination-panel.html` (red gradient background #dc2626 to #b91c1c, white text, centered layout, 600x80px dimensions, box-shadow, z-index: 99999)
- [ ] T012 [US1] Implement `showTerminationPanel` function in `src/requester-app/src/src/stores/remote-access-store.ts` (invokes show_termination_panel Tauri command with session_id and agent_name, logs success/error)
- [ ] T013 [US1] Implement `hideTerminationPanel` function in `src/requester-app/src/src/stores/remote-access-store.ts` (invokes hide_termination_panel Tauri command, logs success/error)
- [ ] T014 [US1] Integrate panel show into `handleRemoteSessionAutoStart` in `src/requester-app/src/src/stores/remote-access-store.ts` (after adding to bannerSessions, call showTerminationPanel, set terminationPanelVisible: true)
- [ ] T015 [US1] Implement event listeners in `src/requester-app/src/src-tauri/termination-panel.html` (listen for termination-panel-show event with {sessionId, agentName} payload, update UI content)
- [ ] T016 [US1] Add panel positioning call in `src/requester-app/src/src-tauri/termination-panel.html` (invoke position_termination_panel on load and after show event)

**Acceptance Criteria**:
- Panel appears within 2 seconds of remote session start (SC-001)
- Panel displays "A remote Access Session is Running" text (FR-002)
- Panel shows correct agent name (from BannerSession)
- Panel is visible when main window is minimized (FR-004)
- Panel remains on top of other windows (FR-005)
- Panel uses high-contrast red colors (FR-010)

**Tests** (Manual - see quickstart.md Test Scenarios 1-4):
1. Manual panel display test
2. Remote session integration test
3. Main window minimized test
4. Multi-monitor positioning test

**Parallel Execution Opportunities**:
- T010, T011, T012, T013 can be done in parallel (different files)
- T015, T016 can be done in parallel (both in termination-panel.html)

---

## Phase 4: User Story 2 - Terminate Remote Session (P2)

**Goal**: Provide one-click session termination button

**Why This Priority**: User control and security - instant ability to revoke access

**Independent Test**: Click terminate button → verify session ends, panel hides, agent notified

**Tasks**:

- [ ] T017 [US2] Style terminate button in `src/requester-app/src/src-tauri/termination-panel.html` (white background, red text, padding, rounded corners, hover effect, click animation)
- [ ] T018 [US2] Implement terminate button click handler in `src/requester-app/src/src-tauri/termination-panel.html` (emit termination-request event with {sessionId, timestamp} payload)
- [ ] T019 [US2] Implement `handleTerminationRequest` function in `src/requester-app/src/src/stores/remote-access-store.ts` (stops WebRTC session via webrtcHost.stop(), emits SignalR UserTerminatedSession, removes session from bannerSessions)
- [ ] T020 [US2] Integrate panel hide into `handleRemoteSessionEnded` in `src/requester-app/src/src/stores/remote-access-store.ts` (when bannerSessions.length === 0, call hideTerminationPanel, set terminationPanelVisible: false)
- [ ] T021 [US2] Add termination-request event listener in `src/requester-app/src/src-tauri/termination-panel.html` (listens for event, calls handleTerminationRequest via Tauri event system)
- [ ] T022 [US2] Implement optional confirmation message in `src/requester-app/src/src-tauri/termination-panel.html` (display "Session terminated" for 1 second before hiding panel)
- [ ] T023 [US2] Add SignalR invoke for agent notification in `src/requester-app/src/src/stores/remote-access-store.ts` (call signalrManager.invoke('UserTerminatedSession', {sessionId, userId, username, terminatedAt}))

**Acceptance Criteria**:
- Terminate button is visible and clickable (FR-003)
- Clicking button ends session within 1 second (SC-002, FR-006)
- Panel disappears within 1 second of session end (FR-008, SC-001)
- IT agent receives notification within 2 seconds (SC-006, FR-009)
- Confirmation message displayed before panel hides (US2 acceptance scenario 3)
- WebRTC connection properly closed (webrtcHost.stop())
- Session removed from bannerSessions

**Tests** (Manual - see quickstart.md Test Scenario 3):
1. Terminate button click test
2. Agent notification verification test
3. Session end cleanup test

**Parallel Execution Opportunities**:
- T017, T018 can be done in parallel (both in termination-panel.html)
- T019, T023 can be done in parallel (both in remote-access-store.ts)
- T021, T022 can be done in parallel (both in termination-panel.html)

**Dependencies**: US2 depends on US1 (panel must exist before adding terminate button)

---

## Phase 5: Polish & Cross-Cutting Concerns

**Goal**: Handle edge cases, add error handling, ensure production readiness

**Tasks**:

- [ ] T024 Add error handling to panel show command in `src/requester-app/src/src-tauri/src/lib.rs` (log error if window not found, return descriptive error message)
- [ ] T025 Add error handling to panel hide command in `src/requester-app/src/src-tauri/src/lib.rs` (log error if window not found or hide fails)
- [ ] T026 Add timeout cleanup in `src/requester-app/src/src-tauri/termination-panel.html` (if panel visible for >5 minutes after session ended, force hide)
- [ ] T027 Add network interruption handling in `src/requester-app/src/src-tauri/termination-panel.html` (display error state if WebRTC disconnects, provide "Close Panel" button)
- [ ] T028 Add screen resolution change listener in `src/requester-app/src/src-tauri/termination-panel.html` (reposition panel when window.resize event fires)
- [ ] T029 Verify cleanup on app exit in `src/requester-app/src/src-tauri/src/lib.rs` (ensure panel hides when app closes, no orphaned windows)
- [ ] T030 Test multi-monitor scenarios per quickstart.md Test Scenario 4b (verify panel appears on primary monitor)
- [ ] T031 Performance test per quickstart.md Performance Testing section (verify panel appears <2s, termination <1s)

**Edge Cases Covered**:
- Network interruption during session
- Application crash during session (cleanup on exit)
- Multiple monitor setups
- User closes application during session
- IT agent ends session (panel hides)
- Screen resolution changes

**Validation**: All edge cases pass, performance targets met, no orphaned windows

---

## Dependencies

```
Phase 1 (Setup)
    ↓
Phase 2 (Foundational Infrastructure) ← BLOCKING
    ↓
Phase 3 (US1: View Panel) ← MVP COMPLETE
    ↓
Phase 4 (US2: Terminate Session)
    ↓
Phase 5 (Polish & Edge Cases)
```

**Story Dependencies**:
- US2 depends on US1 (terminate button requires panel to exist)
- US1 is independently testable (MVP scope)
- US2 is independently testable (requires US1 panel, but separate functionality)

**Critical Path**: Setup → Foundational → US1 → US2 → Polish

**Parallel Opportunities**:
- Within US1: T010, T011, T012, T013 can be parallel
- Within US2: T017, T018 can be parallel; T019, T023 can be parallel

---

## Implementation Strategy

### MVP Scope (Recommended First Delivery)

**Phase 1 + Phase 2 + Phase 3 (US1 only)**

**What You Get**:
- Panel appears at screen bottom when remote session starts
- Panel displays "A remote Access Session is Running" and agent name
- Panel remains visible when main window minimized
- Panel hides when session ends (agent or user)

**Independent Test**: Complete US1 acceptance scenarios

**Value Delivered**: User awareness of remote sessions (addresses security/privacy risk)

**Tasks**: T001-T016 (16 tasks)

### Incremental Delivery

**Sprint 1**: MVP (Phase 1-3, US1 only) → Deploy to beta users
**Sprint 2**: Add termination capability (Phase 4, US2) → Deploy to all users
**Sprint 3**: Polish and edge cases (Phase 5) → Production-ready

---

## Parallel Execution Examples

### Example 1: US1 Implementation (2 developers)

**Developer A**:
- T010: Create termination-panel.html structure
- T011: Implement panel CSS
- T015: Implement event listeners

**Developer B**:
- T012: Implement showTerminationPanel function
- T013: Implement hideTerminationPanel function
- T014: Integrate panel show into handleRemoteSessionAutoStart
- T016: Add panel positioning call

**Sequence**: A and B work in parallel, sync on T014 (needs T012 complete)

### Example 2: US2 Implementation (2 developers)

**Developer A**:
- T017: Style terminate button
- T018: Implement button click handler
- T021: Add termination-request event listener
- T022: Add confirmation message

**Developer B**:
- T019: Implement handleTerminationRequest function
- T020: Integrate panel hide into handleRemoteSessionEnded
- T023: Add SignalR invoke for agent notification

**Sequence**: A and B work in parallel, sync on T021 (needs T019 complete)

---

## Task Count Summary

| Phase | Task Count | Parallelizable |
|-------|-----------|---------------|
| Phase 1: Setup | 3 | 0 (sequential verification) |
| Phase 2: Foundational | 6 | 3 (T005, T006, T007) |
| Phase 3: US1 (View Panel) | 7 | 4 (T010-T013, T015-T016) |
| Phase 4: US2 (Terminate) | 7 | 6 (T017-T018, T019-T023, T021-T022) |
| Phase 5: Polish | 8 | 3 (T024-T025, T026-T027) |
| **TOTAL** | **31** | **16 (52%)** |

**Parallel Opportunities**: 16 tasks can be parallelized within their phases

---

## Format Validation

✅ All tasks follow checklist format: `- [ ] [TaskID] [P?] [Story?] Description`
✅ All tasks include file paths
✅ User story tasks include [US1], [US2] labels
✅ Parallelizable tasks marked with [P]
✅ Setup/Foundational/Polish phases have NO story labels
✅ Each user story phase is independently testable
✅ Dependencies clearly documented

---

## Next Steps

1. Start with Phase 1 (Setup) to validate environment
2. Complete Phase 2 (Foundational) - BLOCKING for all user stories
3. Implement Phase 3 (US1) for MVP delivery
4. Implement Phase 4 (US2) for termination capability
5. Complete Phase 5 (Polish) for production readiness

**Testing Reference**: See [quickstart.md](./quickstart.md) for detailed test scenarios
**Data Model Reference**: See [data-model.md](./data-model.md) for state definitions
**Research Reference**: See [research.md](./research.md) for technical patterns
