# Tasks: WhatsApp-Style Local Cache & Media Architecture

**Input**: Design documents from `/specs/001-whatsapp-local-cache/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Tests are OPTIONAL - not explicitly requested in the specification.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

---

## ⛔ NON-NEGOTIABLE CONSTRAINTS (Lazy Chat-Scoped Cache)

> **No chat data is downloaded unless the user opens that chat.**

### App Startup (IT Agent + Requester)
- ❌ **NEVER** download messages or media on app startup
- ✅ Only load: chat list metadata (IDs, titles, unread count) — NO message content

### Chat Open
- Download messages **only for the currently opened chat**
- Fetch **only missing messages** since last local checkpoint (`sinceSequence`)
- Initial load limited to **50 messages max** (older loaded on scroll)

### Scroll / Pagination
- Load older messages **only when user scrolls up**
- **Never prefetch other chats** — only the active chat

### Cache-First
- Always read from IndexedDB first
- If data exists locally → **skip network request**

### Media
- Media blobs are **never included** in message API responses
- Download media **only when the user views it** (enters viewport)
- Prefetch is **viewport-only** within the **current chat only**

### Requester App – Optional Full Download
- Full sync is **disabled by default**
- User must explicitly enable via Settings
- Uses same per-chat lazy sync logic (iterates chats, not bulk API)

### Backend API Rules
- All message endpoints **require `request_id`** (no bulk fetch)
- No "get all messages across all chats" endpoint exists or will be created

---

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5)
- Include exact file paths in descriptions

## Path Conventions

- **Backend**: `src/backend/`
- **IT App (Next.js)**: `src/it-app/`
- **Requester App (Tauri)**: `src/requester-app/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies and establish base cache structure

- [X] T001 [P] Install IT App dependencies: `bun add idb @tanstack/react-virtual` in `src/it-app/`
- [X] T002 [P] Install Requester App dependency: `npm install @tanstack/solid-virtual` in `src/requester-app/`
- [X] T003 [P] Create shared cache schema types in `src/it-app/lib/cache/schemas.ts` (copy from `specs/001-whatsapp-local-cache/contracts/cache-schema.ts`)
- [X] T004 [P] Create shared cache schema types in `src/requester-app/src/src/lib/cache/schemas.ts` (copy from contracts)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend delta sync API - MUST be complete before any frontend caching can work

**CRITICAL**: No user story work can begin until this phase is complete

### Backend API Changes

- [X] T005 Add `since_sequence`, `start_sequence`, `end_sequence` query parameters to `get_messages()` in `src/backend/api/v1/endpoints/chat.py`
- [X] T006 Add parameter validation logic to reject invalid parameter combinations (e.g., `since_sequence` + `before_sequence`) in `src/backend/api/v1/endpoints/chat.py`
- [X] T007 Update `get_messages_cursor_paginated()` in `src/backend/services/chat_service.py` to pass new parameters to repository
- [X] T008 Implement delta sync query mode (`sequence_number > since_sequence`) in `find_by_request_id_cursor_paginated()` in `src/backend/repositories/chat_repository.py`
- [X] T009 Implement range query mode (`sequence_number >= start AND <= end`) for gap filling in `src/backend/repositories/chat_repository.py`
- [X] T010 Add response headers `X-Newest-Sequence`, `X-Oldest-Sequence`, `X-Has-Newer` to `get_messages()` in `src/backend/api/v1/endpoints/chat.py`

### IT App Proxy Routes

- [X] T011 Add Next.js API route for delta sync: `src/it-app/app/api/chat/messages/request/[requestId]/route.ts` - ensure it passes new query params to backend

**Checkpoint**: Backend delta sync API ready - frontend cache implementation can begin

---

## Phase 3: User Story 1 - Instant Chat Loading (Priority: P1) 🎯 MVP

**Goal**: Messages appear within 100ms from local cache when opening a previously viewed chat

**Independent Test**: Open a chat with existing messages, close and reopen - messages should appear instantly without network spinner

