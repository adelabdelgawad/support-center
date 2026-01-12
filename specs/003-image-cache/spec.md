# Feature Specification: Local Image Caching with Blurred Thumbnails

**Feature Branch**: `003-image-cache`
**Created**: 2026-01-12
**Status**: Draft
**Input**: User description: "Implement Local Image Caching with Blurred Thumbnails (WhatsApp-like) for the Requester Application"

## Clarifications

### Session 2026-01-12

- Q: Where are thumbnails generated - client-side or server-side? → A: Server provides thumbnails as Base64 embedded in message metadata
- Q: How are thumbnails handled for sent/outgoing images? → A: Client generates thumbnail locally from source image before upload
- Q: What is the cache storage limit and eviction policy? → A: 500MB limit with warning notification every 30 minutes when exceeded (no auto-eviction); storage metric displayed in settings page
- Q: How can users manually clear the cache? → A: Selective clearing available in settings (per-chat or by date range)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Instant Thumbnail Display (Priority: P1)

When a user opens a chat conversation, they should immediately see blurred thumbnail placeholders for all images, providing instant visual feedback while full images load in the background or await download.

**Why this priority**: This is the foundation of the WhatsApp-like experience. Without instant thumbnails, users see broken images or loading spinners, which degrades perceived performance and user experience.

**Independent Test**: Can be fully tested by opening any chat with images and observing that thumbnails appear immediately (under 100ms) regardless of network conditions.

**Acceptance Scenarios**:

1. **Given** a chat contains 10 images, **When** user opens the chat, **Then** all 10 blurred thumbnails display within 100ms before any full images load
2. **Given** the network is slow or offline, **When** user opens a chat with images, **Then** thumbnails still display instantly from local metadata
3. **Given** a chat is scrolled to reveal more images, **When** new images scroll into view, **Then** their thumbnails appear immediately

---

### User Story 2 - Automatic Image Caching on Active Chat (Priority: P1)

When a user is actively viewing a chat and a new image is received, the full image and thumbnail should automatically download and cache locally without any user action required.

**Why this priority**: Core functionality that enables offline viewing and eliminates repeated server fetches. This is the primary value proposition of the caching system.

**Independent Test**: Can be fully tested by having an active chat open while another user sends an image, then verifying the image auto-downloads and persists locally.

**Acceptance Scenarios**:

1. **Given** Local Storage Images setting is ON and user has chat open, **When** a new image message arrives, **Then** full image and thumbnail auto-download to local storage
2. **Given** image was previously cached, **When** user views the same chat later (even offline), **Then** cached image displays without server request
3. **Given** auto-download completes, **When** user checks local storage, **Then** both full.jpg and thumb.jpg exist in the expected directory structure

---

### User Story 3 - Manual Download for Non-Cached Images (Priority: P2)

When viewing a chat that was not open when images were received, users see thumbnails with a download button, allowing them to manually download full images on demand.

**Why this priority**: Enables data-conscious usage where users control which images consume bandwidth and storage. Essential for users on metered connections.

**Independent Test**: Can be fully tested by receiving images while chat is closed, opening the chat, seeing download buttons, and tapping to download.

**Acceptance Scenarios**:

1. **Given** chat was closed when image was received, **When** user opens the chat, **Then** blurred thumbnail displays with centered download button
2. **Given** user taps download button, **When** download is in progress, **Then** progress indicator replaces download button
3. **Given** download completes, **When** full image is ready, **Then** image seamlessly replaces thumbnail without page refresh

---

### User Story 4 - Sending Images with Immediate Display (Priority: P2)

When a user sends an image, it should appear in the chat UI immediately without waiting for server upload confirmation, providing responsive feedback.

**Why this priority**: Users expect instant feedback when sending content. Waiting for upload before display creates frustrating delays.

**Independent Test**: Can be fully tested by selecting and sending an image, observing it appears immediately in chat while upload indicator shows progress.

**Acceptance Scenarios**:

