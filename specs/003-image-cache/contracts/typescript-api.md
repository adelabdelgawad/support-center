# TypeScript Service API Contracts

**Feature**: 003-image-cache
**Date**: 2026-01-12

## Overview

Internal TypeScript API for the image cache service layer. These are the public interfaces exposed to UI components.

---

## ImageCacheService

Main service class for cache operations.

### Constructor

```typescript
class ImageCacheService {
  constructor(options?: ImageCacheOptions);
}

interface ImageCacheOptions {
  /** Enable/disable caching (default: true) */
  enabled?: boolean;
  /** Cache size limit in bytes (default: 500MB) */
  limitBytes?: number;
  /** Warning notification interval (default: 30 minutes) */
  warningIntervalMs?: number;
}
```

---

### Core Methods

#### getImageState

Get the current cache state for an image.

```typescript
async getImageState(imageId: string): Promise<CacheState>
```

**Returns**: `'cached' | 'partial' | 'not_cached' | 'corrupt'`

**Behavior**:
- Checks metadata first (fast path)
- If `isCached: true`, validates files exist (lazy validation)
- Updates metadata if files missing

---

#### cacheImage

Download and cache a full image.

```typescript
async cacheImage(params: CacheImageParams): Promise<CacheResult>

interface CacheImageParams {
  imageId: string;
  chatId: string;
  remoteUrl: string;
  thumbnailBase64?: string;  // Optional: save inline thumbnail
}

interface CacheResult {
  success: boolean;
  state: CacheState;
  fullPath?: string;
  thumbnailPath?: string;
  error?: string;
}
```

**Behavior**:
- Downloads full image from `remoteUrl`
- Saves to local cache directory
- Updates metadata
- Triggers cache size check

---

#### cacheOutgoingImage

Cache a locally-generated image (for sending).

```typescript
async cacheOutgoingImage(params: OutgoingImageParams): Promise<CacheResult>

interface OutgoingImageParams {
  imageId: string;       // Client-generated UUID
  chatId: string;
  imageData: Blob;       // Full image data
  generateThumbnail?: boolean;  // Default: true
}
```

**Behavior**:
- Saves full image immediately
- Generates blurred thumbnail (if requested)
- Saves thumbnail
- Updates metadata
- Returns instantly for UI display

---

#### getImagePath

Get local file path for a cached image.

```typescript
async getImagePath(imageId: string, type: 'full' | 'thumb'): Promise<string | null>
```

**Returns**: Absolute file path or `null` if not cached

---

#### getThumbnailDataUrl

Get thumbnail as data URL for instant display.

```typescript
async getThumbnailDataUrl(imageId: string): Promise<string | null>
```

**Returns**: `data:image/jpeg;base64,...` or `null`

**Behavior**:
- First checks inline `thumbnailBase64` in metadata
- Falls back to reading `thumb.jpg` file
- Returns `null` if no thumbnail available

---

### Validation Methods

#### validateImage

Validate cache state and update metadata.

```typescript
async validateImage(imageId: string): Promise<ValidationResult>

interface ValidationResult {
  previousState: CacheState;
  currentState: CacheState;
  metadataUpdated: boolean;
}
```

**Behavior**:
- Checks file existence
- Updates metadata if state changed
- Does NOT throw on missing files

---

#### validateChat

Validate all cached images for a chat.

```typescript
async validateChat(chatId: string): Promise<ChatValidationResult>

interface ChatValidationResult {
  imagesValidated: number;
  stateChanges: number;
  currentStates: Map<string, CacheState>;
}
```

---

### Storage Management

#### getCacheStats

Get aggregate cache statistics.

```typescript
async getCacheStats(): Promise<CacheStats>

interface CacheStats {
  totalSizeBytes: number;
  imageCount: number;
  chatBreakdown: ChatCacheInfo[];
  isOverLimit: boolean;
  limitBytes: number;
}

interface ChatCacheInfo {
  chatId: string;
  chatTitle?: string;
  sizeBytes: number;
  imageCount: number;
  oldestCacheDate: number;
  newestCacheDate: number;
}
```

---

#### clearChatCache

Clear all cached images for a chat.

```typescript
async clearChatCache(chatId: string): Promise<ClearResult>

interface ClearResult {
  filesDeleted: number;
  bytesFreed: number;
  metadataUpdated: number;
}
```

---

#### clearCacheByDateRange

Clear cached images within a date range.

```typescript
async clearCacheByDateRange(options: DateRangeOptions): Promise<ClearResult>

interface DateRangeOptions {
  before?: Date;  // Clear images cached before this date
  after?: Date;   // Clear images cached after this date
}
```

**Note**: At least one of `before` or `after` must be provided.

---

### Settings Methods

#### getSettings

Get current cache settings.