### IT App Cache Layer (Core)

- [X] T012 [US1] Create IndexedDB wrapper with schema versioning in `src/it-app/lib/cache/db.ts`
- [X] T013 [US1] Implement `MessageCache` class with CRUD operations in `src/it-app/lib/cache/message-cache.ts`
- [X] T014 [US1] Implement `SyncEngine` class in `src/it-app/lib/cache/sync-engine.ts`
- [X] T015 [US1] Create cache client API wrapper in `src/it-app/lib/api/chat-cache.ts`

### IT App Integration

- [X] T016 [US1] Update `RequestDetailContext` in `src/it-app/app/(it-pages)/support-center/requests/(details)/[id]/_context/request-detail-context.tsx`
- [X] T017 [US1] Integrate cache writes into SignalR `onNewMessage` handler in `src/it-app/lib/signalr/signalr-manager.ts`
- [X] T018 [US1] Integrate cache writes into SignalR `onReconnected` handler in `src/it-app/lib/signalr/signalr-manager.ts`

### Requester App Cache Enhancements

- [X] T019 [P] [US1] Add `addMessagesBatch(messages)` method to existing `MessageCache` in `src/requester-app/src/src/lib/message-cache.ts`
- [X] T020 [P] [US1] Add `lastSyncedAt` timestamp to `ChatMeta` interface in `src/requester-app/src/src/lib/message-cache.ts`
- [X] T021 [US1] Create `SyncEngine` class in `src/requester-app/src/src/lib/sync-engine.ts`
- [X] T022 [US1] Update chat API calls in Requester App to support `sinceSequence` parameter
- [X] T023 [US1] Integrate delta sync into SignalR reconnection handler in `src/requester-app/src/src/signalr/signalr-context.tsx`

**Checkpoint**: Both apps load messages from cache instantly; delta sync fetches only new messages

---

## Phase 4: User Story 2 - Offline Message Composition (Priority: P2)

**Goal**: Users can compose and queue messages when offline; messages send automatically when online

**Independent Test**: Disable network, compose and send messages, see "pending" status, re-enable network, messages send automatically

### Offline Queue Implementation

- [X] T024 [P] [US2] Add `offline_queue` IndexedDB store to IT App schema in `src/it-app/lib/cache/db.ts` (upgrade to v3)
- [X] T025 [P] [US2] Add `offline_queue` IndexedDB store to Requester App schema in `src/requester-app/src/src/lib/message-cache.ts` (upgrade to v3)
- [X] T026 [US2] Implement offline queue operations in IT App `SyncEngine`
- [X] T027 [US2] Implement offline queue operations in Requester App `SyncEngine`

### Network Status Detection

- [X] T028 [US2] Add network status listener in IT App `src/it-app/lib/cache/sync-engine.ts`
- [X] T029 [US2] Add network status listener in Requester App `src/requester-app/src/src/lib/sync-engine.ts`

### Optimistic UI Updates

- [X] T030 [US2] Update IT App message sending to support optimistic updates
- [X] T031 [US2] Update Requester App message sending for optimistic updates
- [X] T032 [US2] Implement retry UI for failed messages in IT App
- [X] T033 [US2] Implement retry UI for failed messages in Requester App

**Checkpoint**: Offline message composition works; pending messages persist and send on reconnection

---

## Phase 5: User Story 3 - Media Caching (Priority: P2)

**Goal**: Previously viewed images/files load instantly from local cache

**Independent Test**: View an image in chat, navigate away, return - image displays without network request

### Media Cache Infrastructure

- [X] T034 [P] [US3] Add `media_meta` and `media_blobs` IndexedDB stores to IT App schema in `src/it-app/lib/cache/db.ts`
- [X] T035 [P] [US3] Add `media_meta` and `media_blobs` IndexedDB stores to Requester App in `src/requester-app/src/src/lib/message-cache.ts`
- [X] T036 [US3] Implement `MediaManager` class in `src/it-app/lib/cache/media-manager.ts`:
  - `downloadMedia(meta)` - download and cache media blob
  - `getMediaUrl(requestId, filename)` - return cached blob URL or null
  - `isMediaCached(requestId, filename)` - check cache status
  - `getCacheSize()` - return total media cache size
