# Tasks: Remote Support Auto-Start with User Awareness

**Input**: Design documents from `/specs/004-remote-support-auto-start/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md

**Tests**: Not explicitly requested - manual testing per quickstart.md

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Backend**: `src/backend/`
- **Requester App**: `src/requester-app/src/src/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify existing infrastructure and prepare for changes

- [x] T001 Verify remote-access-store.ts exists and understand current state structure in src/requester-app/src/src/stores/remote-access-store.ts
- [x] T002 Verify SignalR RemoteSessionAutoStart handler exists in src/requester-app/src/src/signalr/signalr-manager.ts
- [x] T003 Verify remote_access_service.py exists in src/backend/services/remote_access_service.py

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Create banner component infrastructure needed by all user stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Create remote-session-banner directory structure at src/requester-app/src/src/components/remote-session-banner/
- [x] T005 [P] Create RemoteSessionBanner.tsx component skeleton in src/requester-app/src/src/components/remote-session-banner/RemoteSessionBanner.tsx
- [x] T006 [P] Create remote-session-banner.css with fixed top banner styling in src/requester-app/src/src/components/remote-session-banner/remote-session-banner.css
- [x] T007 Export banner state interface from remote-access-store.ts adding isVisible and sessions array getters in src/requester-app/src/src/stores/remote-access-store.ts

**Checkpoint**: Foundation ready - banner component structure exists, store exposes state

---

## Phase 3: User Story 1 - IT Agent Initiates Remote Support Session (Priority: P1) 🎯 MVP

**Goal**: When IT agent starts remote session, employee sees banner immediately with agent name

**Independent Test**: IT agent initiates session → employee sees "Remote support session active - Accessed by: [agent name]" banner within 1 second

### Implementation for User Story 1

- [x] T008 [US1] Update handleRemoteSessionAutoStart in remote-access-store.ts to set banner visible state with agentName in src/requester-app/src/src/stores/remote-access-store.ts
- [x] T009 [US1] Implement RemoteSessionBanner component to display "Remote support session active" and agent username in src/requester-app/src/src/components/remote-session-banner/RemoteSessionBanner.tsx
- [x] T010 [US1] Style banner as fixed top bar (full-width, high z-index, non-dismissable) in src/requester-app/src/src/components/remote-session-banner/remote-session-banner.css
- [x] T011 [US1] Mount RemoteSessionBanner at App root level using Show when={isSessionActive} in src/requester-app/src/src/App.tsx
- [x] T012 [US1] Add fallback to "IT Support" when agentName is empty/undefined in src/requester-app/src/src/components/remote-session-banner/RemoteSessionBanner.tsx

**Checkpoint**: User Story 1 complete - banner appears when session starts showing agent name

---

## Phase 4: User Story 2 - Employee Awareness During Active Session (Priority: P1)

**Goal**: Banner persists through all navigation and cannot be dismissed

**Independent Test**: With session active, navigate pages, refresh app → banner stays visible on every page

### Implementation for User Story 2

- [x] T013 [US2] Ensure banner uses position:fixed CSS to stay visible during scroll in src/requester-app/src/src/components/remote-session-banner/remote-session-banner.css
- [x] T014 [US2] Remove any close button or dismissable interaction from banner component in src/requester-app/src/src/components/remote-session-banner/RemoteSessionBanner.tsx
- [x] T015 [US2] Verify SignalR reconnection restores banner state in handleReconnection in src/requester-app/src/src/signalr/signalr-manager.ts
- [x] T016 [US2] Add pointer-events:none to banner except for any necessary interactions in src/requester-app/src/src/components/remote-session-banner/remote-session-banner.css

**Checkpoint**: User Story 2 complete - banner persists through navigation and refresh

---

## Phase 5: User Story 3 - Session End Clears Indicator (Priority: P2)

**Goal**: Banner disappears within 2 seconds when session ends

**Independent Test**: IT agent ends session → employee's banner disappears within 2 seconds

### Implementation for User Story 3

- [x] T017 [US3] Update handleRemoteSessionEnded in remote-access-store.ts to remove session and set banner invisible when sessions empty in src/requester-app/src/src/stores/remote-access-store.ts
- [x] T018 [US3] Verify SignalR RemoteSessionEnded handler calls store method in src/requester-app/src/src/signalr/signalr-manager.ts
- [x] T019 [US3] Handle disconnect scenario to clear banner when connection lost in src/requester-app/src/src/stores/remote-access-store.ts

**Checkpoint**: User Story 3 complete - banner clears immediately when session ends

---

## Phase 6: User Story 4 - Reconnection Scenario (Priority: P3)

**Goal**: Banner persists or reappears correctly during network reconnection

