# Quickstart: Local Image Caching

**Feature**: 003-image-cache
**Date**: 2026-01-12

## Overview

This guide provides the essential information for implementing local image caching in the Requester Application.

---

## Prerequisites

- Tauri v2 development environment
- Node.js 18+ with npm
- Rust toolchain (for Tauri backend)
- Access to existing Requester App codebase

---

## Quick Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      SolidJS Frontend                        │
├─────────────────────────────────────────────────────────────┤
│  ImageCacheContext  │  ChatImage  │  StorageSettings        │
│  (Reactive State)   │  Component  │  Component              │
└──────────┬──────────┴──────┬──────┴──────────┬──────────────┘
           │                 │                  │
           ▼                 ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│                   ImageCacheService                          │
│  - cacheImage()      - validateImage()    - clearCache()    │
│  - getThumbnail()    - getCacheStats()    - getSettings()   │
└──────────────────────────┬──────────────────────────────────┘
                           │ invoke()
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Tauri Rust Backend                        │
├─────────────────────────────────────────────────────────────┤
│  save_cache_file      │  validate_cache_files               │
│  get_image_metadata   │  save_image_metadata                │
│  clear_chat_cache     │  get_cache_stats                    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  File System                    │  Tauri Plugin Store        │
│  %APPDATA%/.../images/chats/    │  image_cache_* keys        │
└─────────────────────────────────┴────────────────────────────┘
```

---

## Key Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `lib/image-cache/index.ts` | Public API exports |
| `lib/image-cache/image-cache-service.ts` | Core caching logic |
| `lib/image-cache/image-storage.ts` | File system operations |
| `lib/image-cache/metadata-store.ts` | Metadata persistence |
| `lib/image-cache/thumbnail-generator.ts` | Client-side thumbnails |
| `lib/image-cache/cache-monitor.ts` | Size monitoring |
| `context/image-cache-context.tsx` | SolidJS context provider |
| `components/chat/chat-image.tsx` | Image display component |
| `components/settings/storage-settings.tsx` | Settings UI |
| `src-tauri/src/image_cache.rs` | Rust commands module |

### Files to Modify

| File | Changes |
|------|---------|
| `routes/settings.tsx` | Add storage management section |
| `components/image-viewer.tsx` | Cache-aware image loading |
| `lib/notifications.ts` | Add cache warning notification type |
| `types/index.ts` | Add cache-related types |
| `src-tauri/src/lib.rs` | Register new Tauri commands |

---

## Implementation Order

### Phase 1: Backend Foundation (Rust)

1. Create `src-tauri/src/image_cache.rs` module
2. Implement file system commands:
   - `save_cache_file`
   - `validate_cache_files`
   - `delete_cache_file`
3. Implement metadata commands:
   - `get_image_metadata`
   - `save_image_metadata`
   - `mark_image_not_cached`
4. Register commands in `lib.rs`

### Phase 2: Service Layer (TypeScript)

1. Create `lib/image-cache/` module structure
2. Implement `ImageCacheService` class
3. Implement `ThumbnailGenerator` utility
4. Create TypeScript types in `types/index.ts`

### Phase 3: UI Components

1. Create `ChatImage` component with states
2. Create download button and progress indicator
3. Update `image-viewer.tsx` for cache integration
4. Create storage settings components

### Phase 4: Context & Integration

1. Create `ImageCacheProvider` context
2. Integrate with chat message rendering
3. Integrate with SignalR for auto-download
4. Add storage warning notifications

### Phase 5: Settings & Polish

1. Add storage section to settings page
2. Implement selective cache clearing UI
3. Add cache usage display
4. Test all user stories

---

## Code Snippets

### Rust Command Example

```rust
// src-tauri/src/image_cache.rs

use tauri::AppHandle;
use std::path::PathBuf;
use tokio::fs;

#[tauri::command]
pub async fn save_cache_file(
    app: AppHandle,
    image_id: String,
    chat_id: String,
    data: Vec<u8>,
    filename: String,
) -> Result<String, String> {
    let base_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let cache_dir = base_dir
        .join("images")
        .join("chats")
        .join(&chat_id)
        .join(&image_id);

    fs::create_dir_all(&cache_dir).await
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    let file_path = cache_dir.join(&filename);

    fs::write(&file_path, &data).await
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}
```

### TypeScript Service Example

```typescript
// lib/image-cache/image-cache-service.ts

import { invoke } from '@tauri-apps/api/core';
import type { ImageCacheMetadata, CacheState, CacheResult } from './types';