- [X] T037 [US3] Implement `MediaManager` class in `src/requester-app/src/src/lib/media-manager.ts`:
  - Same interface as IT App
  - Extend existing image-cache-context.tsx patterns

### LRU Eviction

- [X] T038 [US3] Implement LRU eviction in IT App `MediaManager`:
  - Trigger when cache > 90MB (of 100MB limit)
  - Evict by `lastAccessedAt` ascending
  - Target 80MB after eviction
- [X] T039 [US3] Implement LRU eviction in Requester App `MediaManager`:
  - Trigger when cache > 450MB (of 500MB limit)
  - Honor pinned media (never evict)
  - Target 400MB after eviction

### Media Integration

- [X] T040 [US3] Integrate media cache into IT App screenshot/attachment display components:
  - Check cache first → return blob URL if cached
  - Download **only when image enters viewport** (IntersectionObserver)
  - Cache blob after download
- [X] T041 [US3] Integrate media cache into Requester App image display (extend image-cache-context.tsx):
  - Same viewport-triggered download pattern as IT App
- [X] T042 [US3] Add viewport-aware media loading in IT App:
  - ⚠️ **CONSTRAINT**: Only prefetch media for messages **visible in the current chat viewport**
  - Do NOT prefetch media for other chats
  - Do NOT prefetch media for messages not yet scrolled into view
- [X] T043 [US3] Add viewport-aware media loading in Requester App:
  - Same constraints as T042

### Pin/Unpin Support (Desktop Only)

- [X] T044 [US3] Add `pinMedia(requestId, filename)` and `unpinMedia()` to Requester App `MediaManager`

**Checkpoint**: Media loads from cache; LRU eviction keeps storage within limits

---

## Phase 6: User Story 4 - Large Chat Performance (Priority: P3)

**Goal**: Smooth 60 FPS scrolling with 5000+ messages; memory stays under 50MB

**Independent Test**: Load chat with 1000+ messages, scroll quickly, verify no stuttering

### Virtualized Message List

- [ ] T045 [US4] Create `VirtualizedMessageList` component in `src/it-app/app/(it-pages)/support-center/requests/(details)/[id]/_components/virtualized-message-list.tsx`:
  - Use `@tanstack/react-virtual` with dynamic row heights
  - Implement `measureElement` for variable-height messages
  - Overscan: 10 items above/below viewport
- [ ] T046 [US4] Replace existing message list with `VirtualizedMessageList` in IT App chat UI
- [ ] T047 [US4] Create virtualized message list component for Requester App using `@tanstack/solid-virtual` in `src/requester-app/src/src/components/chat/virtualized-message-list.tsx`
- [ ] T048 [US4] Integrate virtualized list into Requester App chat view

### Scroll Position Management

- [ ] T049 [US4] Implement scroll position restoration on cache load in IT App:
  - Store last scroll position per chat
  - Restore position when reopening chat
- [ ] T050 [US4] Implement scroll position restoration in Requester App

### Memory Optimization

- [ ] T051 [US4] Implement paginated IndexedDB reads in IT App `MessageCache`:
  - Read messages in chunks (100 at a time)
  - Load more on scroll near boundaries
- [ ] T052 [US4] Implement paginated IndexedDB reads in Requester App `MessageCache`

**Checkpoint**: Large chats scroll smoothly at 60 FPS; memory stays under 50MB

---

## Phase 7: User Story 5 - Sync State Recovery (Priority: P3)

**Goal**: Sync state persists across app restarts; stale cache triggers automatic resync

**Independent Test**: Close app, reopen, verify messages load from cache and only delta is fetched

### TTL and Stale Cache Handling

- [X] T053 [US5] Implement cache expiry check in IT App `SyncEngine`:
  - Check `lastSyncedAt` on chat open
  - Trigger full resync if > 7 days old
