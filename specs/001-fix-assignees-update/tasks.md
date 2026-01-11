# Tasks: Fix Assignees List Update Bug

**Input**: Design documents from `/specs/001-fix-assignees-update/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: No automated tests requested - manual verification via quickstart.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Path Conventions

- **Backend**: `src/backend/` at repository root
- **Frontend (it-app)**: `src/it-app/` at repository root

---

## Phase 1: Setup (Preparation)

**Purpose**: Verify environment and understand current code state

- [ ] T001 Verify backend server is running with `uvicorn main:app --reload` in src/backend/
- [ ] T002 Verify frontend dev server is running with `bun run dev` in src/it-app/
- [ ] T003 [P] Create a test service request with 2 existing assignees for validation

**Checkpoint**: Development environment ready for implementation

---

## Phase 2: User Story 1 - Correct Assignees Display After Update (Priority: P1) 🎯

**Goal**: Fix UI state bug where existing assignees disappear when adding new ones

**Independent Test**: Assign multiple technicians sequentially and verify all remain visible without page reload

### Implementation for User Story 1

- [X] T004 [US1] Fix SWR state mutation in addAssignee function in src/it-app/lib/hooks/use-request-assignees.ts:255-267
  - Change `.map()` to use `findIndex()` + conditional append
  - If assignee exists: replace with server data
  - If assignee missing: append server data and increment total

- [X] T005 [US1] Verify dropdown filter excludes already-assigned users in src/it-app/app/(it-pages)/support-center/requests/(details)/[id]/_components/ticket-metadata-sidebar.tsx
  - Confirm `availableTechnicians` filters out users where `assignees.some(a => a.userId === t.id)`
  - Fix if filter is missing or incorrect

- [ ] T006 [US1] Manual test: Add User1 to empty request - verify User1 appears in UI

- [ ] T007 [US1] Manual test: Add User2 to request with User1 - verify BOTH User1 AND User2 appear (no page reload)

- [ ] T008 [US1] Manual test: Add User3 to request with User1+User2 - verify all THREE users appear (no page reload)

- [ ] T009 [US1] Manual test: Refresh page - verify all three users still displayed

**Checkpoint**: User Story 1 complete - all assignees display correctly after adding without page reload

---

## Phase 3: User Story 2 - Notification for All New Assignees (Priority: P1)

**Goal**: Fix backend to trigger ticket_assigned notification for every new assignee, not just the first

**Independent Test**: Assign technician to request that already has assignees and verify notification is received

### Implementation for User Story 2

- [X] T010 [US2] Remove `is_first_assignment` condition for notification trigger in src/backend/api/v1/endpoints/requests.py:991-1002
  - Keep `is_first_assignment` variable (used for status change logic)
  - Remove `if is_first_assignment:` wrapper around notification trigger
  - Notification should always trigger for the newly added technician

- [ ] T011 [US2] Manual test: Assign User1 to empty request - verify User1 receives ticket_assigned notification

- [ ] T012 [US2] Manual test: Assign User2 to request with User1 - verify User2 receives notification (User1 does NOT receive duplicate)

- [ ] T013 [US2] Manual test: Assign User3 to request with User1+User2 - verify User3 receives notification (User1, User2 do NOT receive duplicates)

- [ ] T014 [US2] Manual test: Remove User1, then re-add User1 - verify User1 receives NEW notification (FR-007)

**Checkpoint**: User Story 2 complete - all new assignees receive notifications

---

## Phase 4: Polish & Validation

**Purpose**: Final verification and cleanup

- [ ] T015 Run full quickstart.md test scenarios in specs/001-fix-assignees-update/quickstart.md
- [X] T016 Verify no TypeScript errors with `bun run build` in src/it-app/
- [ ] T017 Verify no Python errors by checking backend logs for exceptions
- [X] T018 [P] Update spec.md status from "Draft" to "Complete" in specs/001-fix-assignees-update/spec.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **User Story 1 (Phase 2)**: Depends on Setup - frontend fix only
- **User Story 2 (Phase 3)**: Depends on Setup - backend fix only
- **Polish (Phase 4)**: Depends on both User Story 1 AND User Story 2

### User Story Independence

- **User Story 1 (P1)**: Frontend-only fix - can be implemented independently
- **User Story 2 (P1)**: Backend-only fix - can be implemented independently
- **Both stories have same priority (P1)** and can be worked in parallel

### Parallel Opportunities

```bash
# User Story 1 and User Story 2 can run in parallel (different codebases):
# Developer A: T004, T005, T006-T009 (Frontend)
# Developer B: T010, T011-T014 (Backend)
```

---

## Implementation Strategy

### MVP First Approach

Since both stories are P1 (critical bugs), implement both:

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: User Story 1 (T004-T009) **OR** Phase 3: User Story 2 (T010-T014)
3. Complete the other user story
4. Complete Phase 4: Polish (T015-T018)

### Parallel Execution (Recommended)

1. Complete Setup (T001-T003)
2. **In Parallel**:
   - Frontend developer: User Story 1 (T004-T009)
   - Backend developer: User Story 2 (T010-T014)
3. Both complete → Run Polish phase (T015-T018)

---

## Task Summary

| Phase | Tasks | Focus |
|-------|-------|-------|
| Setup | T001-T003 | Environment preparation |
| User Story 1 | T004-T009 | Frontend SWR fix |
| User Story 2 | T010-T014 | Backend notification fix |
| Polish | T015-T018 | Validation and cleanup |

**Total Tasks**: 18
**Parallel Opportunities**: User Story 1 and User Story 2 can run simultaneously

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Both user stories are independently testable
- Commit after each implementation task (T004, T005, T010)
- Manual tests (T006-T009, T011-T014) validate each fix works correctly
- Stop at any checkpoint to validate story independently
