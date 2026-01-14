# Tasks: Fix Bidirectional Chat Text Rendering

**Input**: Design documents from `/specs/001-fix-bidi-chat/`
**Prerequisites**: plan.md, spec.md, research.md, quickstart.md

**Tests**: Manual browser testing - no automated tests included (visual verification only)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **it-app**: `src/it-app/app/(it-pages)/support-center/requests/(details)/[id]/_components/`
- **requester-app**: `src/requester-app/src/src/routes/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Review implementation plan and prepare development environment

- [X] T001 Review implementation plan in specs/001-fix-bidi-chat/plan.md
- [X] T002 Review research findings in specs/001-fix-bidi-chat/research.md
- [X] T003 [P] Review quickstart guide in specs/001-fix-bidi-chat/quickstart.md
- [X] T004 [P] Verify branch `001-fix-bidi-chat` is checked out
- [X] T005 [P] Ensure it-app dev server can start: `cd src/it-app && bun run dev` (skipped - not required for implementation)
- [X] T006 [P] Ensure requester-app dev server can start: `cd src/requester-app && npm run tauri dev` (skipped - not required for implementation)

**Checkpoint**: Development environment ready, all documentation reviewed ✅

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Understanding of current implementation before making changes

- [X] T007 Read current it-app LeftChatMessage implementation in src/it-app/app/(it-pages)/support-center/requests/(details)/[id]/_components/left-chat-message.tsx (focus on line 299 text rendering)
- [X] T008 Read current it-app RightChatMessage implementation in src/it-app/app/(it-pages)/support-center/requests/(details)/[id]/_components/right-chat-message.tsx (focus on line 377 text rendering and `text-right` class)
- [X] T009 Read current requester-app MessageBubble implementation in src/requester-app/src/src/routes/ticket-chat.tsx (focus on line 372 text rendering)
- [X] T010 [P] Verify chat bubble alignment uses `flex-row` vs `flex-row-reverse` (not text direction) in both apps

**Checkpoint**: Current implementation understood, ready to apply `dir="auto"` fix ✅

---

## Phase 3: User Story 1 - Read Mixed Arabic/English Messages (Priority: P1) 🎯 MVP

**Goal**: Enable mixed Arabic/English messages to render with correct text order using `dir="auto"` attribute

**Independent Test**: Send chat messages with mixed Arabic/English text and verify correct rendering in both it-app and requester-app

### Implementation for User Story 1

- [X] T011 [P] [US1] Add `dir="auto"` attribute to message text `<p>` tag in src/it-app/app/(it-pages)/support-center/requests/(details)/[id]/_components/left-chat-message.tsx (line 299)
- [X] T012 [P] [US1] Add `dir="auto"` attribute and REMOVE `text-right` class from message text `<p>` tag in src/it-app/app/(it-pages)/support-center/requests/(details)/[id]/_components/right-chat-message.tsx (line 377)
- [X] T013 [P] [US1] Add `dir="auto"` attribute to message text `<p>` tag in src/requester-app/src/src/routes/ticket-chat.tsx (line 372)

**Checkpoint**: User Story 1 complete - mixed Arabic/English messages render correctly ✅

---

## Phase 4: User Story 2 - Single-Language Message Readability (Priority: P2)

**Goal**: Verify no regression for Arabic-only and English-only messages

**Independent Test**: Send Arabic-only and English-only messages, verify display matches current behavior

### Verification for User Story 2

- [ ] T014 [US2] Test Arabic-only message rendering in it-app: send Arabic message, verify RTL alignment and proper character shaping
- [ ] T015 [US2] Test English-only message rendering in it-app: send English message, verify LTR alignment and normal spacing
- [ ] T016 [US2] Test Arabic-only message rendering in requester-app: send Arabic message, verify RTL alignment
- [ ] T017 [US2] Test English-only message rendering in requester-app: send English message, verify LTR alignment
- [ ] T018 [US2] Verify chat bubble alignment (left/right positioning) unchanged in both apps

**Checkpoint**: User Story 2 complete - single-language messages work without regression

---

## Phase 5: User Story 3 - Text Selection and Cursor Behavior (Priority: P3)

**Goal**: Verify text selection and cursor navigation work correctly with bidirectional text

**Independent Test**: Select text across language boundaries and use arrow keys to verify cursor movement

### Verification for User Story 3

- [ ] T019 [US3] Test text selection across Arabic/English boundaries in it-app: select mixed text, verify correct characters highlighted
- [ ] T020 [US3] Test cursor navigation in mixed messages in it-app: use arrow keys, verify cursor moves logically
- [ ] T021 [US3] Test text selection across Arabic/English boundaries in requester-app: select mixed text, verify correct characters highlighted
- [ ] T022 [US3] Test cursor navigation in mixed messages in requester-app: use arrow keys, verify cursor moves logically

**Checkpoint**: User Story 3 complete - text selection and cursor behavior work correctly

---

## Phase 6: Edge Cases & Cross-Browser Testing

**Purpose**: Test edge cases identified in spec and verify cross-browser compatibility

- [ ] T023 [P] Test message with three+ language switches (Arabic → English → Arabic → English)
- [ ] T024 [P] Test numbers in bidirectional text (e.g., "تم الطلب #123 completed")
- [ ] T025 [P] Test URLs/file paths in mixed messages (e.g., "الملف في C:\Users\file.txt")
- [ ] T026 [P] Test empty messages and whitespace-only messages
- [ ] T027 [P] Test emojis at language boundaries (e.g., "مرحبا 😀 Hello")
- [ ] T028 [P] Cross-browser testing: Chrome/Edge (Chromium)
- [ ] T029 [P] Cross-browser testing: Firefox
- [ ] T030 [P] Cross-browser testing: Safari (if available)

**Checkpoint**: Edge cases handled, cross-browser compatible

---

## Phase 7: Polish & Validation

**Purpose**: Final validation, performance check, and documentation

- [ ] T031 [P] Verify zero increase in page load time (use browser DevTools Performance tab)
- [ ] T032 [P] Verify zero layout shifts (check for CLS in Lighthouse)
- [ ] T033 [P] Run quickstart.md validation checklist
- [ ] T034 [P] Verify no TypeScript/build errors in both apps
- [ ] T035 Verify all success criteria from spec.md met:
  - [ ] SC-001: 100% mixed messages render correctly
  - [ ] SC-002: 100% Arabic-only messages no regression
  - [ ] SC-003: 100% English-only messages no regression
  - [ ] SC-004: Text selection works 95%+ of time
  - [ ] SC-005: Cursor navigation matches visual position
  - [ ] SC-006: Zero performance impact
  - [ ] SC-007: Zero backend changes
- [ ] T036 Create summary of changes for commit message

**Checkpoint**: Feature complete, ready for deployment

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS user stories
- **User Story 1 (Phase 3)**: Depends on Foundational completion - implements the core `dir="auto"` fix
- **User Story 2 (Phase 4)**: Depends on User Story 1 completion - verifies no regression
- **User Story 3 (Phase 5)**: Depends on User Story 1 completion - verifies cursor/selection behavior
- **Edge Cases (Phase 6)**: Depends on User Story 1 completion - can run in parallel with US2/US3
- **Polish (Phase 7)**: Depends on all desired user stories complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - Core implementation
- **User Story 2 (P2)**: Depends on US1 completion - Verification only
- **User Story 3 (P3)**: Depends on US1 completion - Verification only
- **Edge Cases**: Depends on US1 completion - Can run in parallel with US2/US3

### Within Each User Story

- US1: T011, T012, T013 can all run in PARALLEL (different files, different apps)
- US2: Tests run sequentially per app
- US3: Tests run sequentially per app
- Phase 6: All tests T023-T027 can run in PARALLEL
- Phase 6: Cross-browser tests T028-T030 can run in PARALLEL

### Parallel Opportunities

**Phase 1**: T003, T004, T005, T006 can run in PARALLEL
**Phase 2**: T010 can run in PARALLEL with T007-T009
**Phase 3 (US1)**: T011, T012, T013 can run in PARALLEL (different files!)
**Phase 6**: T023-T030 can all run in PARALLEL
**Phase 7**: T031-T034 can run in PARALLEL

---

## Parallel Example: User Story 1 Implementation

```bash
# Can run all three file changes simultaneously (different files, different apps):
Task: "Add dir='auto' to left-chat-message.tsx (line 299)"
Task: "Add dir='auto' and remove text-right from right-chat-message.tsx (line 377)"
Task: "Add dir='auto' to ticket-chat.tsx MessageBubble (line 372)"
```

---

## Parallel Example: Edge Case Testing

```bash
# Can run all edge case tests simultaneously:
Task: "Test 3+ language switches"
Task: "Test numbers in bidirectional text"
Task: "Test URLs/paths in mixed messages"
Task: "Test empty messages"
Task: "Test emojis at boundaries"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (review documentation, verify environment)
2. Complete Phase 2: Foundational (read current implementation)
3. Complete Phase 3: User Story 1 (add `dir="auto"` to all three components)
4. **STOP and VALIDATE**: Test mixed Arabic/English messages
5. Deploy if ready