- [X] T054 [US5] Implement cache expiry check in Requester App `SyncEngine`
- [X] T055 [US5] Implement gap threshold detection in IT App:
  - Count gaps in `ChatSyncState.knownGaps`
  - Trigger full resync if > 10 gaps
- [X] T056 [US5] Implement gap threshold detection in Requester App

### Schema Migration

- [X] T057 [US5] Implement schema version check on app startup in IT App:
  - Compare `DB_VERSION` constant
  - Clear and rebuild cache on mismatch
- [X] T058 [US5] Implement schema version check in Requester App

### Cache Cleanup

- [X] T059 [US5] Implement `cleanupExpiredCache()` in IT App `MessageCache`:
  - Remove chats older than TTL (7 days)
  - Run on app startup
- [X] T060 [US5] Implement `cleanupExpiredCache()` in Requester App `MessageCache`
- [X] T061 [US5] Implement `evictOldestChats(bytesToFree)` in IT App `MessageCache`:
  - LRU eviction by `lastAccessedAt`
- [X] T062 [US5] Implement `evictOldestChats(bytesToFree)` in Requester App `MessageCache`

**Checkpoint**: Sync state persists; stale data auto-refreshes; schema changes handled gracefully

---

## Phase 8: Desktop Settings UI (Requester App Only)

**Purpose**: User-facing cache management for desktop app (FR-010 to FR-012, FR-030, FR-032)

### Cache Statistics & Management

- [X] T063 Create `CacheSettings` component in `src/requester-app/src/src/components/settings/cache-settings.tsx`:
  - Display storage usage percentage with progress bar
  - Show total size, hit rate, last sync timestamp
  - Show per-chat breakdown (message count, media size)
- [X] T064 Add "Clear All Cache" button functionality in `CacheSettings`:
  - Confirmation dialog
  - Call `messageCache.clearAll()` and `mediaManager.evictAll()`
- [X] T065 Add "Clear by Date Range" functionality in `CacheSettings`:
  - Date range picker UI
  - Call `messageCache.clearByDateRange(startDate, endDate)`
- [X] T066 Implement `clearByDateRange(start, end)` in Requester App `MessageCache`
- [X] T067 Implement `getDetailedStats()` in Requester App for per-chat breakdown:
  - Message count per chat
  - Media size per chat
  - Last accessed date per chat
- [X] T068 Integrate `CacheSettings` into Requester App settings page

### Optional Full Download (User-Initiated Only)

- [X] T069 Add "Download All Chats" toggle in `CacheSettings`:
  - ⚠️ **CONSTRAINT**: Disabled by default
  - Show warning: "This will download all chat history and may use significant storage"
  - Requires explicit user confirmation
- [X] T070 Implement `fullDownloadAllChats()` in Requester App `SyncEngine`:
  - Iterate through chat list (get IDs only)
  - For each chat: call `syncChat(requestId)` sequentially (NOT parallel bulk)
  - Show progress indicator (X of Y chats synced)
  - Respect 500MB storage limit — stop if limit reached
- [X] T071 Add cancel button for full download in progress
- [X] T072 Persist "full download enabled" preference in settings.json:
  - If enabled: run full sync on app startup (after chat list loads)
  - If disabled (default): lazy per-chat sync only

**Checkpoint**: Desktop users can view cache stats, manage storage, and optionally enable full download

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Logging, error handling, and final integration

### Logging & Statistics

- [X] T073 [P] Add cache operation logging (sync start/complete, eviction, errors) to IT App
- [X] T074 [P] Add cache operation logging to Requester App
- [X] T075 Implement cache statistics tracking (`CacheStats` singleton) in IT App:
  - Track hits/misses for hit rate calculation
  - Update on every cache read
- [X] T076 Implement cache statistics tracking in Requester App

### Cache-First Verification

- [X] T077 Add cache-first strategy verification:
  - Ensure cached messages display before network response
  - Add performance timing logs

### Lazy Loading Verification (CRITICAL)

