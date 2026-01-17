/**
 * SQLite Message Cache for Tauri App
 *
 * Provides instant chat loading by caching messages locally using Tauri SQLite.
 * Implements deterministic sync validation using per-chat sequence numbers.
 *
 * Features:
 * - Instant message retrieval (sub-10ms with SQLite indexes)
 * - Sync state tracking (UNKNOWN, SYNCED, OUT_OF_SYNC)
 * - Sequence-based validation for deterministic sync
 * - Automatic cache cleanup (7-day expiry)
 * - Offline support foundation
 */

import Database from "@tauri-apps/plugin-sql";
import type { ChatMessage, ChatSyncState, ChatSyncMeta, SequenceValidationResult } from "@/types";

const DB_PATH = "sqlite:message_cache.db";
const CACHE_EXPIRY_DAYS = 7;

/**
 * Serialize a ChatMessage for SQLite storage
 * Converts objects to JSON strings for storage
 */
function serializeMessage(message: ChatMessage): Record<string, unknown> {
  return {
    id: message.id,
    request_id: message.requestId,
    sender_id: message.senderId,
    sender_json: message.sender ? JSON.stringify(message.sender) : null,
    content: message.content,
    sequence_number: message.sequenceNumber ?? null,
    is_screenshot: message.isScreenshot ? 1 : 0,
    screenshot_file_name: message.screenshotFileName ?? null,
    is_read_by_current_user: message.isReadByCurrentUser ? 1 : 0,
    created_at: message.createdAt,
    updated_at: message.updatedAt,
    status: message.status ?? null,
    temp_id: message.tempId ?? null,
    client_temp_id: message.clientTempId ?? null,
    is_system_message: message.isSystemMessage ? 1 : 0,
    file_name: message.fileName ?? null,
    file_size: message.fileSize ?? null,
    file_mime_type: message.fileMimeType ?? null,
    cached_at: Date.now(),
  };
}

/**
 * Deserialize a row from SQLite to ChatMessage
 */
function deserializeMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: row.id as string,
    requestId: row.request_id as string,
    senderId: row.sender_id as string | null,
    sender: row.sender_json ? JSON.parse(row.sender_json as string) : undefined,
    content: row.content as string,
    sequenceNumber: row.sequence_number as number | undefined,
    isScreenshot: Boolean(row.is_screenshot),
    screenshotFileName: row.screenshot_file_name as string | undefined,
    isReadByCurrentUser: Boolean(row.is_read_by_current_user),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    status: row.status as "pending" | "sent" | "failed" | undefined,
    tempId: row.temp_id as string | undefined,
    clientTempId: row.client_temp_id as string | undefined,
    isSystemMessage: row.is_system_message ? Boolean(row.is_system_message) : undefined,
    fileName: row.file_name as string | undefined,
    fileSize: row.file_size as number | undefined,
    fileMimeType: row.file_mime_type as string | undefined,
  };
}

class SQLiteMessageCacheService {
  private db: Database | null = null;
  private dbPromise: Promise<Database> | null = null;
  private initialized = false;

  /**
   * Initialize SQLite database with schema
   */
  private async getDB(): Promise<Database> {
    if (this.db && this.initialized) return this.db;

    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = (async () => {
      try {
        const db = await Database.load(DB_PATH);
        this.db = db;

        // Create tables if not exist
        await db.execute(`
          CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            request_id TEXT NOT NULL,
            sender_id TEXT,
            sender_json TEXT,
            content TEXT NOT NULL,
            sequence_number INTEGER,
            is_screenshot INTEGER DEFAULT 0,
            screenshot_file_name TEXT,
            is_read_by_current_user INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT,
            status TEXT,
            temp_id TEXT,
            client_temp_id TEXT,
            is_system_message INTEGER DEFAULT 0,
            file_name TEXT,
            file_size INTEGER,
            file_mime_type TEXT,
            cached_at INTEGER NOT NULL
          )
        `);

        // Create indexes for efficient queries
        await db.execute(`
          CREATE INDEX IF NOT EXISTS idx_messages_request_id
          ON messages(request_id)
        `);

        await db.execute(`
          CREATE INDEX IF NOT EXISTS idx_messages_request_sequence
          ON messages(request_id, sequence_number)
        `);

        await db.execute(`
          CREATE INDEX IF NOT EXISTS idx_messages_cached_at
          ON messages(cached_at)
        `);

        // Create chat sync state table
        await db.execute(`
          CREATE TABLE IF NOT EXISTS chat_sync_state (
            request_id TEXT PRIMARY KEY,
            local_min_seq INTEGER,
            local_max_seq INTEGER,
            last_known_backend_seq INTEGER,
            sync_state TEXT NOT NULL DEFAULT 'UNKNOWN',
            last_validated_at INTEGER NOT NULL,
            message_count INTEGER DEFAULT 0
          )
        `);

        // Create chat metadata table (for general metadata)
        await db.execute(`
          CREATE TABLE IF NOT EXISTS chat_meta (
            request_id TEXT PRIMARY KEY,
            latest_sequence INTEGER,
            last_updated INTEGER NOT NULL,
            message_count INTEGER DEFAULT 0
          )
        `);

        this.initialized = true;
        console.log("[SQLiteMessageCache] Database initialized successfully");
        return db;
      } catch (error) {
        console.error("[SQLiteMessageCache] Failed to initialize database:", error);
        throw error;
      }
    })();

    return this.dbPromise;
  }

