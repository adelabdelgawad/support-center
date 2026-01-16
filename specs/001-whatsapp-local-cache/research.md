# Research: WhatsApp-Style Local Cache & Media Architecture

**Date**: 2026-01-16
**Branch**: 001-whatsapp-local-cache

## Research Summary

This document consolidates findings from codebase exploration to inform the implementation plan.

---

## 1. Existing Requester App Cache Implementation

### Decision: Extend Existing IndexedDB Patterns

**Rationale**: The requester app already has a well-structured cache implementation that matches 80% of the requirements. Extending it is safer and faster than rewriting.

**Alternatives Considered**:
- Rewrite from scratch: Rejected - unnecessary duplication of working patterns
- Use SQLite via Tauri: Rejected - IndexedDB works well, adding SQLite adds complexity

### Current Implementation Analysis

**Location**: `src/requester-app/src/src/lib/message-cache.ts`

**Database Schema (v2)**:
- Database: `support-center-requester-cache`
- Stores: `messages`, `chat_meta`, `tickets`, `ticket_meta`
- Indexes: `by_request`, `by_request_sequence` (compound), `by_status`, `by_cached_at`

**Existing Features**:
| Feature | Status | Location |
|---------|--------|----------|
| IndexedDB schema versioning | ✅ Implemented | lines 95-127 |
| Sequence-based tracking | ✅ Implemented | ChatMeta.latestSequence |
| TTL-based expiry (7 days) | ✅ Implemented | CACHE_EXPIRY_DAYS constant |
| Optimistic message handling | ✅ Implemented | replaceOptimisticMessage() |
| Cache statistics | ✅ Implemented | getStats() |

**Missing for Delta Sync**:
| Feature | Change Required |
|---------|-----------------|
| `since_sequence` API support | Add new fetch parameter |
| Batch message insertion | Add `addMessagesBatch()` method |
| Last sync timestamp | Extend ChatMeta interface |
| Reconnection delta fetch | Add to SignalR onReconnected handler |

### Image Cache Pattern

**Location**: `src/requester-app/src/src/context/image-cache-context.tsx`

**Pattern**: In-memory Map with blob URLs
- Key: filename
- Value: blob URL
- Inflight request deduplication prevents duplicate fetches
- 410 Gone responses return placeholder SVG
- Clears on logout

**Recommendation**: This pattern is efficient for media. Extend with:
- Persistent IndexedDB storage for blobs
- LRU eviction when approaching 500MB limit
- SHA256 verification on retrieval

---

## 2. Backend Delta Sync API Changes

### Decision: Extend Existing Endpoint with New Parameters

**Rationale**: The existing `GET /messages/request/{request_id}` endpoint already supports cursor-based pagination. Adding `since_sequence` and range query parameters maintains API consistency.

**Alternatives Considered**:
- New `/delta` endpoint: Rejected - duplicates code, adds API surface
- Separate `/range` endpoint: Rejected - consolidating in one endpoint is cleaner

### Required Changes

**Endpoint**: `GET /api/v1/chat/messages/request/{request_id}`

**New Parameters**:
```
since_sequence: int  # Delta sync - load messages with sequence > this
start_sequence: int  # Range query start (inclusive)
end_sequence: int    # Range query end (inclusive)
```

**New Response Headers**:
```
X-Newest-Sequence: str  # For delta sync cursor
X-Has-Newer: str        # For range queries
```

**Files to Modify**:
| File | Method | Lines |
|------|--------|-------|
| `api/v1/endpoints/chat.py` | get_messages() | 216-330 |
| `services/chat_service.py` | get_messages_cursor_paginated() | 308-347 |
| `repositories/chat_repository.py` | find_by_request_id_cursor_paginated() | 191-254 |

**No Changes Needed**:
- `models/database_models.py` - Existing index `ix_chat_message_request_sequence` supports all query patterns
- `schemas/chat_message/` - `sequence_number` already in response

### Pagination Modes

The endpoint will support three mutually exclusive modes:

1. **Delta Sync** (`since_sequence`):
   - `?limit=100&since_sequence=50` → messages where sequence > 50
   - Used for: Reconnection, periodic sync

2. **Range Query** (`start_sequence` + `end_sequence`):
   - `?start_sequence=10&end_sequence=20` → messages 10-20
   - Used for: Gap filling

