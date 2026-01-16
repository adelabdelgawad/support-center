# Feature Specification: WhatsApp-Style Local Cache & Media Architecture

**Feature Branch**: `001-whatsapp-local-cache`
**Created**: 2026-01-16
**Status**: Draft
**Input**: User description: "WhatsApp-Style Local Cache and Media Architecture"

## Clarifications

### Session 2026-01-16

- Q: How should cache handle multi-user scenarios on shared devices? → A: Cache isolated per logged-in user; cache persists after logout. Desktop app uses `%APPDATA%\supportcenter.requester` with 500MB limit. Settings page shows storage usage percentage with options to clear all or clear by date range.
- Q: What operational visibility is needed for cache health monitoring? → A: User-facing settings page shows cache stats (hit rate, size, last sync) plus console logging for debugging.
- Q: Should IT App (browser) have cache management UI like the desktop app? → A: No UI; browser cache managed automatically only (LRU eviction, no user controls).

## Overview

Implement a WhatsApp-style local caching system for the Support Desk Center chat functionality across both client applications (IT App and Requester App). The goal is to reduce backend load, enable offline capabilities, and improve UI responsiveness by storing messages, media metadata, and sync state locally on user devices.

**Current Pain Points:**
- Every chat message fetch requires a database query (no caching layer)
- IT App has no local persistence - messages only exist in memory
- Users experience delays when opening chats or scrolling through history
- No offline capability - users cannot compose messages when disconnected
- Large chats cause performance issues due to lack of virtualization

**Target Outcomes:**
- Instant message display from local cache
- Efficient delta synchronization (only fetch new messages)
- Offline message composition with automatic retry
- Smart media prefetching and caching

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Instant Chat Loading (Priority: P1)

As an IT agent, I want chat messages to appear instantly when I open a support ticket, so I can respond to users without waiting for data to load.

**Why this priority**: This is the core value proposition - reducing perceived latency improves agent productivity and user satisfaction. Without this, every chat interaction feels sluggish.

**Independent Test**: Can be fully tested by opening any chat with existing messages and measuring time-to-first-content. Delivers immediate value by reducing wait times from seconds to milliseconds.

**Acceptance Scenarios**:

1. **Given** a user has previously viewed a chat with 50+ messages, **When** they reopen that chat, **Then** messages appear within 100 milliseconds from local cache
2. **Given** a user opens a chat for the first time, **When** the server responds, **Then** messages are cached locally for future visits
3. **Given** cached messages exist, **When** the user opens the chat, **Then** the system fetches only new messages (delta sync) in the background
4. **Given** new messages arrive during delta sync, **When** sync completes, **Then** the UI updates seamlessly without flickering or jumps

---

### User Story 2 - Offline Message Composition (Priority: P2)

As a support agent working in areas with unreliable network, I want to compose and queue messages when offline, so my work isn't interrupted by connectivity issues.

**Why this priority**: Enables productivity in poor network conditions. Agents can continue working and messages send automatically when connection is restored.

**Independent Test**: Can be tested by disabling network, composing messages, then re-enabling network. Messages should send automatically and appear in the correct order.

**Acceptance Scenarios**:

1. **Given** the user is offline, **When** they compose and send a message, **Then** the message appears in the chat with a "pending" indicator
2. **Given** multiple messages are queued offline, **When** connectivity is restored, **Then** messages are sent in the order they were composed
3. **Given** a queued message fails after reconnection, **When** max retries are exhausted, **Then** the user sees a "failed" indicator with a manual retry option
4. **Given** the user closes and reopens the app while offline, **When** they return to the chat, **Then** pending messages are still visible and will send when online

---

### User Story 3 - Media Caching (Priority: P2)

As a user viewing chat attachments, I want previously viewed images and files to load instantly, so I don't have to wait for downloads repeatedly.

**Why this priority**: Media often represents the largest payload. Caching eliminates redundant downloads and improves perceived performance.

**Independent Test**: Can be tested by viewing an image in chat, navigating away, then returning. The image should display without any network request.

**Acceptance Scenarios**:

1. **Given** a user views a screenshot in a chat message, **When** the download completes, **Then** the media is cached locally for instant future access
2. **Given** cached media approaches the storage limit (100MB default), **When** new media is downloaded, **Then** the least-recently-accessed items are evicted first
3. **Given** a user marks media as important, **When** cache eviction runs, **Then** pinned media is never automatically removed
4. **Given** media fails to download, **When** the user taps retry, **Then** the download resumes with exponential backoff

