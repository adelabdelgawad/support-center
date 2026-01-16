# Data Model: WhatsApp-Style Local Cache

**Feature**: 001-whatsapp-local-cache
**Date**: 2026-01-16

---

## Overview

This document defines the data structures for the client-side cache layer. These schemas are stored in IndexedDB (browser) and file system (Tauri desktop).

---

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         IndexedDB Database                          │
│                    support-center-[userId]-cache                    │
└─────────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│    messages     │  │   chat_meta     │  │  media_blobs    │
│    (store)      │  │    (store)      │  │    (store)      │
├─────────────────┤  ├─────────────────┤  ├─────────────────┤
│ PK: id          │  │ PK: requestId   │  │ PK: key         │
│ IX: requestId   │  │                 │  │ IX: lastAccess  │
│ IX: [reqId,seq] │  │                 │  │                 │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │
         │     1:N            │     1:1            │     1:1
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  media_meta     │  │ offline_queue   │  │  cache_stats    │
│    (store)      │  │    (store)      │  │  (singleton)    │
├─────────────────┤  ├─────────────────┤  ├─────────────────┤
│ PK: id          │  │ PK: id          │  │ PK: 'stats'     │
│ IX: requestId   │  │ IX: status      │  │                 │
│ IX: lastAccess  │  │ IX: createdAt   │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## 1. CachedMessage

Locally stored representation of a chat message.

### Schema

```typescript
interface CachedMessage {
  // Primary key
  id: string;                      // UUID from server

  // Relationships & indexes
  requestId: string;               // Index: by_request
  sequenceNumber: number;          // Compound index: [requestId, sequenceNumber]

  // Core message data
  senderId: string | null;
  sender: {
    id: string;
    username: string;
    fullName: string | null;
    isTechnician: boolean;
  } | null;
  content: string;
  createdAt: string;               // ISO 8601
  updatedAt: string | null;

  // Media references
  isScreenshot: boolean;
  screenshotFileName: string | null;
  fileName: string | null;
  fileSize: number | null;
  fileMimeType: string | null;

  // Read state
  isReadByCurrentUser: boolean;

  // Optimistic send support
  tempId?: string;                 // Client-generated temp ID
  clientTempId?: string;           // Sent to server for matching
  status: 'pending' | 'sent' | 'failed';
  errorMessage?: string;

  // Cache metadata
  _cachedAt: number;               // Unix timestamp (ms)
  _syncVersion: number;            // For conflict detection
}
```

### IndexedDB Store

```typescript
{
  name: 'messages',
  keyPath: 'id',
  indexes: [
    { name: 'by_request', keyPath: 'requestId', unique: false },
    { name: 'by_request_sequence', keyPath: ['requestId', 'sequenceNumber'], unique: true },
    { name: 'by_cached_at', keyPath: '_cachedAt', unique: false }
  ]
}
```

### Validation Rules

| Field | Rule |
|-------|------|
| id | Required, UUID format |
| requestId | Required, UUID format |
| sequenceNumber | Required, positive integer |
| content | Required, 1-10000 characters |
| status | Required, enum value |
| _cachedAt | Auto-set on insert |
| _syncVersion | Auto-increment on update |

---

## 2. ChatSyncState

Tracking data for delta synchronization per chat.

### Schema

```typescript
interface ChatSyncState {
  // Primary key
  requestId: string;

  // Sync checkpoints
  lastSyncedSequence: number;      // Highest confirmed sequence
  lastSyncedAt: number;            // Unix timestamp (ms)
  totalMessageCount: number;       // For progress display

  // Gap tracking
  knownGaps: Array<{
    startSeq: number;
    endSeq: number;
    detectedAt: number;
  }>;

  // Read state
  unreadCount: number;
  lastReadSequence: number;
  lastReadAt: number | null;

  // Cache management
  messageCount: number;            // Cached message count
  mediaSize: number;               // Cached media bytes
  lastAccessedAt: number;          // For LRU eviction

  // Server revision for drift detection
  serverRevision: string | null;
}
```

### IndexedDB Store

```typescript
{
  name: 'chat_meta',
  keyPath: 'requestId',
  indexes: [
    { name: 'by_last_accessed', keyPath: 'lastAccessedAt', unique: false }
  ]
}
```

### State Transitions

```
INITIAL → SYNCING → SYNCED → STALE → RESYNCING → SYNCED
              ↓         ↓         ↓
           FAILED    GAP_DETECTED  EXPIRED (>7 days)
```

---

## 3. CachedMediaMeta

Metadata about cached media files.

### Schema

```typescript
interface CachedMediaMeta {
  // Primary key (composite)
  id: string;                      // Format: `${requestId}:${filename}`

  // References
  requestId: string;
  messageId: string;
  filename: string;                // Server filename
  originalFilename?: string;       // User-friendly name

  // File metadata
  mimeType: string;
  fileSize: number;                // Bytes

  // Download state
  downloadStatus: 'pending' | 'downloading' | 'completed' | 'failed';
  downloadProgress: number;        // 0-100
  downloadedAt: number | null;

  // Integrity
  sha256Hash: string | null;       // From server
  isVerified: boolean;             // Hash checked

  // Local storage
  localBlobKey: string | null;     // Reference to media_blobs store
  thumbnailBlobKey: string | null;

  // Cache management
  lastAccessedAt: number;          // For LRU eviction
  isPinned: boolean;               // Prevent eviction
  priority: 'high' | 'normal' | 'low';
}
```

### IndexedDB Store

