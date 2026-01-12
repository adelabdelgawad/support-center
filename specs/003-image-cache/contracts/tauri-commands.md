# Tauri Command Contracts

**Feature**: 003-image-cache
**Date**: 2026-01-12

## Overview

Internal API contracts for Rust backend commands invoked from TypeScript frontend. These are Tauri IPC commands, not HTTP APIs.

---

## File System Commands

### save_cache_file

Save image data to the local cache directory.

**Rust Signature**:
```rust
#[tauri::command]
async fn save_cache_file(
    app: tauri::AppHandle,
    image_id: String,
    chat_id: String,
    data: Vec<u8>,       // Image bytes
    filename: String,    // "full.jpg" or "thumb.jpg"
) -> Result<String, String>  // Returns absolute path
```

**TypeScript Invocation**:
```typescript
const path = await invoke<string>('save_cache_file', {
  imageId: 'uuid-123',
  chatId: 'chat-456',
  data: Array.from(new Uint8Array(imageBlob)),
  filename: 'full.jpg',
});
```

**Behavior**:
- Creates directory structure if not exists: `images/chats/{chatId}/{imageId}/`
- Writes file atomically (temp file + rename)
- Returns absolute path to saved file

**Errors**:
- `"Disk full"` - No space available
- `"Permission denied"` - Cannot write to directory
- `"Invalid filename"` - Only "full.jpg" or "thumb.jpg" allowed

---

### validate_cache_files

Check if cached files exist and are readable.

**Rust Signature**:
```rust
#[tauri::command]
fn validate_cache_files(
    full_path: String,
    thumb_path: String,
) -> Result<ValidationResult, String>

#[derive(Serialize)]
struct ValidationResult {
    full_exists: bool,
    thumb_exists: bool,
    full_size: Option<u64>,
    thumb_size: Option<u64>,
    full_readable: bool,
    thumb_readable: bool,
}
```

**TypeScript Invocation**:
```typescript
const result = await invoke<ValidationResult>('validate_cache_files', {
  fullPath: '/path/to/full.jpg',
  thumbPath: '/path/to/thumb.jpg',
});
```

**Behavior**:
- Checks file existence
- Attempts to read first few bytes (readability check)
- Returns size if file exists
- Does NOT throw on missing files (normal case)

---

### delete_cache_file

Delete a single cached file.

**Rust Signature**:
```rust
#[tauri::command]
async fn delete_cache_file(
    path: String,
) -> Result<(), String>
```

**TypeScript Invocation**:
```typescript
await invoke('delete_cache_file', { path: '/path/to/full.jpg' });
```

**Behavior**:
- Silently succeeds if file doesn't exist
- Removes empty parent directories (cleanup)

---

### delete_cache_directory

Delete entire cache directory for a chat or image.

**Rust Signature**:
```rust
#[tauri::command]
async fn delete_cache_directory(
    path: String,
) -> Result<u64, String>  // Returns bytes freed
```

**TypeScript Invocation**:
```typescript
const bytesFreed = await invoke<number>('delete_cache_directory', {
  path: '/path/to/images/chats/chat-123',
});
```

**Behavior**:
- Recursively deletes directory and contents
- Returns total bytes freed
- Silently succeeds if directory doesn't exist

---

### get_cache_stats

Calculate aggregate cache statistics.

**Rust Signature**:
```rust
#[tauri::command]
async fn get_cache_stats(
    app: tauri::AppHandle,
) -> Result<CacheStats, String>

#[derive(Serialize)]
struct CacheStats {
    total_size_bytes: u64,
    image_count: u32,
    chat_breakdown: Vec<ChatCacheInfo>,
}

#[derive(Serialize)]
struct ChatCacheInfo {
    chat_id: String,
    size_bytes: u64,
    image_count: u32,
}
```

**TypeScript Invocation**:
```typescript
const stats = await invoke<CacheStats>('get_cache_stats');
```

**Behavior**:
- Scans `images/chats/` directory recursively
- Aggregates size per chat
- Returns breakdown for UI display

---

### get_available_disk_space

Check available disk space on the cache drive.

**Rust Signature**:
```rust
#[tauri::command]
fn get_available_disk_space(
    app: tauri::AppHandle,
) -> Result<u64, String>  // Bytes available
```

**TypeScript Invocation**:
```typescript
const availableBytes = await invoke<number>('get_available_disk_space');
```

---

## Metadata Commands

