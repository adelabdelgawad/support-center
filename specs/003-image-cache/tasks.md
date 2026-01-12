# Tasks: Local Image Caching with Blurred Thumbnails

**Input**: Design documents from `/specs/003-image-cache/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested - excluded from task list.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

All paths relative to `src/requester-app/src/`:
- **Rust backend**: `src-tauri/src/`
- **TypeScript frontend**: `src/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project structure and type definitions

- [ ] T001 Add cache-related types to src/types/index.ts (ImageCacheMetadata, CacheState, CacheSettings, CacheStats, ValidationResult, DownloadState)
- [ ] T002 [P] Create lib/image-cache/ directory structure with index.ts exporting public API
- [ ] T003 [P] Add constants file src/lib/image-cache/constants.ts (CACHE_LIMIT_BYTES, WARNING_INTERVAL_MS, THUMBNAIL_MAX_SIZE, etc.)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Rust Backend Commands

- [ ] T004 Create src-tauri/src/image_cache.rs module with mod declaration in lib.rs
- [ ] T005 [P] Implement save_cache_file command in src-tauri/src/image_cache.rs
- [ ] T006 [P] Implement validate_cache_files command in src-tauri/src/image_cache.rs
- [ ] T007 [P] Implement delete_cache_file command in src-tauri/src/image_cache.rs
- [ ] T008 [P] Implement get_image_metadata command in src-tauri/src/image_cache.rs
- [ ] T009 [P] Implement save_image_metadata command in src-tauri/src/image_cache.rs
- [ ] T010 [P] Implement mark_image_not_cached command in src-tauri/src/image_cache.rs
- [ ] T011 Register all image_cache commands in src-tauri/src/lib.rs invoke_handler

### TypeScript Service Layer

- [ ] T012 Implement metadata-store.ts in src/lib/image-cache/ (get/save/update metadata via Tauri commands)
- [ ] T013 Implement image-storage.ts in src/lib/image-cache/ (save/validate/delete files via Tauri commands)
- [ ] T014 Implement image-cache-service.ts core class in src/lib/image-cache/ (constructor, getImageState, cacheImage methods)

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Instant Thumbnail Display (Priority: P1) 🎯 MVP

**Goal**: Display blurred thumbnails immediately (<100ms) when opening a chat, regardless of network conditions

**Independent Test**: Open any chat with images and verify thumbnails appear instantly before full images load

### Implementation for User Story 1

- [ ] T015 [US1] Create ChatImage component in src/components/chat/chat-image.tsx with thumbnail display logic
- [ ] T016 [US1] Implement getThumbnailDataUrl method in src/lib/image-cache/image-cache-service.ts
- [ ] T017 [US1] Create ImageCacheContext provider in src/context/image-cache-context.tsx with useImageCache hook
- [ ] T018 [US1] Add getImageState reactive accessor to ImageCacheContext in src/context/image-cache-context.tsx
- [ ] T019 [US1] Integrate ChatImage component with existing chat message rendering (locate and update relevant chat component)
- [ ] T020 [US1] Ensure thumbnailBase64 from message metadata is passed to ChatImage component

**Checkpoint**: User Story 1 complete - thumbnails display instantly when opening any chat

---

## Phase 4: User Story 2 - Automatic Image Caching on Active Chat (Priority: P1)

**Goal**: Auto-download and cache full images when chat is active and Local Storage Images is ON

**Independent Test**: Open chat, receive image from another user, verify image auto-downloads and persists locally

### Implementation for User Story 2

- [ ] T021 [US2] Implement startDownload method with progress tracking in src/lib/image-cache/image-cache-service.ts
- [ ] T022 [US2] Add getDownloadProgress reactive accessor to ImageCacheContext in src/context/image-cache-context.tsx
- [ ] T023 [US2] Implement auto-download trigger on new image message received in SignalR handler (update src/signalr/signalr-context.tsx or relevant file)
- [ ] T024 [US2] Add cacheImage method implementation (download from URL, save via Tauri) in src/lib/image-cache/image-cache-service.ts
- [ ] T025 [US2] Update ChatImage to show cached full image when available in src/components/chat/chat-image.tsx
- [ ] T026 [US2] Add isEnabled check to auto-download logic (respect Local Storage Images setting)

**Checkpoint**: User Story 2 complete - images auto-cache when chat is open

---

## Phase 5: User Story 3 - Manual Download for Non-Cached Images (Priority: P2)

**Goal**: Show download button on thumbnails when full image not cached, allow manual download with progress

**Independent Test**: Receive images while chat closed, open chat, see download buttons, tap to download with progress

### Implementation for User Story 3