1. **Given** user selects an image to send, **When** they confirm send, **Then** image appears in chat within 200ms
2. **Given** image is displayed, **When** upload is still in progress, **Then** progress indicator shows upload status
3. **Given** send action occurs, **When** image is saved locally, **Then** both full image and generated thumbnail are persisted immediately

---

### User Story 5 - Graceful Recovery from Deleted Files (Priority: P2)

If a user manually deletes cached images from the file system, the app should gracefully detect this and recover by falling back to thumbnail view with download option.

**Why this priority**: Users may clear storage manually. The app must handle this gracefully without crashes or confusing error states.

**Independent Test**: Can be fully tested by deleting files from the cache directory while app is running, then navigating to affected chat.

**Acceptance Scenarios**:

1. **Given** cached images exist, **When** user manually deletes files from disk, **Then** app does not crash or show error dialogs
2. **Given** files were deleted and chat is opened, **When** images scroll into view, **Then** missing images show as thumbnail + download button
3. **Given** Local Storage Images is ON and files were deleted, **When** user views the chat, **Then** images auto-re-download without user intervention

---

### User Story 6 - Settings Toggle for Local Storage (Priority: P3)

Users should be able to enable or disable the local image storage feature through a settings switch, with clear behavior for each state.

**Why this priority**: Provides user control over storage usage. Some users may prefer not to cache images locally.

**Independent Test**: Can be fully tested by toggling the setting and verifying caching/auto-download behavior changes accordingly.

**Acceptance Scenarios**:

1. **Given** setting is toggled OFF, **When** new images arrive in active chat, **Then** images are NOT auto-downloaded (thumbnail + manual download only)
2. **Given** setting is toggled OFF, **When** user checks local storage, **Then** existing cached images are NOT deleted
3. **Given** setting is toggled ON after being OFF, **When** user opens a chat, **Then** caching resumes normally for new images

---

### User Story 7 - Selective Cache Clearing (Priority: P3)

Users should be able to selectively clear cached images from the settings page, choosing to clear by specific chat or by date range, to manage storage usage.

**Why this priority**: Enables users to resolve storage warnings without losing all cached content. Users can prioritize keeping recent or important chat images while clearing older ones.

**Independent Test**: Can be fully tested by caching images across multiple chats, then using settings to clear cache for a specific chat or date range, verifying only targeted files are removed.

**Acceptance Scenarios**:

1. **Given** user navigates to settings storage section, **When** they select "Clear by Chat", **Then** a list of chats with cached images and their sizes is displayed
2. **Given** user selects a specific chat to clear, **When** they confirm the action, **Then** only that chat's cached images are deleted and storage metric updates
3. **Given** user selects "Clear by Date Range", **When** they choose a date range and confirm, **Then** only images cached within that range are deleted
4. **Given** cache is cleared via settings, **When** user opens affected chat, **Then** images show as thumbnail + download button (not cached)

---

### Edge Cases

