/**
 * WhatsApp-Style Local Cache - TypeScript Schema Definitions
 *
 * These types are shared between IT App (Next.js) and Requester App (Tauri/SolidJS).
 * Keep in sync across both codebases.
 *
 * @module cache-schema
 * @version 3.0.0
 */

// =============================================================================
// Database Constants
// =============================================================================

export const DB_NAME_PREFIX = 'support-center';
export const DB_VERSION = 3;

export const STORE_NAMES = {
  MESSAGES: 'messages',
  CHAT_META: 'chat_meta',
  MEDIA_META: 'media_meta',
  MEDIA_BLOBS: 'media_blobs',
  OFFLINE_QUEUE: 'offline_queue',
  CACHE_STATS: 'cache_stats',
} as const;

export const CACHE_LIMITS = {
  BROWSER_MAX_SIZE_MB: 100,
  DESKTOP_MAX_SIZE_MB: 500,
  MESSAGE_TTL_DAYS: 7,
  MEDIA_TTL_DAYS: 30,
  MAX_OFFLINE_OPERATIONS: 100,
  MAX_GAPS_BEFORE_RESYNC: 10,
} as const;

// =============================================================================
// Core Entities
// =============================================================================

/**
 * Cached chat message with sync metadata
 */
export interface CachedMessage {
  // Primary key
  id: string;

  // Relationships & indexes
  requestId: string;
  sequenceNumber: number;

  // Core message data
  senderId: string | null;
  sender: SenderInfo | null;
  content: string;
  createdAt: string; // ISO 8601
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
  tempId?: string;
  clientTempId?: string;
  status: MessageStatus;
  errorMessage?: string;

  // Cache metadata
  _cachedAt: number;
  _syncVersion: number;
}

export interface SenderInfo {
  id: string;
  username: string;
  fullName: string | null;
  isTechnician: boolean;
}

export type MessageStatus = 'pending' | 'sent' | 'failed';

/**
 * Per-chat synchronization state
 */
export interface ChatSyncState {
  requestId: string;

  // Sync checkpoints
  lastSyncedSequence: number;
  lastSyncedAt: number;
  totalMessageCount: number;

  // Gap tracking
  knownGaps: SequenceGap[];

  // Read state
  unreadCount: number;
  lastReadSequence: number;
  lastReadAt: number | null;

  // Cache management
  messageCount: number;
  mediaSize: number;
  lastAccessedAt: number;

  // Server revision
  serverRevision: string | null;
}

export interface SequenceGap {
  startSeq: number;
  endSeq: number;
  detectedAt: number;
}

/**
 * Media file metadata (stored separately from binary data)
 */
export interface CachedMediaMeta {
  id: string; // Format: `${requestId}:${filename}`

  requestId: string;
  messageId: string;
  filename: string;
  originalFilename?: string;

  mimeType: string;
  fileSize: number;

  downloadStatus: MediaDownloadStatus;
  downloadProgress: number;
  downloadedAt: number | null;

  sha256Hash: string | null;
  isVerified: boolean;

  localBlobKey: string | null;
  thumbnailBlobKey: string | null;

  lastAccessedAt: number;
  isPinned: boolean;
  priority: MediaPriority;
}

export type MediaDownloadStatus = 'pending' | 'downloading' | 'completed' | 'failed';
export type MediaPriority = 'high' | 'normal' | 'low';

/**
 * Binary blob storage
 */
export interface CachedMediaBlob {
  key: string;
  data: Blob;
  size: number;
  mimeType: string;
  createdAt: number;
  lastAccessedAt: number;
}

/**
 * Offline operation queue entry
 */
export interface OfflineOperation {
  id: string;
  type: OfflineOperationType;
  requestId: string;
  payload: OfflinePayload;
  status: OfflineStatus;
  createdAt: number;
  attemptedAt: number | null;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: number | null;
  lastError: string | null;
}

export type OfflineOperationType = 'send_message' | 'mark_read';
export type OfflineStatus = 'pending' | 'syncing' | 'completed' | 'failed';

export type OfflinePayload = SendMessagePayload | MarkReadPayload;

export interface SendMessagePayload {
  type: 'send_message';
  content: string;
  tempId: string;
  isScreenshot?: boolean;
  screenshotFileName?: string;
}

export interface MarkReadPayload {
  type: 'mark_read';
  messageIds: string[];
  upToSequence: number;
}

/**
 * Cache statistics (singleton)
 */
export interface CacheStats {
  key: 'stats';

  totalSize: number;
  messagesSize: number;
  mediaSize: number;

  chatCount: number;
  messageCount: number;
  mediaCount: number;

  cacheHits: number;
  cacheMisses: number;
  hitRate: number;

  lastFullSync: number | null;
  lastDeltaSync: number | null;
  pendingOperations: number;

  createdAt: number;
  updatedAt: number;
}

// =============================================================================
// API Types
// =============================================================================

/**
 * Delta sync request parameters
 */
export interface DeltaSyncParams {
  requestId: string;
  sinceSequence: number;
  limit?: number;
}

/**
 * Range query parameters (for gap filling)
 */
export interface RangeQueryParams {
  requestId: string;
  startSequence: number;
  endSequence: number;
}

/**
 * Delta sync response
 */
export interface DeltaSyncResponse {
  messages: CachedMessage[];
  totalCount: number;
  oldestSequence: number | null;
  newestSequence: number | null;
  hasMore: boolean;
  hasNewer: boolean;
}