- [ ] T027 [US3] Create ImageDownloadButton component in src/components/chat/image-download-button.tsx
- [ ] T028 [US3] Create ImageProgress component in src/components/chat/image-progress.tsx (circular progress indicator)
- [ ] T029 [US3] Update ChatImage to show download button when state is 'not_cached' in src/components/chat/chat-image.tsx
- [ ] T030 [US3] Update ChatImage to show progress indicator when download in progress in src/components/chat/chat-image.tsx
- [ ] T031 [US3] Implement seamless transition from thumbnail to full image after download completes

**Checkpoint**: User Story 3 complete - manual download with progress works

---

## Phase 6: User Story 4 - Sending Images with Immediate Display (Priority: P2)

**Goal**: Sent images appear immediately in chat (<200ms) before upload completes

**Independent Test**: Select and send image, verify it appears instantly while upload indicator shows progress

### Implementation for User Story 4

- [ ] T032 [US4] Implement ThumbnailGenerator class in src/lib/image-cache/thumbnail-generator.ts (Canvas API blur)
- [ ] T033 [US4] Implement cacheOutgoingImage method in src/lib/image-cache/image-cache-service.ts
- [ ] T034 [US4] Integrate cacheOutgoingImage with image send flow (locate and update send message logic)
- [ ] T035 [US4] Display sent image immediately using local file path before upload confirms
- [ ] T036 [US4] Show upload progress indicator on sent images pending server confirmation

**Checkpoint**: User Story 4 complete - sent images appear instantly

---

## Phase 7: User Story 5 - Graceful Recovery from Deleted Files (Priority: P2)

**Goal**: App handles manually deleted cache files gracefully, falls back to thumbnail + download

**Independent Test**: Delete files from cache directory, navigate to affected chat, verify no crashes and recovery works

### Implementation for User Story 5

- [ ] T037 [US5] Implement validateImage method with lazy file existence check in src/lib/image-cache/image-cache-service.ts
- [ ] T038 [US5] Add validation trigger on chat open in ImageCacheContext (validateChat method)
- [ ] T039 [US5] Add validation trigger on image scroll into view (intersection observer or similar)
- [ ] T040 [US5] Ensure validateImage updates metadata silently (isCached=false) without throwing errors
- [ ] T041 [US5] Trigger auto-re-download when isEnabled and files missing (combine with US2 auto-download logic)
- [ ] T042 [US5] Log cache misses as INFO/DEBUG level, not WARN/ERROR in src/lib/image-cache/image-cache-service.ts

**Checkpoint**: User Story 5 complete - graceful recovery from deleted files

---

## Phase 8: User Story 6 - Settings Toggle for Local Storage (Priority: P3)

**Goal**: Users can enable/disable local image caching via settings switch

**Independent Test**: Toggle setting OFF, verify auto-download stops; toggle ON, verify caching resumes

### Implementation for User Story 6

- [ ] T043 [US6] Implement getSettings and updateSettings methods in src/lib/image-cache/image-cache-service.ts
- [ ] T044 [US6] Add isEnabled accessor and toggleEnabled action to ImageCacheContext in src/context/image-cache-context.tsx
- [ ] T045 [US6] Create StorageSettings section component in src/components/settings/storage-settings.tsx
- [ ] T046 [US6] Add "Local Storage Images" toggle switch to StorageSettings component
- [ ] T047 [US6] Integrate StorageSettings into existing settings page in src/routes/settings.tsx
- [ ] T048 [US6] Ensure toggle respects spec: OFF stops auto-download but keeps existing files

**Checkpoint**: User Story 6 complete - settings toggle works correctly

---

## Phase 9: User Story 7 - Selective Cache Clearing (Priority: P3)

**Goal**: Users can clear cached images selectively by chat or date range from settings

**Independent Test**: Cache images in multiple chats, use settings to clear specific chat, verify only that chat cleared

### Rust Backend Commands (for clearing)

- [ ] T049 [US7] Implement get_cache_stats command in src-tauri/src/image_cache.rs
- [ ] T050 [P] [US7] Implement delete_cache_directory command in src-tauri/src/image_cache.rs
- [ ] T051 [P] [US7] Implement clear_chat_cache command in src-tauri/src/image_cache.rs
- [ ] T052 [P] [US7] Implement clear_cache_by_date_range command in src-tauri/src/image_cache.rs
- [ ] T053 [US7] Register clearing commands in src-tauri/src/lib.rs invoke_handler

### TypeScript Implementation