- What happens when disk is full? System should fail gracefully, log the condition, and continue showing remote images
- What happens when cache directory is read-only or inaccessible? System should detect permission errors, skip caching, and continue functioning
- What happens when thumbnail data is missing or corrupt in message metadata? Store metadata without thumbnail, show generic image placeholder
- What happens when the same image is referenced in multiple chats? Each chat should have its own cached copy to maintain proper lifecycle management
- What happens during rapid scrolling through many images? Lazy loading should prioritize visible images, canceling off-screen downloads
- What happens if a partial download is interrupted? Incomplete files should be detected and cleaned up on next validation
- What happens when cache exceeds 500MB? System continues caching new images but shows warning notification every 30 minutes; no automatic deletion occurs

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST use `%APPDATA%\supportcenter.requester` as the base directory for all cached images
- **FR-002**: System MUST store images in a structured layout: `images/chats/<chat_id>/<image_id>/full.jpg` and `thumb.jpg`
- **FR-003**: System MUST receive blurred thumbnails as Base64 data embedded in message metadata from the server (no client-side thumbnail generation required for incoming images)
- **FR-003a**: System MUST generate blurred thumbnails locally for outgoing/sent images before upload begins (to enable immediate display)
- **FR-004**: System MUST display thumbnails immediately (within 100ms) when opening a chat or scrolling
- **FR-005**: System MUST auto-download full images when Local Storage Images is ON and chat is currently open
- **FR-006**: System MUST show a download button overlay on thumbnails when full image is not cached
- **FR-007**: System MUST show progress indicator during image download operations
- **FR-008**: System MUST persist sent images to local storage immediately before server upload completes
- **FR-009**: System MUST track image metadata including: image_id, chat_id, remote reference, is_cached status, local paths, and last_verified_at timestamp
- **FR-010**: System MUST validate cached file existence lazily (on-demand) when: chat opens, image scrolls into view, user taps image, or auto-download triggers
- **FR-011**: System MUST update is_cached to false when local files are detected as missing (without throwing errors)
- **FR-012**: System MUST treat missing local files as normal cache misses (log as INFO/DEBUG, not WARN/ERROR)
- **FR-013**: System MUST NOT delete metadata when local files are missing
- **FR-014**: System MUST NOT auto-delete any user files under any circumstances
- **FR-015**: System MUST NOT scan entire storage directory on startup
- **FR-016**: System MUST provide a Settings switch labeled "Local Storage Images" (enabled by default)
- **FR-017**: System MUST stop auto-downloading when Local Storage Images is disabled (manual download still available)
- **FR-018**: System MUST NOT delete existing cached files when Local Storage Images is disabled
- **FR-019**: System MUST perform all I/O and image processing operations asynchronously (background threads)
- **FR-020**: System MUST validate disk availability and write permissions before attempting to save files
- **FR-021**: System MUST fail gracefully on disk full, permission errors, or missing directories
- **FR-022**: System MUST enforce a 500MB soft limit for cached images (no automatic deletion when exceeded)
- **FR-023**: System MUST display a warning notification every 30 minutes while cache size exceeds 500MB
- **FR-024**: System MUST display current cache storage usage on the user settings page
- **FR-025**: System MUST provide selective cache clearing options: by specific chat or by date range
- **FR-026**: System MUST update metadata (is_cached = false) when user clears cached files through the settings interface

### Key Entities

- **ImageMetadata**: Tracks each cached image - contains image_id, chat_id, remote_reference, is_cached boolean, full_image_path, thumbnail_path, last_verified_at timestamp, and optional checksum/file_size for integrity validation
- **CacheState**: Represents the current state of an image: Cached (both files exist), Partially Cached (only thumbnail exists), Not Cached (no local files), or Corrupt (files exist but are unreadable)
- **StorageSettings**: User preferences for local storage behavior - includes enable/disable toggle for Local Storage Images, current cache usage metric, and selective cache clearing options (by chat or date range)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Blurred thumbnails display within 100ms of a chat being opened, regardless of network conditions
- **SC-002**: Cached images load without any server requests (verified via network monitoring)
- **SC-003**: App continues functioning normally when cached files are manually deleted (no crashes, no error dialogs)
- **SC-004**: Users can send images and see them in chat within 200ms, before upload completes
- **SC-005**: Users receive warning notification when cache exceeds 500MB, repeated every 30 minutes until resolved
- **SC-006**: All image operations complete without blocking the UI thread (no freezes during I/O)
- **SC-007**: 95% of users can successfully toggle the Local Storage Images setting and observe the expected behavior change
- **SC-008**: Repeated viewing of the same cached images requires zero additional network bandwidth

## Assumptions

- The Requester Application already has access to the `%APPDATA%\supportcenter.requester` directory and appropriate write permissions
- Server-side image APIs already exist and provide full images; thumbnails are delivered as Base64 embedded in message metadata
- The application has existing chat functionality that this feature will integrate with
- Image format will be JPEG for both full and thumbnail versions (common denominator for compression and compatibility)
- Thumbnails will be approximately 20-50KB each (heavily compressed, ~100-200px dimensions, significant blur applied)
- The application uses a database or local index file for metadata storage (implementation choice deferred to planning phase)