  // ==========================================================================
  // Message Operations
  // ==========================================================================

  /**
   * Get cached messages for a chat
   * Returns messages sorted by sequence number
   */
  async getCachedMessages(requestId: string): Promise<ChatMessage[]> {
    try {
      const db = await this.getDB();
      const rows = await db.select<Record<string, unknown>[]>(
        `SELECT * FROM messages WHERE request_id = ? ORDER BY sequence_number ASC`,
        [requestId]
      );
      return rows.map(deserializeMessage);
    } catch (error) {
      console.error("[SQLiteMessageCache] getCachedMessages error:", error);
      return [];
    }
  }

  /**
   * Cache messages for a chat
   * Replaces all existing messages for this chat
   */
  async cacheMessages(requestId: string, messages: ChatMessage[]): Promise<void> {
    if (messages.length === 0) return;

    try {
      const db = await this.getDB();

      // Delete existing messages for this chat
      await db.execute(`DELETE FROM messages WHERE request_id = ?`, [requestId]);

      // Insert new messages
      for (const message of messages) {
        const data = serializeMessage(message);
        await db.execute(
          `INSERT OR REPLACE INTO messages
           (id, request_id, sender_id, sender_json, content, sequence_number,
            is_screenshot, screenshot_file_name, is_read_by_current_user,
            created_at, updated_at, status, temp_id, client_temp_id,
            is_system_message, file_name, file_size, file_mime_type, cached_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            data.id, data.request_id, data.sender_id, data.sender_json,
            data.content, data.sequence_number, data.is_screenshot,
            data.screenshot_file_name, data.is_read_by_current_user,
            data.created_at, data.updated_at, data.status, data.temp_id,
            data.client_temp_id, data.is_system_message, data.file_name,
            data.file_size, data.file_mime_type, data.cached_at
          ]
        );
      }

      // Update chat metadata
      const latestSequence = Math.max(...messages.map((m) => m.sequenceNumber ?? 0));
      await db.execute(
        `INSERT OR REPLACE INTO chat_meta (request_id, latest_sequence, last_updated, message_count)
         VALUES (?, ?, ?, ?)`,
        [requestId, latestSequence, Date.now(), messages.length]
      );

      // Update sync state's local sequences
      await this.updateLocalSequences(requestId);
    } catch (error) {
      console.error("[SQLiteMessageCache] cacheMessages error:", error);
    }
  }

  /**
   * Add a single message to the cache
   */
  async addMessage(message: ChatMessage): Promise<void> {
    try {
      const db = await this.getDB();
      const data = serializeMessage(message);

      await db.execute(
        `INSERT OR REPLACE INTO messages
         (id, request_id, sender_id, sender_json, content, sequence_number,
          is_screenshot, screenshot_file_name, is_read_by_current_user,
          created_at, updated_at, status, temp_id, client_temp_id,
          is_system_message, file_name, file_size, file_mime_type, cached_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.id, data.request_id, data.sender_id, data.sender_json,
          data.content, data.sequence_number, data.is_screenshot,
          data.screenshot_file_name, data.is_read_by_current_user,
          data.created_at, data.updated_at, data.status, data.temp_id,
          data.client_temp_id, data.is_system_message, data.file_name,
          data.file_size, data.file_mime_type, data.cached_at
        ]
      );

      // Update chat metadata if this message is newer
      const seqNum = message.sequenceNumber ?? 0;
      await db.execute(
        `INSERT INTO chat_meta (request_id, latest_sequence, last_updated, message_count)
         VALUES (?, ?, ?, 1)
         ON CONFLICT(request_id) DO UPDATE SET
           latest_sequence = MAX(latest_sequence, excluded.latest_sequence),
           last_updated = excluded.last_updated,
           message_count = message_count + 1`,
        [message.requestId, seqNum, Date.now()]
      );

      // Update sync state's local sequences
      await this.updateLocalSequences(message.requestId);
    } catch (error) {
      console.error("[SQLiteMessageCache] addMessage error:", error);
    }
  }

  /**
   * Replace an optimistic message with the real one
   */
  async replaceOptimisticMessage(tempId: string, realMessage: ChatMessage): Promise<void> {
    try {
      const db = await this.getDB();

      // Delete optimistic message
      await db.execute(`DELETE FROM messages WHERE id = ?`, [tempId]);

      // Add real message
      await this.addMessage(realMessage);
    } catch (error) {
      console.error("[SQLiteMessageCache] replaceOptimisticMessage error:", error);
    }
  }

  /**
   * Clear cache for a specific chat
   */
  async clearChat(requestId: string): Promise<void> {
    try {
      const db = await this.getDB();
      await db.execute(`DELETE FROM messages WHERE request_id = ?`, [requestId]);
      await db.execute(`DELETE FROM chat_meta WHERE request_id = ?`, [requestId]);
      await db.execute(`DELETE FROM chat_sync_state WHERE request_id = ?`, [requestId]);
    } catch (error) {
      console.error("[SQLiteMessageCache] clearChat error:", error);
    }
  }

  // ==========================================================================
  // Sync State Operations
  // ==========================================================================

  /**
   * Get sync metadata for a chat
   */
  async getSyncMeta(requestId: string): Promise<ChatSyncMeta | null> {
    try {
      const db = await this.getDB();
      const rows = await db.select<Record<string, unknown>[]>(
        `SELECT * FROM chat_sync_state WHERE request_id = ?`,
        [requestId]
      );

      if (rows.length === 0) return null;

      const row = rows[0];
      return {
        requestId: row.request_id as string,
        localMinSeq: row.local_min_seq as number | null,
        localMaxSeq: row.local_max_seq as number | null,
        lastKnownBackendSeq: row.last_known_backend_seq as number | null,
        syncState: row.sync_state as ChatSyncState,
        lastValidatedAt: row.last_validated_at as number,
        messageCount: row.message_count as number,
      };
    } catch (error) {
      console.error("[SQLiteMessageCache] getSyncMeta error:", error);
      return null;
    }
  }

  /**
   * Update sync state for a chat
   */
  async updateSyncState(requestId: string, state: ChatSyncState): Promise<void> {
    try {
      const db = await this.getDB();
      await db.execute(
        `INSERT INTO chat_sync_state (request_id, sync_state, last_validated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(request_id) DO UPDATE SET
           sync_state = excluded.sync_state,
           last_validated_at = excluded.last_validated_at`,
        [requestId, state, Date.now()]
      );
    } catch (error) {
      console.error("[SQLiteMessageCache] updateSyncState error:", error);
    }
  }

  /**
   * Update the expected backend sequence number for a chat
   * Called when ticket list is fetched with lastMessageSequence
   */
  async updateBackendSequence(requestId: string, seq: number): Promise<void> {
    try {
      const db = await this.getDB();
      await db.execute(
        `INSERT INTO chat_sync_state (request_id, last_known_backend_seq, sync_state, last_validated_at)
         VALUES (?, ?, 'UNKNOWN', ?)
         ON CONFLICT(request_id) DO UPDATE SET
           last_known_backend_seq = excluded.last_known_backend_seq`,
        [requestId, seq, Date.now()]
      );
    } catch (error) {
      console.error("[SQLiteMessageCache] updateBackendSequence error:", error);
    }
  }

  /**
   * Update local sequence bounds from cached messages
   */
  private async updateLocalSequences(requestId: string): Promise<void> {
    try {
      const db = await this.getDB();

      // Get min/max sequences and count from messages
      const rows = await db.select<Record<string, unknown>[]>(
        `SELECT
           MIN(sequence_number) as min_seq,
           MAX(sequence_number) as max_seq,
           COUNT(*) as count
         FROM messages
         WHERE request_id = ? AND sequence_number IS NOT NULL`,
        [requestId]
      );

      if (rows.length === 0) return;

      const { min_seq, max_seq, count } = rows[0];

      await db.execute(
        `INSERT INTO chat_sync_state (request_id, local_min_seq, local_max_seq, message_count, sync_state, last_validated_at)
         VALUES (?, ?, ?, ?, 'UNKNOWN', ?)
         ON CONFLICT(request_id) DO UPDATE SET
           local_min_seq = excluded.local_min_seq,
           local_max_seq = excluded.local_max_seq,
           message_count = excluded.message_count`,
        [requestId, min_seq, max_seq, count, Date.now()]
      );
    } catch (error) {
      console.error("[SQLiteMessageCache] updateLocalSequences error:", error);
    }
  }

  /**
   * Validate sequences for a chat (deterministic, O(n), pure client-side)
   *
   * Rules:
   * 1. If backend sequence is unknown, return valid (defer validation)
   * 2. Messages must be continuous between min_seq and max_seq
   * 3. Local max_seq must equal last_known_backend_seq
   */
  async validateSequences(requestId: string): Promise<SequenceValidationResult> {
    try {
      const db = await this.getDB();

      // Get sync metadata
      const syncMeta = await this.getSyncMeta(requestId);

      // Rule 1: If backend sequence unknown, defer validation
      if (!syncMeta?.lastKnownBackendSeq) {
        return { valid: true, reason: "backend_seq_unknown" };
      }

      // Get messages with sequence numbers
      const rows = await db.select<Record<string, unknown>[]>(
        `SELECT sequence_number FROM messages
         WHERE request_id = ? AND sequence_number IS NOT NULL
         ORDER BY sequence_number ASC`,
        [requestId]
      );

      if (rows.length === 0) {
        return { valid: false, reason: "no_messages" };
      }

      const sequences = rows.map((r) => r.sequence_number as number);
      const minSeq = sequences[0];
      const maxSeq = sequences[sequences.length - 1];

      // Rule 2: Check for gaps (messages must be continuous)
      const expectedCount = maxSeq - minSeq + 1;
      if (sequences.length !== expectedCount) {
        // Find the gap for debugging
        for (let i = 1; i < sequences.length; i++) {
          if (sequences[i] !== sequences[i - 1] + 1) {
            return {
              valid: false,
              reason: "gap_detected",
              details: `Gap detected between sequence ${sequences[i - 1]} and ${sequences[i]}`,
            };
          }
        }
        return { valid: false, reason: "gap_detected" };
      }

      // Rule 3: Local max must match backend expected
      if (maxSeq !== syncMeta.lastKnownBackendSeq) {
        return {
          valid: false,
          reason: "sequence_mismatch",
          details: `Local max (${maxSeq}) != backend expected (${syncMeta.lastKnownBackendSeq})`,
        };
      }

      return { valid: true, reason: "validated" };
    } catch (error) {
      console.error("[SQLiteMessageCache] validateSequences error:", error);
      return { valid: false, reason: "gap_detected", details: String(error) };
    }
  }

  /**
   * Find missing sequence ranges for a chat
   * Returns gaps in the message history that need to be synced
   *
   * Detects:
   * 1. Gaps in consecutive sequences (e.g., [1,2,5,6] has gap [3,4])
   * 2. Missing newer messages (local_max < backend_max)
   * 3. Missing older messages (local_min > 1)
   */
  async findMissingSequenceRanges(requestId: string): Promise<{ fromSeq: number; toSeq: number }[]> {
    try {
      const db = await this.getDB();
      const gaps: { fromSeq: number; toSeq: number }[] = [];

      // Get sync metadata
      const syncMeta = await this.getSyncMeta(requestId);
      if (!syncMeta) return gaps;

      // Get all sequence numbers
      const rows = await db.select<Record<string, unknown>[]>(
        `SELECT sequence_number FROM messages
         WHERE request_id = ? AND sequence_number IS NOT NULL
         ORDER BY sequence_number ASC`,
        [requestId]
      );

      if (rows.length === 0) {
        // No messages cached - need full history from 1 to backend_max
        if (syncMeta.lastKnownBackendSeq) {
          gaps.push({ fromSeq: 1, toSeq: syncMeta.lastKnownBackendSeq });
        }
        return gaps;
      }

      const sequences = rows.map((r) => r.sequence_number as number);
      const minSeq = sequences[0];
      const maxSeq = sequences[sequences.length - 1];

      // Check 1: Missing older messages (gap before first message)
      if (minSeq > 1) {
        gaps.push({ fromSeq: 1, toSeq: minSeq - 1 });
      }

      // Check 2: Gaps in middle (consecutive sequence breaks)
      for (let i = 1; i < sequences.length; i++) {
        const prevSeq = sequences[i - 1];
        const currSeq = sequences[i];

        if (currSeq !== prevSeq + 1) {
          // Gap detected
          gaps.push({ fromSeq: prevSeq + 1, toSeq: currSeq - 1 });
        }
      }

      // Check 3: Missing newer messages (gap after last message)
      if (syncMeta.lastKnownBackendSeq && maxSeq < syncMeta.lastKnownBackendSeq) {
        gaps.push({ fromSeq: maxSeq + 1, toSeq: syncMeta.lastKnownBackendSeq });
      }

      return gaps;
    } catch (error) {
      console.error("[SQLiteMessageCache] findMissingSequenceRanges error:", error);
      return [];
    }
  }

  /**
   * Mark all chats as UNKNOWN (called on connectivity restoration)
   */
  async markAllChatsUnknown(): Promise<void> {
    try {
      const db = await this.getDB();
      await db.execute(
        `UPDATE chat_sync_state SET sync_state = 'UNKNOWN', last_validated_at = ?`,
        [Date.now()]
      );
    } catch (error) {
      console.error("[SQLiteMessageCache] markAllChatsUnknown error:", error);
    }
  }

  /**
   * Check if a sync is needed for a chat
   */
  async needsSync(requestId: string): Promise<boolean> {
    const syncMeta = await this.getSyncMeta(requestId);
    return syncMeta?.syncState === "OUT_OF_SYNC";
  }

  // ==========================================================================
  // Maintenance Operations
  // ==========================================================================

  /**
   * Clear expired cache entries (older than 7 days)
   */
  async cleanupExpiredCache(): Promise<void> {
    try {
      const db = await this.getDB();
      const expiryTime = Date.now() - CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

      // Delete expired messages
      await db.execute(`DELETE FROM messages WHERE cached_at < ?`, [expiryTime]);

      // Delete expired metadata
      await db.execute(`DELETE FROM chat_meta WHERE last_updated < ?`, [expiryTime]);

      // Delete sync state for chats with no messages
      await db.execute(`
        DELETE FROM chat_sync_state
        WHERE request_id NOT IN (SELECT DISTINCT request_id FROM messages)
      `);

      console.log("[SQLiteMessageCache] Expired cache cleaned up");
    } catch (error) {
      console.error("[SQLiteMessageCache] cleanupExpiredCache error:", error);
    }
  }

  /**
   * Clear all cached data
   */
  async clearAll(): Promise<void> {
    try {
      const db = await this.getDB();
      await db.execute(`DELETE FROM messages`);
      await db.execute(`DELETE FROM chat_meta`);
      await db.execute(`DELETE FROM chat_sync_state`);
    } catch (error) {
      console.error("[SQLiteMessageCache] clearAll error:", error);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{ chats: number; messages: number }> {
    try {
      const db = await this.getDB();

      const messagesResult = await db.select<{ count: number }[]>(
        `SELECT COUNT(*) as count FROM messages`
      );
      const chatsResult = await db.select<{ count: number }[]>(
        `SELECT COUNT(*) as count FROM chat_meta`
      );

      return {
        messages: messagesResult[0]?.count ?? 0,
        chats: chatsResult[0]?.count ?? 0,
      };
    } catch (error) {
      console.error("[SQLiteMessageCache] getStats error:", error);
      return { chats: 0, messages: 0 };
    }
  }

  /**
   * Get chat metadata (for backward compatibility)
   */
  async getChatMeta(requestId: string): Promise<{ requestId: string; latestSequence: number; lastUpdated: number; messageCount: number } | null> {
    try {
      const db = await this.getDB();
      const rows = await db.select<Record<string, unknown>[]>(
        `SELECT * FROM chat_meta WHERE request_id = ?`,
        [requestId]
      );

      if (rows.length === 0) return null;

      const row = rows[0];
      return {
        requestId: row.request_id as string,
        latestSequence: row.latest_sequence as number,
        lastUpdated: row.last_updated as number,
        messageCount: row.message_count as number,
      };
    } catch (error) {
      console.error("[SQLiteMessageCache] getChatMeta error:", error);
      return null;
    }
  }
}

// Singleton instance
export const sqliteMessageCache = new SQLiteMessageCacheService();

// Initialize cleanup on load
if (typeof window !== "undefined") {
  // Run cleanup after a short delay to not block initial load
  setTimeout(() => {
    sqliteMessageCache.cleanupExpiredCache().catch(console.error);
  }, 5000);
}

export default sqliteMessageCache;