- [ ] T054 [US7] Implement getCacheStats method in src/lib/image-cache/image-cache-service.ts
- [ ] T055 [US7] Implement clearChatCache method in src/lib/image-cache/image-cache-service.ts
- [ ] T056 [US7] Implement clearCacheByDateRange method in src/lib/image-cache/image-cache-service.ts
- [ ] T057 [US7] Create CacheUsageDisplay component in src/components/settings/cache-usage-display.tsx
- [ ] T058 [US7] Create CacheClearDialog component in src/components/settings/cache-clear-dialog.tsx (chat list + date picker)
- [ ] T059 [US7] Integrate cache stats and clearing UI into StorageSettings in src/components/settings/storage-settings.tsx
- [ ] T060 [US7] Add refreshStats action to ImageCacheContext in src/context/image-cache-context.tsx

**Checkpoint**: User Story 7 complete - selective clearing works

---

## Phase 10: Storage Warnings (Cross-Cutting)

**Purpose**: 500MB warning notification every 30 minutes when cache exceeds limit

- [ ] T061 Implement cache-monitor.ts in src/lib/image-cache/ (size tracking, warning timer)
- [ ] T062 Add 'cache_warning' notification type to src/lib/notifications.ts
- [ ] T063 Implement checkAndWarnCacheSize function with 30-minute debounce
- [ ] T064 Trigger cache size check after each image cached (integrate with cacheImage/cacheOutgoingImage)
- [ ] T065 Display cache size in StorageSettings component with visual warning when over limit

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Final integration and cleanup

- [ ] T066 [P] Enhance existing image-viewer.tsx to load from cache when available
- [ ] T067 [P] Add error handling for disk full, permission denied scenarios across all cache operations
- [ ] T068 Update App.tsx to wrap with ImageCacheProvider
- [ ] T069 Ensure all I/O operations are async and non-blocking (audit service methods)
- [ ] T070 Run quickstart.md validation checklist manually
- [ ] T071 Code cleanup: remove any console.log, ensure consistent error handling

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **User Stories (Phase 3-9)**: All depend on Foundational phase completion
  - US1 (P1) and US2 (P1) can run in parallel after Foundation
  - US3-US5 (P2) depend on US1/US2 core components
  - US6-US7 (P3) can run in parallel with P2 stories
- **Storage Warnings (Phase 10)**: Depends on US6 (settings) and US7 (stats)
- **Polish (Phase 11)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Foundation only - No dependencies on other stories
- **User Story 2 (P1)**: Foundation only - Shares ChatImage component with US1 but independent
- **User Story 3 (P2)**: Uses ChatImage from US1, download logic from US2
- **User Story 4 (P2)**: Uses caching infrastructure, independent of US1-3
- **User Story 5 (P2)**: Uses validation + auto-download logic, integrates with US2
- **User Story 6 (P3)**: Independent settings feature
- **User Story 7 (P3)**: Uses stats infrastructure, independent of other P3

### Parallel Opportunities

**Within Phase 2 (Foundational)**:
```
T005, T006, T007, T008, T009, T010 can run in parallel (different Rust commands)
```

**After Foundational Complete**:
```
US1 and US2 can be worked on in parallel
US6 and US7 can be worked on in parallel (both P3, independent features)
```

**Within User Story 7**:
```
T050, T051, T052 can run in parallel (different Rust clearing commands)
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (Instant Thumbnails)
4. Complete Phase 4: User Story 2 (Auto-Caching)
5. **STOP and VALIDATE**: Core caching experience works
6. Deploy/demo if ready

### Incremental Delivery

1. **Foundation** → Core infrastructure ready
2. **US1** (Thumbnails) → Instant visual feedback ✓
3. **US2** (Auto-Cache) → Offline viewing ✓ (MVP complete!)
4. **US3** (Manual Download) → User control ✓
5. **US4** (Send Images) → Responsive sending ✓
6. **US5** (Recovery) → Robustness ✓
7. **US6** (Settings) → User preferences ✓
8. **US7** (Clearing) → Storage management ✓
9. **Warnings + Polish** → Production ready ✓

---

## Task Summary

| Phase | Task Range | Count | Description |
|-------|------------|-------|-------------|
| 1 | T001-T003 | 3 | Setup |
| 2 | T004-T014 | 11 | Foundational |
| 3 | T015-T020 | 6 | US1: Instant Thumbnails |
| 4 | T021-T026 | 6 | US2: Auto-Caching |
| 5 | T027-T031 | 5 | US3: Manual Download |
| 6 | T032-T036 | 5 | US4: Sending Images |
| 7 | T037-T042 | 6 | US5: Graceful Recovery |
| 8 | T043-T048 | 6 | US6: Settings Toggle |
| 9 | T049-T060 | 12 | US7: Selective Clearing |
| 10 | T061-T065 | 5 | Storage Warnings |
| 11 | T066-T071 | 6 | Polish |
| **Total** | T001-T071 | **71** | |

---

## Notes

- [P] tasks = different files, no dependencies - can run in parallel
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- MVP is US1 + US2 (14 tasks after foundational phase)
