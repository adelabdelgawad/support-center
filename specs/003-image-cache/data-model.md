# Data Model: Local Image Caching

**Feature**: 003-image-cache
**Date**: 2026-01-12

## Overview

This document defines the data structures for local image caching in the Requester Application. The model supports WhatsApp-style caching with lazy validation and graceful recovery.

---

## 1. Core Entities

### ImageCacheMetadata

Persistent record tracking a cached image. Stored in Tauri Plugin Store.

```typescript
interface ImageCacheMetadata {
  // Identity
  imageId: string;              // Unique identifier (from server)
  chatId: string;               // Parent chat/request ID
  messageId?: string;           // Optional: originating message ID

  // Remote reference (for re-download)
  remoteReference: string;      // Server URL or file ID

  // Cache state
  isCached: boolean;            // True if full image exists locally
  hasThumbnail: boolean;        // True if thumbnail exists locally

  // Local paths (absolute)
  fullImagePath: string;        // e.g., %APPDATA%/.../images/chats/{chatId}/{imageId}/full.jpg
  thumbnailPath: string;        // e.g., %APPDATA%/.../images/chats/{chatId}/{imageId}/thumb.jpg

  // Inline thumbnail (for instant display without file I/O)
  thumbnailBase64?: string;     // Server-provided or client-generated

  // Timestamps
  cachedAt: number;             // Unix timestamp when first cached
  lastVerifiedAt: number;       // Unix timestamp of last file existence check

  // Optional integrity
  fileSize?: number;            // Bytes (for validation)
  checksum?: string;            // MD5 or SHA256 (for integrity checks)
}
```

**Storage Key**: `image_cache_${imageId}`

**Lifecycle**:
1. Created when image metadata received from server
2. `isCached` set true when full image saved to disk
3. `lastVerifiedAt` updated on lazy validation
4. Persists even if files deleted (FR-013)

---

### CacheState

Enumeration representing the validation state of a cached image.

```typescript
enum CacheState {
  Cached = 'cached',              // Full + thumbnail files exist
  PartiallyCached = 'partial',    // Only thumbnail exists
  NotCached = 'not_cached',       // No local files (or never cached)
  Corrupt = 'corrupt',            // Files exist but unreadable
}
```

**State Transition Rules**:

| From | To | Trigger |
|------|-----|---------|
| NotCached | Cached | Image downloaded and saved |
| Cached | NotCached | Files deleted by user (detected lazily) |
| Cached | Corrupt | File read fails (validation) |
| Corrupt | NotCached | Cleanup triggered |
| PartiallyCached | Cached | Full image downloaded |
| Cached | PartiallyCached | Full image deleted, thumbnail remains |

---

### CacheSettings

User preferences for local image storage.

```typescript
interface CacheSettings {
  // Master toggle (FR-016)
  isEnabled: boolean;           // Default: true

  // Storage limit (FR-022)
  limitBytes: number;           // Default: 500 * 1024 * 1024 (500MB)

  // Warning configuration (FR-023)
  warningIntervalMs: number;    // Default: 30 * 60 * 1000 (30 minutes)
  lastWarningAt: number;        // Timestamp of last warning notification
}
```

**Storage Key**: `image_cache_settings`

---

### CacheStats

Aggregate statistics for storage management UI.

```typescript
interface CacheStats {
  totalSizeBytes: number;       // Total cached image size
  imageCount: number;           // Number of cached images
  chatBreakdown: ChatCacheInfo[]; // Per-chat breakdown for selective clearing
  oldestCacheDate: number;      // Timestamp of oldest cached image
  newestCacheDate: number;      // Timestamp of newest cached image
}

interface ChatCacheInfo {
  chatId: string;
  chatTitle: string;            // For display in UI
  sizeBytes: number;
  imageCount: number;
  oldestCacheDate: number;
  newestCacheDate: number;
}
```

---

### ValidationResult

Result of lazy cache validation.

```typescript
interface ValidationResult {
  imageId: string;
  previousState: CacheState;
  currentState: CacheState;
  fullFileExists: boolean;
  thumbnailExists: boolean;
  fullFileSize?: number;
  validationTime: number;       // Timestamp
  error?: string;               // Error message if validation failed
}
```