**Independent Test**: Simulate network drop during active session → banner remains/reappears after reconnect

### Implementation for User Story 4

- [x] T020 [US4] Ensure banner state persists during brief disconnects (don't clear on transient disconnect) in src/requester-app/src/src/stores/remote-access-store.ts
- [x] T021 [US4] On SignalR reconnect, request current session state from backend and restore banner in src/requester-app/src/src/signalr/signalr-manager.ts
- [x] T022 [US4] Handle isReconnection flag in RemoteSessionAutoStart to restore banner without duplicate in src/requester-app/src/src/stores/remote-access-store.ts

**Checkpoint**: User Story 4 complete - banner handles reconnection correctly

---

## Phase 7: Backend Audit Logging (FR-011)

**Purpose**: Add audit logging for session events

- [x] T023 [P] Add structured audit log for remote_session_started event in request_remote_access method in src/backend/services/remote_access_service.py
- [x] T024 [P] Add structured audit log for remote_session_ended event in end_session method in src/backend/services/remote_access_service.py
- [x] T025 Include session_id, agent_username, requester_id, timestamp in all audit log entries in src/backend/services/remote_access_service.py

**Checkpoint**: Audit logging complete - session events logged with required fields

---

## Phase 8: Polish & Edge Cases

**Purpose**: Handle edge cases and finalize implementation

- [x] T026 [P] Handle multiple simultaneous sessions by showing all agent names in banner in src/requester-app/src/src/components/remote-session-banner/RemoteSessionBanner.tsx
- [x] T027 [P] Ensure banner remains readable on small windows with responsive CSS in src/requester-app/src/src/components/remote-session-banner/remote-session-banner.css
- [ ] T028 Verify no regressions to existing remote support functionality (screen sharing, control)
- [ ] T029 Run quickstart.md validation scenarios manually

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - verification only
- **Foundational (Phase 2)**: Depends on Setup - creates component structure
- **User Stories (Phase 3-6)**: All depend on Foundational completion
  - US1 (Phase 3) must complete first (core banner display)
  - US2 (Phase 4) can start after US1 (persistence)
  - US3 (Phase 5) can start after US1 (session end)
  - US4 (Phase 6) can start after US3 (reconnection)
- **Backend Logging (Phase 7)**: Independent of frontend - can run in parallel
- **Polish (Phase 8)**: Depends on all user stories complete

### User Story Dependencies

- **User Story 1 (P1)**: Core - no dependencies, must complete first
- **User Story 2 (P1)**: Extends US1 (banner persistence) - depends on US1
- **User Story 3 (P2)**: Extends US1 (banner removal) - depends on US1
- **User Story 4 (P3)**: Extends US3 (reconnection) - depends on US3

### Parallel Opportunities

Within Foundational:
- T005 and T006 can run in parallel (different files)

Within Backend Logging:
- T023 and T024 can run in parallel (different methods)

Backend vs Frontend:
- Phase 7 (Backend) can run in parallel with Phases 3-6 (Frontend)

---

## Parallel Example: Foundational Phase

```bash
# Launch in parallel:
Task: "Create RemoteSessionBanner.tsx component skeleton"
Task: "Create remote-session-banner.css with fixed top banner styling"
```

## Parallel Example: Backend + Frontend

```bash
# Launch in parallel:
Task: "Add structured audit log for remote_session_started" (Backend)
Task: "Update handleRemoteSessionAutoStart in remote-access-store.ts" (Frontend)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (verification)
2. Complete Phase 2: Foundational (component structure)
3. Complete Phase 3: User Story 1 (banner appears with agent name)
4. **STOP and VALIDATE**: Test that banner appears when session starts
5. Demo to stakeholders

### Incremental Delivery

1. Setup + Foundational → Infrastructure ready
2. Add User Story 1 → Banner appears (MVP!)
3. Add User Story 2 → Banner persists
4. Add User Story 3 → Banner clears on end
5. Add User Story 4 → Reconnection handled
6. Add Backend Logging → Audit trail complete
7. Polish → Edge cases handled

---

## Summary

| Metric | Value |
|--------|-------|
| **Total Tasks** | 29 |
| **Setup Tasks** | 3 |
| **Foundational Tasks** | 4 |
| **US1 Tasks** | 5 |
| **US2 Tasks** | 4 |
| **US3 Tasks** | 3 |
| **US4 Tasks** | 3 |
| **Backend Tasks** | 3 |
| **Polish Tasks** | 4 |
| **Parallel Opportunities** | 8 tasks marked [P] |
| **MVP Scope** | Phases 1-3 (12 tasks) |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- Each user story independently testable after completion
- Backend logging (Phase 7) can proceed in parallel with frontend work
- Commit after each task or logical group
- Stop at any checkpoint to validate independently