// =============================================================================
// Service Interfaces
// =============================================================================

/**
 * Message cache service interface
 */
export interface IMessageCache {
  // CRUD
  getMessage(id: string): Promise<CachedMessage | null>;
  getByTempId(tempId: string): Promise<CachedMessage | null>;
  getCachedMessages(requestId: string): Promise<CachedMessage[]>;
  getCachedMessagesRange(
    requestId: string,
    startSeq: number,
    endSeq: number
  ): Promise<CachedMessage[]>;

  addMessage(message: CachedMessage): Promise<void>;
  addMessagesBatch(messages: CachedMessage[]): Promise<void>;
  updateMessage(message: CachedMessage): Promise<void>;
  replaceOptimisticMessage(tempId: string, realMessage: CachedMessage): Promise<void>;

  // Sync state
  getChatMeta(requestId: string): Promise<ChatSyncState | null>;
  updateSyncState(requestId: string, updates: Partial<ChatSyncState>): Promise<void>;

  // Gap detection
  detectGaps(requestId: string): Promise<SequenceGap[]>;
  recordGap(requestId: string, gap: SequenceGap): Promise<void>;
  clearGap(requestId: string, gap: SequenceGap): Promise<void>;

  // Cleanup
  clearChat(requestId: string): Promise<void>;
  clearAll(): Promise<void>;
  cleanupExpiredCache(maxAgeDays?: number): Promise<number>;
  evictOldestChats(bytesToFree: number): Promise<number>;

  // Stats
  getStats(): Promise<CacheStats>;
}

/**
 * Media manager service interface
 */
export interface IMediaManager {
  // Download
  downloadMedia(meta: MediaDownloadRequest): Promise<MediaDownloadResult>;
  downloadThumbnail(requestId: string, filename: string): Promise<Blob | null>;
  getMediaUrl(requestId: string, filename: string): Promise<string | null>;
  isMediaCached(requestId: string, filename: string): Promise<boolean>;

  // Upload (offline queue)
  queueUpload(request: MediaUploadRequest): Promise<string>;
  getUploadStatus(uploadId: string): Promise<UploadStatus | null>;

  // Cache management
  evictMedia(requestId: string, filename: string): Promise<void>;
  evictOldest(bytesToFree: number): Promise<number>;
  pinMedia(requestId: string, filename: string): Promise<void>;
  unpinMedia(requestId: string, filename: string): Promise<void>;

  // Integrity
  verifyIntegrity(requestId: string, filename: string): Promise<boolean>;

  // Stats
  getCacheSize(): Promise<number>;
}

export interface MediaDownloadRequest {
  requestId: string;
  messageId: string;
  filename: string;
  presignedUrl: string;
  expectedSize: number;
  expectedHash?: string;
  priority: MediaPriority;
}

export interface MediaDownloadResult {
  success: boolean;
  localUrl?: string;
  error?: string;
  fromCache: boolean;
}

export interface MediaUploadRequest {
  requestId: string;
  file: File | Blob;
  filename: string;
  mimeType: string;
}

export interface UploadStatus {
  id: string;
  status: OfflineStatus;
  progress: number;
  error?: string;
}

/**
 * Sync engine service interface
 */
export interface ISyncEngine {
  // Lifecycle
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;

  // Sync operations
  syncChat(requestId: string, options?: SyncOptions): Promise<SyncResult>;
  fullResync(requestId: string): Promise<SyncResult>;
  fillGaps(requestId: string): Promise<void>;

  // Offline queue
  queueOperation(operation: Omit<OfflineOperation, 'id' | 'createdAt' | 'status' | 'retryCount'>): Promise<void>;
  processOfflineQueue(): Promise<void>;
  getQueueSize(): number;

  // Events
  onSyncStart(callback: (requestId: string) => void): () => void;
  onSyncComplete(callback: (requestId: string, result: SyncResult) => void): () => void;
  onSyncError(callback: (requestId: string, error: Error) => void): () => void;
}

export interface SyncOptions {
  forceFullSync?: boolean;
  maxMessages?: number;
}

export interface SyncResult {
  success: boolean;
  requestId: string;
  messagesAdded: number;
  messagesUpdated: number;
  gapsDetected: number;
  gapsFilled: number;
  syncDuration: number;
  error?: string;
}

// =============================================================================
// IndexedDB Schema Definition
// =============================================================================

export interface DBSchema {
  [STORE_NAMES.MESSAGES]: {
    key: string;
    value: CachedMessage;
    indexes: {
      by_request: string;
      by_request_sequence: [string, number];
      by_cached_at: number;
    };
  };
  [STORE_NAMES.CHAT_META]: {
    key: string;
    value: ChatSyncState;
    indexes: {
      by_last_accessed: number;
    };
  };
  [STORE_NAMES.MEDIA_META]: {
    key: string;
    value: CachedMediaMeta;
    indexes: {
      by_request: string;
      by_last_accessed: number;
      by_status: MediaDownloadStatus;
    };
  };
  [STORE_NAMES.MEDIA_BLOBS]: {
    key: string;
    value: CachedMediaBlob;
    indexes: {
      by_last_accessed: number;
    };
  };
  [STORE_NAMES.OFFLINE_QUEUE]: {
    key: string;
    value: OfflineOperation;
    indexes: {
      by_status: OfflineStatus;
      by_created: number;
      by_next_retry: number;
    };
  };
  [STORE_NAMES.CACHE_STATS]: {
    key: 'stats';
    value: CacheStats;
  };
}