```typescript
{
  name: 'media_meta',
  keyPath: 'id',
  indexes: [
    { name: 'by_request', keyPath: 'requestId', unique: false },
    { name: 'by_last_accessed', keyPath: 'lastAccessedAt', unique: false },
    { name: 'by_status', keyPath: 'downloadStatus', unique: false }
  ]
}
```

---

## 4. CachedMediaBlob

Raw binary data for cached media.

### Schema

```typescript
interface CachedMediaBlob {
  // Primary key
  key: string;                     // Same as CachedMediaMeta.localBlobKey

  // Blob data
  data: Blob;                      // Binary content

  // Metadata
  size: number;                    // Bytes
  mimeType: string;
  createdAt: number;
  lastAccessedAt: number;
}
```

### IndexedDB Store

```typescript
{
  name: 'media_blobs',
  keyPath: 'key',
  indexes: [
    { name: 'by_last_accessed', keyPath: 'lastAccessedAt', unique: false }
  ]
}
```

---

## 5. OfflineOperation

Queued operations for offline sync.

### Schema

```typescript
interface OfflineOperation {
  // Primary key
  id: string;                      // Client-generated UUID

  // Operation type
  type: 'send_message' | 'mark_read';

  // Context
  requestId: string;

  // Payload (type-dependent)
  payload: SendMessagePayload | MarkReadPayload;

  // State
  status: 'pending' | 'syncing' | 'completed' | 'failed';
  createdAt: number;
  attemptedAt: number | null;

  // Retry tracking
  retryCount: number;
  maxRetries: number;              // Default: 5
  nextRetryAt: number | null;
  lastError: string | null;
}

interface SendMessagePayload {
  content: string;
  tempId: string;
  isScreenshot?: boolean;
  screenshotFileName?: string;
}

interface MarkReadPayload {
  messageIds: string[];
  upToSequence: number;
}
```

### IndexedDB Store

```typescript
{
  name: 'offline_queue',
  keyPath: 'id',
  indexes: [
    { name: 'by_status', keyPath: 'status', unique: false },
    { name: 'by_created', keyPath: 'createdAt', unique: false },
    { name: 'by_next_retry', keyPath: 'nextRetryAt', unique: false }
  ]
}
```

### State Transitions

```
PENDING → SYNCING → COMPLETED
             ↓
          FAILED (retry < max) → PENDING
             ↓
          FAILED (retry >= max) → [manual retry required]
```

---

## 6. CacheStats

Singleton for cache statistics (desktop app settings page).

### Schema

```typescript
interface CacheStats {
  // Primary key
  key: 'stats';

  // Size tracking
  totalSize: number;               // Bytes
  messagesSize: number;
  mediaSize: number;

  // Counts
  chatCount: number;
  messageCount: number;
  mediaCount: number;

  // Performance
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;                 // Percentage

  // Sync info
  lastFullSync: number | null;
  lastDeltaSync: number | null;
  pendingOperations: number;

  // Timestamps
  createdAt: number;
  updatedAt: number;
}
```

### IndexedDB Store

```typescript
{
  name: 'cache_stats',
  keyPath: 'key'
}
```

---

## Database Schema Versioning

### Version History

| Version | Changes |
|---------|---------|
| 1 | Initial: messages, chat_meta |
| 2 | Added: tickets, ticket_meta (existing) |
| 3 | Added: media_meta, media_blobs, offline_queue, cache_stats |

### Migration Strategy

```typescript
function upgradeDB(db: IDBDatabase, oldVersion: number) {
  if (oldVersion < 3) {
    // Create new stores for v3
    const mediaMeta = db.createObjectStore('media_meta', { keyPath: 'id' });
    mediaMeta.createIndex('by_request', 'requestId');
    mediaMeta.createIndex('by_last_accessed', 'lastAccessedAt');
    mediaMeta.createIndex('by_status', 'downloadStatus');

    const mediaBlobs = db.createObjectStore('media_blobs', { keyPath: 'key' });
    mediaBlobs.createIndex('by_last_accessed', 'lastAccessedAt');

    const offlineQueue = db.createObjectStore('offline_queue', { keyPath: 'id' });
    offlineQueue.createIndex('by_status', 'status');
    offlineQueue.createIndex('by_created', 'createdAt');
    offlineQueue.createIndex('by_next_retry', 'nextRetryAt');

    db.createObjectStore('cache_stats', { keyPath: 'key' });
  }
}
```

---

## Desktop App File System Layout

For the Tauri Requester App, media blobs are stored on the file system instead of IndexedDB for better performance with large files.

```
%APPDATA%\supportcenter.requester\
├── cache\
│   ├── db\
│   │   └── cache.db              # SQLite (optional, for queries)
│   └── media\
│       ├── {requestId}\
│       │   ├── {filename}        # Original media
│       │   └── {filename}.thumb  # Thumbnail
│       └── ...
├── settings.json                  # App settings including cache config
└── logs\
    └── cache.log                  # Cache operation logs
```

### Size Limit Enforcement

```rust
// Rust Tauri command for cache size check
#[tauri::command]
fn get_cache_size(app: AppHandle) -> Result<CacheSizeInfo, String> {
    let cache_dir = app.path_resolver()
        .app_data_dir()
        .ok_or("No app data dir")?
        .join("cache");

    let size = fs_extra::dir::get_size(&cache_dir)
        .map_err(|e| e.to_string())?;

    Ok(CacheSizeInfo {
        total_bytes: size,
        limit_bytes: 500 * 1024 * 1024, // 500MB
        usage_percent: (size as f64 / (500.0 * 1024.0 * 1024.0) * 100.0) as u8,
    })
}
```
