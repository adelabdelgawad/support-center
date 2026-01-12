# Research: Local Image Caching with Blurred Thumbnails

**Feature**: 003-image-cache
**Date**: 2026-01-12

## Summary

Research findings for implementing WhatsApp-style local image caching in the Requester Application (Tauri v2 + SolidJS).

---

## 1. File System Access (Tauri v2)

### Decision: Use Rust Backend Commands

**Rationale**: The Requester App already uses Rust backend commands for all file operations via `#[tauri::command]`. This pattern is consistent, secure, and provides async I/O through tokio.

**Alternatives Considered**:
- `@tauri-apps/plugin-fs` - Not used in current codebase, would add inconsistency
- Web File System API - Not available in Tauri context

**Key Pattern** (from existing `migration.rs`, `logging.rs`):

```rust
// Path resolution
let base_dir = app.path().app_data_dir()?;
let image_dir = base_dir.join("images").join("chats").join(&chat_id).join(&image_id);

// Directory creation
fs::create_dir_all(&image_dir)?;

// Async file write (non-blocking)
let mut file = tokio::fs::File::create(path).await?;
file.write_all(&data).await?;
file.sync_all().await?;

// Existence check (sync, fast)
Path::new(&path).exists()
```

**Commands Needed**:
- `save_cache_file(image_id, chat_id, data, filename)` → Result<String, String>
- `validate_cache_files(full_path, thumb_path)` → Result<ValidationResult, String>
- `delete_cache_file(path)` → Result<(), String>
- `get_cache_stats()` → Result<CacheStats, String>
- `clear_chat_cache(chat_id)` → Result<u64, String>
- `clear_cache_by_date_range(before_ts, after_ts)` → Result<u64, String>

---

## 2. Image Processing

### Decision: HTML5 Canvas API for Client-Side Thumbnails

**Rationale**: Zero dependencies, browser-native, GPU-accelerated. Sufficient for generating blurred thumbnails (<50ms).

**Alternatives Considered**:
- Rust image processing (`fast_image_resize`, `jpeg-encoder`) - Overkill for simple blur, adds complexity
- Third-party JS library (pica, sharp) - Unnecessary dependency

**Implementation Pattern**:

```typescript
async function generateBlurredThumbnail(
  imageData: Blob | ArrayBuffer,
  maxSize: number = 100,
  blurRadius: number = 10,
  quality: number = 0.6
): Promise<Blob> {
  const img = await createImageBitmap(new Blob([imageData]));

  // Scale to fit maxSize while preserving aspect ratio
  const scale = Math.min(maxSize / img.width, maxSize / img.height);
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Apply blur filter
  ctx.filter = `blur(${blurRadius}px)`;

  // Draw slightly larger to avoid edge artifacts
  ctx.drawImage(img, -blurRadius, -blurRadius, width + blurRadius * 2, height + blurRadius * 2);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', quality);
  });
}
```

**Thumbnail Specs**:
- Max dimension: 100-200px
- Blur radius: 10px
- JPEG quality: 60%
- Expected size: 20-50KB

---

## 3. Metadata Storage

### Decision: Tauri Plugin Store with Namespaced Keys

**Rationale**: Already integrated (`@tauri-apps/plugin-store`), provides persistent key-value storage, works with existing patterns in `storage.ts`.

**Alternatives Considered**:
- SQLite (tauri-plugin-sql) - Overkill for simple key-value needs
- IndexedDB - Not accessible from Rust side
- JSON file - Less structured, manual serialization

**Storage Pattern**:

```typescript
// Key naming convention
const metadataKey = (imageId: string) => `image_cache_${imageId}`;
const settingsKey = 'image_cache_settings';
const statsKey = 'image_cache_stats';

// Metadata structure
interface ImageCacheMetadata {
  imageId: string;
  chatId: string;
  remoteReference: string;  // Server URL or ID for re-download
  isCached: boolean;
  fullImagePath: string;
  thumbnailPath: string;
  thumbnailBase64?: string; // Inline for instant display
  lastVerifiedAt: number;   // Unix timestamp
  cachedAt: number;
  fileSize?: number;
}
```