---

### User Story 4 - Large Chat Performance (Priority: P3)

As a user viewing a chat with thousands of messages, I want smooth scrolling performance, so I can navigate through history without lag or stuttering.

**Why this priority**: Essential for power users and long-running support tickets. Without virtualization, large chats cause memory issues and poor UX.

**Independent Test**: Can be tested by loading a chat with 1000+ messages and measuring scroll frame rate and memory usage.

**Acceptance Scenarios**:

1. **Given** a chat has 5000+ messages, **When** the user scrolls through the history, **Then** scroll performance remains smooth (60 FPS)
2. **Given** a user scrolls to older messages, **When** messages are outside the visible viewport, **Then** they are unloaded from memory (virtualized)
3. **Given** a user scrolls quickly through history, **When** they stop scrolling, **Then** visible messages render within 50 milliseconds

---

### User Story 5 - Sync State Recovery (Priority: P3)

As a user who closes and reopens the application, I want my sync state to persist, so I don't have to re-download all messages on every session.

**Why this priority**: Prevents unnecessary data usage and improves startup time. Users expect persistent state like other modern messaging apps.

**Independent Test**: Can be tested by opening a chat, closing the app completely, reopening, and verifying messages load from cache without full re-fetch.

**Acceptance Scenarios**:

1. **Given** the user has synced messages to sequence number N, **When** they reopen the app, **Then** sync resumes from sequence N+1
2. **Given** the cache is older than 7 days, **When** the user opens a chat, **Then** a full resync is triggered automatically
3. **Given** a schema version mismatch is detected, **When** the app opens, **Then** the cache is cleared and rebuilt transparently

---

### Edge Cases

- **Storage quota exceeded**: System requests persistent storage permission and implements LRU eviction to free space
- **Message sequence gaps** (missed SignalR events): Gap detection algorithm identifies missing sequences and fetches them via range query
- **Multiple browser tabs open simultaneously**: Each tab maintains its own cache instance; real-time events keep them eventually consistent
- **Corrupted cache data**: Validation on read; corrupted entries trigger selective or full resync
- **Server returns messages out of order**: Messages sorted by sequence number before display; out-of-order arrivals merged correctly
- **Network restored during offline queue processing**: Queue processing is serialized to prevent race conditions
- **App killed during cache write**: IndexedDB transactions are atomic; partial writes are rolled back

## Requirements *(mandatory)*

### Functional Requirements

#### Lazy Loading Constraints (Non-Negotiable)

- **FR-LAZY-001**: System MUST NOT download any message content on app startup
- **FR-LAZY-002**: System MUST download messages ONLY when the user opens a specific chat
- **FR-LAZY-003**: System MUST fetch only missing messages (delta sync from last checkpoint), NOT full history
- **FR-LAZY-004**: System MUST load older messages only when user scrolls, NOT on chat open
- **FR-LAZY-005**: System MUST NOT prefetch messages for chats the user has not opened
- **FR-LAZY-006**: System MUST download media ONLY when the media enters the viewport (lazy load)
- **FR-LAZY-007**: System MUST NOT include media blobs in message API responses

#### Cache Layer

- **FR-001**: System MUST cache chat messages locally using persistent browser storage
- **FR-002**: System MUST store message content, sender information, timestamps, and media references in the cache
- **FR-003**: System MUST index cached messages by request ID and sequence number for efficient retrieval
- **FR-004**: System MUST implement cache expiration with a configurable TTL (default: 7 days)
- **FR-005**: System MUST track sync checkpoints (last synced sequence number) per chat
- **FR-006**: System MUST isolate cache data per logged-in user account
- **FR-007**: System MUST persist user cache data after logout (for faster re-login experience)

#### Desktop App Storage (Requester App)

- **FR-008**: Desktop app MUST store cache data in `%APPDATA%\supportcenter.requester` directory
- **FR-009**: Desktop app MUST enforce a 500MB total storage limit for cache data
- **FR-010**: Desktop app Settings page MUST display current storage usage as percentage of limit
- **FR-011**: Desktop app Settings page MUST provide a "Clear All Cache" action
- **FR-012**: Desktop app Settings page MUST provide a "Clear by Date Range" action allowing users to remove cached data older than or within a specified date range

#### Desktop App Optional Full Download (Requester App)