---

## 2. Message Metadata Extension

The server provides thumbnail data embedded in chat message metadata.

```typescript
// Extended ChatMessage (existing type in types/index.ts)
interface ChatMessage {
  // ... existing fields ...

  // Image metadata (for image messages)
  hasImage?: boolean;
  imageId?: string;
  imageMetadata?: {
    thumbnailBase64: string;    // Blurred thumbnail (JPEG, ~20-50KB)
    fullImageUrl: string;       // URL to download full image
    width: number;
    height: number;
    fileSize: number;
  };
}
```

---

## 3. Download State

Tracks in-flight downloads to prevent duplicates.

```typescript
interface DownloadState {
  imageId: string;
  chatId: string;
  status: 'pending' | 'downloading' | 'completed' | 'failed';
  progress: number;             // 0-100
  error?: string;
  startedAt: number;
  completedAt?: number;
}
```

**Note**: This is in-memory state only, not persisted.

---

## 4. Storage Layout

### File System Structure

```
%APPDATA%\supportcenter.requester\
└── images\
    └── chats\
        └── {chatId}\
            └── {imageId}\
                ├── full.jpg    # Full resolution image
                └── thumb.jpg   # Blurred thumbnail
```

**Path Rules**:
- All paths absolute (no relative references)
- Directory created on first write to that chat/image
- Files named consistently (`full.jpg`, `thumb.jpg`)
- JPEG format only (per spec assumptions)

### Tauri Store Keys

| Key Pattern | Data Type | Description |
|-------------|-----------|-------------|
| `image_cache_${imageId}` | ImageCacheMetadata | Per-image metadata |
| `image_cache_settings` | CacheSettings | User preferences |
| `image_cache_stats` | CacheStats | Aggregate statistics (cached) |
| `image_cache_index` | string[] | List of all cached imageIds |

---

## 5. Validation Rules

### ImageCacheMetadata

| Field | Validation |
|-------|------------|
| imageId | Non-empty string, UUID format preferred |
| chatId | Non-empty string, UUID format preferred |
| remoteReference | Valid URL or server file ID |
| fullImagePath | Absolute path, contains "images/chats" |
| thumbnailPath | Absolute path, contains "images/chats" |
| cachedAt | Unix timestamp > 0 |
| lastVerifiedAt | Unix timestamp >= cachedAt |
| fileSize | If present, > 0 |

### CacheSettings

| Field | Validation |
|-------|------------|
| limitBytes | > 0, default 500MB, max 10GB |
| warningIntervalMs | >= 60000 (1 minute minimum) |

---

## 6. Index Structure

For efficient queries without scanning all metadata keys:

```typescript
interface CacheIndex {
  // All cached image IDs
  allImageIds: string[];

  // Chat-to-images mapping
  chatIndex: Map<string, string[]>;  // chatId -> imageId[]

  // Date-based index for selective clearing
  dateIndex: Map<string, string[]>;  // YYYY-MM-DD -> imageId[]
}
```

**Storage Key**: `image_cache_index`

**Update Rules**:
- Update on cache/clear operations
- Rebuild on app startup (quick scan of metadata keys)

---

## 7. Constants

```typescript
// Storage limits
const DEFAULT_CACHE_LIMIT_BYTES = 500 * 1024 * 1024;  // 500MB (FR-022)
const MAX_CACHE_LIMIT_BYTES = 10 * 1024 * 1024 * 1024; // 10GB

// Warning intervals
const DEFAULT_WARNING_INTERVAL_MS = 30 * 60 * 1000;    // 30 minutes (FR-023)
const MIN_WARNING_INTERVAL_MS = 60 * 1000;              // 1 minute

// Thumbnail specs
const THUMBNAIL_MAX_SIZE = 200;                         // pixels
const THUMBNAIL_BLUR_RADIUS = 10;                       // pixels
const THUMBNAIL_JPEG_QUALITY = 0.6;                     // 60%

// Performance
const VALIDATION_TIMEOUT_MS = 5000;                     // 5 seconds
const DOWNLOAD_TIMEOUT_MS = 60000;                      // 1 minute
```