**Persistence Rules** (from spec):
- Metadata persists even when files are deleted (FR-013)
- `isCached` updated lazily on validation (FR-010, FR-011)
- Save immediately after each mutation

---

## 4. SolidJS Integration

### Decision: Context Provider + Store Pattern

**Rationale**: Matches existing patterns (`image-cache-context.tsx`, `auth-store.ts`). Provides reactive state management with lazy initialization.

**Alternatives Considered**:
- Global singleton service - Less testable, no reactivity
- Signals only - Doesn't scale for complex state

**Architecture**:

```typescript
// Store for reactive state
const [cacheState, setCacheState] = createStore<ImageCacheState>({
  isEnabled: true,
  totalSize: 0,
  metadataMap: new Map(),
  pendingDownloads: new Set(),
});

// Context for service access
const ImageCacheContext = createContext<ImageCacheService>();

// Provider wraps app
<ImageCacheProvider>
  <App />
</ImageCacheProvider>
```

**Key Service Methods**:
- `getImageState(imageId)` → CacheState (Cached/PartiallyCache/NotCached/Corrupt)
- `cacheImage(imageId, chatId, imageBlob)` → Promise<void>
- `validateAndRecover(imageId)` → Promise<CacheState>
- `clearCache(filter)` → Promise<CacheClearResult>

---

## 5. Cache Warning Notifications

### Decision: Extend Existing Notification System

**Rationale**: `notifications.ts` already implements debounced system notifications with preferences. Add cache-specific notification type.

**Implementation**:

```typescript
// New notification type
type NotificationType = 'new_message' | 'status_update' | 'task_status_changed' | 'cache_warning';

// Cache warning logic
let lastCacheWarning = 0;
const CACHE_WARNING_INTERVAL = 30 * 60 * 1000; // 30 minutes

async function checkAndWarnCacheSize(currentSize: number) {
  const LIMIT = 500 * 1024 * 1024; // 500MB
  if (currentSize > LIMIT && Date.now() - lastCacheWarning > CACHE_WARNING_INTERVAL) {
    lastCacheWarning = Date.now();
    await showNotification({
      title: 'Storage Warning',
      body: `Image cache has exceeded 500MB (${formatBytes(currentSize)}). Consider clearing old images.`,
      type: 'cache_warning',
    });
  }
}
```

---

## 6. Performance Characteristics

| Operation | Target | Implementation |
|-----------|--------|----------------|
| Thumbnail display | <100ms | Base64 inline in message metadata |
| Sent image display | <200ms | Canvas thumbnail + immediate local save |
| File save (async) | <100ms | tokio::fs with sync_all |
| Cache validation | <10ms per file | Path::exists() check |
| Metadata lookup | <5ms | Tauri Store in-memory |

---

## 7. Error Handling Strategy

| Scenario | Action | Log Level |
|----------|--------|-----------|
| File not found | Mark isCached=false, show thumbnail | DEBUG |
| Disk full | Skip caching, show warning, continue | WARN |
| Permission denied | Skip caching, fallback to remote | WARN |
| Network error on download | Show retry button | INFO |
| Corrupt file | Delete, mark not cached | DEBUG |

**Key Principle**: Missing files are normal cache misses, not errors (FR-012).

---

## 8. Dependencies

### Already Available
- `@tauri-apps/api/core` - invoke() for Rust commands
- `@tauri-apps/plugin-store` - persistent storage
- `tokio` - async runtime (Rust)
- `base64` - encoding (Rust)

### No New Dependencies Required

The implementation uses only browser-native APIs (Canvas, Blob) and existing Tauri plugins.

---

## 9. Key Reference Files

**Rust Backend**:
- `src-tauri/src/lib.rs` - Command registration pattern
- `src-tauri/src/storage.rs` - Tauri Store patterns
- `src-tauri/src/migration.rs` - File system operations
- `src-tauri/src/logging.rs` - Directory management, cleanup

**TypeScript Frontend**:
- `lib/storage.ts` - Storage API wrapper
- `lib/notifications.ts` - Notification system (extend)
- `context/image-cache-context.tsx` - Existing blob cache (enhance)
- `stores/auth-store.ts` - SolidJS store pattern