3. **Cursor Pagination** (`before_sequence`):
   - `?limit=100&before_sequence=50` → messages where sequence < 50
   - Used for: Load older (existing behavior)

---

## 3. SignalR Integration Patterns

### Decision: Add Delta Sync to Reconnection Handler

**Rationale**: SignalR reconnection is the natural trigger for delta sync. The existing `onReconnected` handler is the right place.

**Location**: `src/requester-app/src/src/signalr/signalr-context.tsx`

**Existing Patterns to Reuse**:
| Pattern | Location | Reuse For |
|---------|----------|-----------|
| Optimistic version tracking | queries/tickets.ts:437-523 | Conflict detection |
| Pending notification recovery | notification-signalr-context.tsx:123-180 | Delta sync trigger pattern |
| InitialState with latestSequence | signalr-manager.ts:32-48 | Sync cursor source |

**Implementation Strategy**:
```typescript
// In onReconnected handler
const meta = await messageCache.getChatMeta(requestId);
if (meta?.latestSequence) {
  const delta = await getMessagesDelta({
    requestId,
    sinceSequence: meta.latestSequence
  });
  await messageCache.addMessagesBatch(delta.messages);
}
```

---

## 4. IT App Cache Implementation

### Decision: Port Patterns from Requester App

**Rationale**: The IT App (Next.js) has no local caching. Implementing a compatible cache using the same IndexedDB schema ensures consistency.

**Key Differences**:
| Aspect | Requester App | IT App |
|--------|---------------|--------|
| Storage | IndexedDB + Tauri fs | IndexedDB only |
| Limit | 500MB | 100MB |
| Settings UI | Yes (FR-010 to FR-012) | No (FR-033) |
| Framework | SolidJS | React 19 |

**Dependencies to Add**:
- `idb`: Modern IndexedDB wrapper (3KB gzipped)
- `@tanstack/react-virtual`: Virtualized list rendering

**Files to Create**:
```
src/it-app/lib/cache/
├── db.ts              # IndexedDB wrapper
├── message-cache.ts   # Port from requester app
├── media-manager.ts   # New implementation
├── sync-engine.ts     # Delta sync orchestration
└── schemas.ts         # Shared types
```

---

## 5. Virtualization Strategy

### Decision: Use @tanstack/virtual for Both Apps

**Rationale**: TanStack Virtual is framework-agnostic with official React and Solid adapters. Consistent behavior across apps.

**Performance Targets**:
- 60 FPS scroll with 5000+ messages
- <50MB memory with 10k messages
- Overscan: 10 items above/below viewport

**Implementation Notes**:
- Variable height messages require `measureElement` callback
- Sticky date headers need custom implementation
- Scroll position restoration on cache load

---

## 6. Offline Queue Implementation

### Decision: Separate IndexedDB Store with Status Tracking

**Rationale**: Keeping offline operations in a dedicated store simplifies queue management and persistence across restarts.

**Schema**:
```typescript
interface OfflineOperation {
  id: string;           // Client-generated UUID
  type: 'send_message' | 'mark_read';
  requestId: string;
  payload: unknown;
  createdAt: number;
  status: 'pending' | 'syncing' | 'failed';
  retryCount: number;
  lastError?: string;
}
```

**Processing Rules**:
- Process in FIFO order
- Max 5 retries with exponential backoff (1s, 2s, 4s, 8s, 16s)
- Failed items remain in queue for manual retry
- Limit: 100 items (warn user at 80)

---

## 7. Cache Storage Limits

### Decision: Platform-Specific Limits with LRU Eviction

| Platform | Limit | Eviction Strategy |
|----------|-------|-------------------|
| Browser (IT App) | 100MB | LRU by last accessed chat, automatic only |
| Desktop (Requester) | 500MB | LRU with user controls in Settings |

**Eviction Algorithm**:
1. Calculate current size: messages + media blobs
2. If > 90% limit: trigger eviction
3. Sort chats by `lastAccessedAt` ascending
4. Delete oldest chat's messages and media
5. Repeat until < 80% limit

**Never Evict**:
- Pinned media (FR-024)
- Messages < 1 hour old
- Pending offline operations

---

## Research Gaps (None Critical)

All clarifications resolved during `/speckit.clarify`:
- ✅ Multi-user isolation: Per-user cache, persists after logout
- ✅ Observability: Settings page stats + console logging
- ✅ IT App UI: No cache management UI, automatic only