```typescript
async getSettings(): Promise<CacheSettings>

interface CacheSettings {
  isEnabled: boolean;
  limitBytes: number;
  warningIntervalMs: number;
}
```

---

#### updateSettings

Update cache settings.

```typescript
async updateSettings(settings: Partial<CacheSettings>): Promise<void>
```

---

### Download Management

#### startDownload

Start downloading an image (with progress tracking).

```typescript
async startDownload(params: DownloadParams): Promise<DownloadHandle>

interface DownloadParams {
  imageId: string;
  chatId: string;
  remoteUrl: string;
}

interface DownloadHandle {
  imageId: string;
  abort: () => void;
  onProgress: (callback: (progress: number) => void) => void;
  result: Promise<CacheResult>;
}
```

**Behavior**:
- Returns handle immediately
- Progress updates via callback (0-100)
- Can be aborted via `abort()`
- `result` resolves when complete

---

#### getActiveDownloads

Get list of in-progress downloads.

```typescript
getActiveDownloads(): DownloadState[]

interface DownloadState {
  imageId: string;
  chatId: string;
  status: 'pending' | 'downloading' | 'completed' | 'failed';
  progress: number;
  error?: string;
}
```

---

## ImageCacheContext

SolidJS context for cache state and service access.

### Provider

```tsx
<ImageCacheProvider>
  <App />
</ImageCacheProvider>
```

### Hook

```typescript
function useImageCache(): ImageCacheContext

interface ImageCacheContext {
  // Service instance
  service: ImageCacheService;

  // Reactive state
  isEnabled: Accessor<boolean>;
  totalSizeBytes: Accessor<number>;
  isOverLimit: Accessor<boolean>;

  // Convenience methods
  getImageState: (imageId: string) => Accessor<CacheState>;
  getDownloadProgress: (imageId: string) => Accessor<number | null>;

  // Actions
  toggleEnabled: () => Promise<void>;
  refreshStats: () => Promise<void>;
}
```

---

## Event Handlers

### onImageCached

Callback when an image is successfully cached.

```typescript
service.on('imageCached', (event: ImageCachedEvent) => void)

interface ImageCachedEvent {
  imageId: string;
  chatId: string;
  sizeBytes: number;
  isAutoDownload: boolean;
}
```

---

### onCacheMiss

Callback when a cache miss is detected (files deleted).

```typescript
service.on('cacheMiss', (event: CacheMissEvent) => void)

interface CacheMissEvent {
  imageId: string;
  chatId: string;
  previousState: CacheState;
}
```

---

### onStorageWarning

Callback when cache exceeds size limit.

```typescript
service.on('storageWarning', (event: StorageWarningEvent) => void)

interface StorageWarningEvent {
  currentSizeBytes: number;
  limitBytes: number;
  percentUsed: number;
}
```

---

## Thumbnail Generator

Utility for client-side thumbnail generation.

```typescript
class ThumbnailGenerator {
  /**
   * Generate a blurred thumbnail from image data
   * @param imageData - Full image as Blob or ArrayBuffer
   * @param options - Generation options
   * @returns JPEG thumbnail as Blob
   */
  static async generate(
    imageData: Blob | ArrayBuffer,
    options?: ThumbnailOptions
  ): Promise<Blob>
}

interface ThumbnailOptions {
  maxSize?: number;       // Max dimension in pixels (default: 100)
  blurRadius?: number;    // Blur amount in pixels (default: 10)
  quality?: number;       // JPEG quality 0-1 (default: 0.6)
}
```

---

## Usage Examples

### Displaying a Chat Image

```tsx
function ChatImage(props: { imageId: string; chatId: string }) {
  const cache = useImageCache();
  const state = cache.getImageState(props.imageId);
  const progress = cache.getDownloadProgress(props.imageId);

  return (
    <Show when={state() === 'cached'} fallback={
      <Show when={progress() !== null} fallback={
        <ThumbnailWithDownloadButton
          imageId={props.imageId}
          chatId={props.chatId}
          onDownload={() => cache.service.startDownload({
            imageId: props.imageId,
            chatId: props.chatId,
            remoteUrl: getRemoteUrl(props.imageId),
          })}
        />
      }>
        <ThumbnailWithProgress progress={progress()!} />
      </Show>
    }>
      <CachedImage imageId={props.imageId} />
    </Show>
  );
}
```

### Sending an Image

```typescript
async function sendImage(chatId: string, file: File) {
  const imageId = crypto.randomUUID();

  // Cache immediately for instant display
  const result = await cacheService.cacheOutgoingImage({
    imageId,
    chatId,
    imageData: file,
    generateThumbnail: true,
  });

  // Upload in background
  uploadToServer(imageId, chatId, file);

  return { imageId, localPath: result.fullPath };
}
```