export class ImageCacheService {
  async cacheImage(
    imageId: string,
    chatId: string,
    imageData: Uint8Array,
  ): Promise<CacheResult> {
    try {
      // Save full image
      const fullPath = await invoke<string>('save_cache_file', {
        imageId,
        chatId,
        data: Array.from(imageData),
        filename: 'full.jpg',
      });

      // Update metadata
      await this.updateMetadata(imageId, {
        isCached: true,
        fullImagePath: fullPath,
        cachedAt: Date.now(),
        lastVerifiedAt: Date.now(),
      });

      return { success: true, state: 'cached', fullPath };
    } catch (error) {
      return { success: false, state: 'not_cached', error: String(error) };
    }
  }
}
```

### SolidJS Component Example

```tsx
// components/chat/chat-image.tsx

import { Show, createMemo } from 'solid-js';
import { useImageCache } from '../../context/image-cache-context';

export function ChatImage(props: { imageId: string; chatId: string; thumbnailBase64?: string }) {
  const cache = useImageCache();
  const state = createMemo(() => cache.getImageState(props.imageId)());
  const progress = createMemo(() => cache.getDownloadProgress(props.imageId)());

  return (
    <div class="relative">
      {/* Always show thumbnail first */}
      <img
        src={props.thumbnailBase64 || '/placeholder.jpg'}
        class="blur-sm w-full h-auto"
        alt=""
      />

      <Show when={state() === 'cached'}>
        {/* Overlay with full image when cached */}
        <img
          src={`file://${cache.getImagePath(props.imageId)}`}
          class="absolute inset-0 w-full h-full object-cover"
          alt=""
        />
      </Show>

      <Show when={state() !== 'cached' && progress() === null}>
        {/* Download button when not cached and not downloading */}
        <button
          class="absolute inset-0 flex items-center justify-center bg-black/30"
          onClick={() => cache.service.startDownload({
            imageId: props.imageId,
            chatId: props.chatId,
          })}
        >
          <DownloadIcon class="w-8 h-8 text-white" />
        </button>
      </Show>

      <Show when={progress() !== null}>
        {/* Progress indicator when downloading */}
        <div class="absolute inset-0 flex items-center justify-center bg-black/30">
          <CircularProgress value={progress()!} />
        </div>
      </Show>
    </div>
  );
}
```

---

## Testing Checklist

### Manual Testing

- [ ] Open chat with images → thumbnails display instantly (<100ms)
- [ ] Auto-download works when chat open + setting ON
- [ ] Download button appears when not cached
- [ ] Progress indicator shows during download
- [ ] Cached images display without network request
- [ ] Sent images appear immediately
- [ ] Delete cached files → app recovers gracefully
- [ ] Storage usage displays correctly in settings
- [ ] Clear by chat works
- [ ] Clear by date range works
- [ ] Warning notification appears when over 500MB
- [ ] Toggle setting ON/OFF works correctly

### Edge Cases

- [ ] Disk full handling
- [ ] Permission denied handling
- [ ] Network error during download
- [ ] Rapid scrolling (download prioritization)
- [ ] Corrupt file detection

---

## Key References

| Document | Purpose |
|----------|---------|
| [spec.md](./spec.md) | Full requirements and user stories |
| [data-model.md](./data-model.md) | Entity definitions and storage layout |
| [contracts/tauri-commands.md](./contracts/tauri-commands.md) | Rust command signatures |
| [contracts/typescript-api.md](./contracts/typescript-api.md) | Service API contracts |
| [research.md](./research.md) | Technical decisions and patterns |

---

## Common Patterns

### Lazy Validation

```typescript
// Check files only when needed, not on startup
async function getImageState(imageId: string): Promise<CacheState> {
  const metadata = await this.getMetadata(imageId);
  if (!metadata) return 'not_cached';

  if (metadata.isCached) {
    // Validate files actually exist
    const valid = await invoke<boolean>('validate_cache_files', {
      fullPath: metadata.fullImagePath,
      thumbPath: metadata.thumbnailPath,
    });

    if (!valid) {
      await this.markNotCached(imageId);
      return 'not_cached';
    }
  }

  return metadata.isCached ? 'cached' : 'not_cached';
}
```

### Cache Miss as Normal Case

```typescript
// Never throw on missing files - it's expected behavior
catch (error) {
  // Log as INFO, not ERROR
  console.info(`Cache miss for image ${imageId}, falling back to remote`);
  return { state: 'not_cached' };
}
```

### Immediate Display for Outgoing

```typescript
// Display instantly, upload in background
async function sendImage(file: File) {
  const imageId = crypto.randomUUID();

  // Cache immediately (sync with UI)
  await cacheService.cacheOutgoingImage({ imageId, chatId, imageData: file });

  // Return immediately for UI display
  setMessages(prev => [...prev, { id: imageId, type: 'image', sending: true }]);

  // Upload in background
  uploadToServer(imageId, file).then(() => {
    setMessages(prev => prev.map(m =>
      m.id === imageId ? { ...m, sending: false } : m
    ));
  });
}
```