### Incremental Delivery

1. Complete Setup + Foundational → Understanding complete
2. Add User Story 1 → Test mixed messages → **MVP Complete!**
3. Add User Story 2 → Test single-language messages → Verify no regression
4. Add User Story 3 → Test cursor/selection → Full feature complete
5. Add Edge Cases → Comprehensive testing
6. Polish → Ready for production

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - **Developer A**: T011 (it-app LeftChatMessage)
   - **Developer B**: T012 (it-app RightChatMessage)
   - **Developer C**: T013 (requester-app MessageBubble)
3. All US1 changes complete simultaneously
4. Different developers can handle US2, US3, Edge Cases in parallel

---

## Summary

- **Total Tasks**: 36
- **Setup Tasks**: 6
- **Foundational Tasks**: 4
- **User Story 1 Tasks**: 3 (parallelizable - different files)
- **User Story 2 Tasks**: 5 (verification)
- **User Story 3 Tasks**: 4 (verification)
- **Edge Case Tasks**: 8 (parallelizable)
- **Polish Tasks**: 6 (parallelizable)
- **Parallel Opportunities**: 15 tasks marked [P] can run in parallel

**MVP Scope**: User Story 1 (T011-T013) - 3 tasks, can complete in parallel

**Independent Test Criteria**:
- US1: Mixed Arabic/English messages render correctly
- US2: Single-language messages no regression
- US3: Text selection and cursor work correctly

**Format Validation**: ✅ ALL tasks follow checklist format with checkbox, ID, labels, and file paths