- [X] T078 ⚠️ Verify IT App startup network traffic:
  - Open DevTools Network tab
  - Start app fresh (clear cache)
  - Verify: NO message API calls on startup
  - Verify: Only chat list metadata loaded
- [X] T079 ⚠️ Verify Requester App startup network traffic:
  - Same verification as T078
- [X] T080 ⚠️ Verify no cross-chat downloads:
  - Open Chat A, verify only Chat A messages fetched
  - Navigate to Chat B, verify only Chat B messages fetched
  - Return to Chat A, verify NO new network request (cache hit)
- [X] T081 ⚠️ Verify media lazy loading:
  - Open chat with images
  - Verify: Images only download when scrolled into viewport
  - Verify: No media downloads for chats not opened

### Final Validation

- [X] T082 Run quickstart.md validation - test all manual testing scenarios
- [X] T083 Verify success criteria:
  - SC-001: Cache load < 100ms
  - SC-002: Delta sync reduces payload by 80%+
  - SC-006: Startup with 10k messages < 2s
  - SC-007: Memory with 10k messages < 50MB

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup (no dependencies)
    │
    ▼
Phase 2: Foundational - Backend API (blocks all frontend work)
    │
    ├──────────────────┬──────────────────┐
    ▼                  ▼                  ▼
Phase 3: US1       Phase 4: US2       Phase 5: US3
(P1 - MVP)         (P2)               (P2)
    │                  │                  │
    └────────┬─────────┴──────────────────┘
             ▼
         Phase 6: US4 (P3) - requires cache from US1
             │
             ▼
         Phase 7: US5 (P3) - requires sync from US1
             │
             ▼
         Phase 8: Desktop Settings (Requester App only)
             │
             ▼
         Phase 9: Polish
```

### User Story Dependencies

- **US1 (P1)**: Depends only on Phase 2 (Backend API) - MVP deliverable
- **US2 (P2)**: Depends on US1 cache infrastructure (T012-T014)
- **US3 (P2)**: Depends on US1 IndexedDB schema (T012)
- **US4 (P3)**: Depends on US1 message cache working
- **US5 (P3)**: Depends on US1 sync engine working

### Parallel Opportunities

**Phase 1** - All tasks can run in parallel:
```
T001 (IT App deps) || T002 (Requester deps) || T003 (IT schema) || T004 (Requester schema)
```

**Phase 2** - Sequential within phase (backend changes):
```
T005 → T006 → T007 → T008 → T009 → T010 → T011
```

**Phase 3** - IT App and Requester App work in parallel:
```
IT App:      T012 → T013 → T014 → T015 → T016 → T017 → T018
Requester:   T019 || T020 → T021 → T022 → T023
```

**Phase 4-5** - Can run in parallel after US1 checkpoint:
```
US2 (Offline): T024 || T025 → T026 || T027 → T028 || T029 → T030 || T031 → T032 || T033
US3 (Media):   T034 || T035 → T036 || T037 → T038 || T039 → T040 || T041 → T042 || T043 → T044
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (dependencies)
2. Complete Phase 2: Backend API changes
3. Complete Phase 3: User Story 1 (Instant Chat Loading)
4. **STOP and VALIDATE**: Messages load from cache < 100ms
5. Deploy if ready - this alone delivers significant value

### Incremental Delivery

1. **MVP**: Setup + Foundational + US1 → Instant loading (biggest impact)
2. **+Offline**: Add US2 → Offline support for unreliable networks
3. **+Media**: Add US3 → Cached images load instantly
4. **+Performance**: Add US4 → Large chats scroll smoothly
5. **+Recovery**: Add US5 → Robust sync state management
6. **+Settings**: Add Phase 8 → Desktop users manage cache
7. **Polish**: Phase 9 → Logging, metrics, verification

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- IT App changes require `bun` commands (not npm)
- Requester App uses existing IndexedDB patterns - extend, don't rewrite
- Backend schemas inherit from `HTTPSchemaModel`
- All Next.js API calls go through `/api/*` routes (never direct to backend)