- **FR-FULL-001**: Desktop app MUST provide an optional "Download All Chats" feature in Settings
- **FR-FULL-002**: Full download MUST be disabled by default
- **FR-FULL-003**: Full download MUST require explicit user confirmation with storage warning
- **FR-FULL-004**: Full download MUST iterate chats individually using lazy sync logic, NOT bulk API
- **FR-FULL-005**: Full download MUST respect the 500MB storage limit and stop when reached
- **FR-FULL-006**: Full download MUST provide progress indicator and cancel option

#### Delta Synchronization

- **FR-013**: System MUST support fetching messages after a given sequence number (delta sync)
- **FR-014**: System MUST detect sequence gaps in received messages and request missing ranges
- **FR-015**: System MUST merge server responses with cached data using sequence numbers as the source of truth
- **FR-016**: System MUST trigger full resync when cache is older than threshold or too many gaps are detected (>10 gaps)

#### Offline Support

- **FR-017**: System MUST queue outgoing messages when offline with "pending" status
- **FR-018**: System MUST persist offline queue across app restarts
- **FR-019**: System MUST process offline queue automatically when connectivity is restored
- **FR-020**: System MUST implement retry with exponential backoff (max 5 attempts) for failed sends
- **FR-021**: System MUST allow users to manually retry or delete failed messages

#### Media Caching

- **FR-022**: System MUST cache downloaded media (images, files) locally with metadata
- **FR-023**: System MUST implement LRU eviction when cache exceeds configurable size limit (default: 100MB for browser, 500MB for desktop)
- **FR-024**: System MUST allow users to pin media to prevent automatic eviction
- **FR-025**: System MUST verify media integrity using hash comparison when available
- **FR-026**: System MUST prefetch media for visible messages with configurable priority levels

#### Performance

- **FR-027**: System MUST implement virtualized rendering for chat message lists
- **FR-028**: System MUST load cached messages before initiating network requests (cache-first strategy)
- **FR-029**: System MUST update UI incrementally as delta sync completes (no full re-render)

#### Observability

- **FR-030**: Desktop app Settings page MUST display cache statistics including: total size, hit rate percentage, and last sync timestamp
- **FR-031**: System MUST log cache operations (sync start/complete, eviction, errors) to browser/app console for debugging
- **FR-032**: Desktop app Settings page MUST show per-chat cache breakdown (message count, media size) for user visibility
- **FR-033**: IT App (browser) MUST manage cache automatically without user-facing controls (LRU eviction only)

### Key Entities

- **CachedMessage**: A locally stored representation of a chat message including content, sender, timestamps, sequence number, media references, and sync metadata
- **ChatSyncState**: Tracking data for each chat including last synced sequence, sync timestamp, gap information, and unread count
- **CachedMediaMeta**: Metadata about cached media files including download status, hash, local blob reference, and access timestamp
- **OfflineOperation**: A queued operation (send message, mark read) waiting to be synchronized when online

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users see cached chat messages within 100 milliseconds of opening a previously viewed chat
- **SC-002**: Delta sync reduces data transfer by 80% or more for chats with fewer than 50 new messages since last visit
- **SC-003**: Users can compose and queue up to 100 messages while offline without data loss
- **SC-004**: Scroll performance in chats with 5000+ messages maintains 60 frames per second
- **SC-005**: Media cache serves 90% of previously viewed images without network requests
- **SC-006**: App startup time with 10,000 cached messages remains under 2 seconds
- **SC-007**: Memory usage with 10,000 cached messages stays below 50MB

## Assumptions

- Users will grant persistent storage permissions when prompted by the browser
- Browser storage quotas (typically 50-500MB) are sufficient for typical usage patterns
- Existing real-time messaging infrastructure remains reliable for live message delivery
- Backend sequence numbers are guaranteed to be monotonically increasing per chat
- Media download URLs have sufficient validity period (currently 24 hours) for background downloads

## Dependencies

- Backend must support delta sync parameter (`since_sequence`) on message fetch endpoint
- Backend must support range queries for gap filling
- Real-time messaging must continue broadcasting new messages
- Media storage must provide integrity hashes for verification

## Out of Scope

- Cross-device cache synchronization (each device maintains independent cache)
- End-to-end encryption of cached data (optional feature for future consideration)
- Cache sharing between different user accounts on same device
- Offline support for file uploads (only message text is queued offline)