### get_image_metadata

Retrieve cached metadata for an image.

**Rust Signature**:
```rust
#[tauri::command]
fn get_image_metadata(
    app: tauri::AppHandle,
    image_id: String,
) -> Result<Option<ImageCacheMetadata>, String>
```

**TypeScript Invocation**:
```typescript
const metadata = await invoke<ImageCacheMetadata | null>('get_image_metadata', {
  imageId: 'uuid-123',
});
```

**Behavior**:
- Returns `null` if no metadata exists (not an error)
- Reads from Tauri Plugin Store

---

### save_image_metadata

Persist image cache metadata.

**Rust Signature**:
```rust
#[tauri::command]
fn save_image_metadata(
    app: tauri::AppHandle,
    metadata: ImageCacheMetadata,
) -> Result<(), String>
```

**TypeScript Invocation**:
```typescript
await invoke('save_image_metadata', {
  metadata: {
    imageId: 'uuid-123',
    chatId: 'chat-456',
    isCached: true,
    // ... other fields
  },
});
```

**Behavior**:
- Upserts metadata (creates or updates)
- Immediately persists to disk (store.save())

---

### mark_image_not_cached

Update metadata to reflect cache miss (files deleted).

**Rust Signature**:
```rust
#[tauri::command]
fn mark_image_not_cached(
    app: tauri::AppHandle,
    image_id: String,
) -> Result<(), String>
```

**TypeScript Invocation**:
```typescript
await invoke('mark_image_not_cached', { imageId: 'uuid-123' });
```

**Behavior**:
- Sets `isCached: false`, `hasThumbnail: false`
- Updates `lastVerifiedAt` to current timestamp
- Does NOT delete metadata record (FR-013)

---

### get_all_image_metadata

Retrieve all cached image metadata (for index rebuild).

**Rust Signature**:
```rust
#[tauri::command]
fn get_all_image_metadata(
    app: tauri::AppHandle,
) -> Result<Vec<ImageCacheMetadata>, String>
```

**TypeScript Invocation**:
```typescript
const allMetadata = await invoke<ImageCacheMetadata[]>('get_all_image_metadata');
```

**Behavior**:
- Scans all `image_cache_*` keys in store
- Returns array of metadata objects
- Used for index rebuild on app startup

---

## Batch Operations

### clear_chat_cache

Delete all cached images for a specific chat.

**Rust Signature**:
```rust
#[tauri::command]
async fn clear_chat_cache(
    app: tauri::AppHandle,
    chat_id: String,
) -> Result<ClearResult, String>

#[derive(Serialize)]
struct ClearResult {
    files_deleted: u32,
    bytes_freed: u64,
    metadata_updated: u32,
}
```

**TypeScript Invocation**:
```typescript
const result = await invoke<ClearResult>('clear_chat_cache', {
  chatId: 'chat-456',
});
```

**Behavior**:
- Deletes all files in `images/chats/{chatId}/`
- Updates metadata for all affected images (`isCached: false`)
- Returns summary of operations

---

### clear_cache_by_date_range

Delete cached images within a date range.

**Rust Signature**:
```rust
#[tauri::command]
async fn clear_cache_by_date_range(
    app: tauri::AppHandle,
    before_timestamp: Option<u64>,  // Clear images cached before this
    after_timestamp: Option<u64>,   // Clear images cached after this
) -> Result<ClearResult, String>
```

**TypeScript Invocation**:
```typescript
// Clear images cached more than 30 days ago
const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
const result = await invoke<ClearResult>('clear_cache_by_date_range', {
  beforeTimestamp: thirtyDaysAgo,
  afterTimestamp: null,
});
```

**Behavior**:
- Scans metadata for matching `cachedAt` timestamps
- Deletes matching files and updates metadata
- At least one timestamp must be provided

---

## Error Handling

All commands follow this error pattern:

```rust
Result<T, String>  // String contains human-readable error message
```

**Error Categories**:
- `"Disk full: ..."` - Storage exhausted
- `"Permission denied: ..."` - File system access error
- `"Invalid argument: ..."` - Bad input parameter
- `"Store error: ..."` - Tauri Plugin Store failure
- `"IO error: ..."` - General file system error

**Frontend Handling**:
```typescript
try {
  await invoke('save_cache_file', { ... });
} catch (error) {
  const message = error as string;
  if (message.startsWith('Disk full')) {
    // Handle disk full
  }
}
```
