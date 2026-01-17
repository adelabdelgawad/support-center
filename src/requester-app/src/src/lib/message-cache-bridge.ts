/**
 * Message Cache Bridge
 *
 * Provides a unified interface that supports both IndexedDB (legacy) and SQLite (new).
 * During migration, both caches are written to for safety.
 *
 * Migration steps:
 * 1. Phase 1: Write to both, read from IndexedDB (current)
 * 2. Phase 2: Write to both, read from SQLite
 * 3. Phase 3: Write and read from SQLite only
 *
 * IMPORTANT: In Phase 1/2, writes are done SEQUENTIALLY (not parallel) to avoid
 * race conditions between the two cache systems. SQLite is written first as the
 * primary source of truth.
 */

import { messageCache as indexedDBCache } from "./message-cache";
import { sqliteMessageCache } from "./sqlite-message-cache";
import { chatSyncService } from "./chat-sync-service";
import type { ChatMessage, ChatSyncState, SequenceValidationResult } from "@/types";

// Migration phase control
type MigrationPhase = 1 | 2 | 3;
const MIGRATION_PHASE: MigrationPhase = 2; // Set to 2 to start using SQLite for reads

// Debug logging
const DEBUG_ENABLED = true;
function bridgeLog(method: string, message: string, data?: any) {
  if (!DEBUG_ENABLED) return;
  const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
  const prefix = `[CacheBridge:${method}][${timestamp}]`;
  if (data !== undefined) {
    console.log(prefix, message, data);
  } else {
    console.log(prefix, message);
  }
}

function getCallStack(): string {
  const stack = new Error().stack || '';
  const lines = stack.split('\n').slice(3, 6);
  return lines.map(l => l.trim()).join(' <- ');
}

class MessageCacheBridge {
  /**
   * Get cached messages for a chat
   */
  async getCachedMessages(requestId: string): Promise<ChatMessage[]> {
    const shortId = requestId.substring(0, 8);
    bridgeLog('getCachedMessages', `📖 Phase ${MIGRATION_PHASE} read for ${shortId}`, { caller: getCallStack() });

    const startTime = Date.now();
    let result: ChatMessage[];

    switch (MIGRATION_PHASE) {
      case 1:
        // Phase 1: Read from IndexedDB
        result = await indexedDBCache.getCachedMessages(requestId);
        break;
      case 2:
      case 3:
        // Phase 2/3: Read from SQLite
        result = await sqliteMessageCache.getCachedMessages(requestId);
        break;
    }

    bridgeLog('getCachedMessages', `✅ Returned ${result.length} messages in ${Date.now() - startTime}ms`);
    return result;
  }

  /**
   * Cache messages for a chat
   *
   * NOTE: Phase 1/2 writes SEQUENTIALLY to avoid race conditions.
   * SQLite is written first as it has the write queue for serialization.
   */
  async cacheMessages(requestId: string, messages: ChatMessage[]): Promise<void> {
    const shortId = requestId.substring(0, 8);
    bridgeLog('cacheMessages', `✍️ Phase ${MIGRATION_PHASE} write for ${shortId}: ${messages.length} messages`, {
      caller: getCallStack(),
      seqRange: messages.length > 0
        ? `${Math.min(...messages.map(m => m.sequenceNumber ?? 0))} - ${Math.max(...messages.map(m => m.sequenceNumber ?? 0))}`
        : 'N/A'
    });

    const startTime = Date.now();

    switch (MIGRATION_PHASE) {
      case 1:
      case 2:
        // Phase 1/2: Write SEQUENTIALLY (not parallel!) for safety
        // SQLite first (has write queue), then IndexedDB
        bridgeLog('cacheMessages', `  → SQLite write starting...`);
        const sqliteStart = Date.now();
        await sqliteMessageCache.cacheMessages(requestId, messages);
        bridgeLog('cacheMessages', `  ✓ SQLite write done in ${Date.now() - sqliteStart}ms`);

        bridgeLog('cacheMessages', `  → IndexedDB write starting...`);
        const idbStart = Date.now();
        await indexedDBCache.cacheMessages(requestId, messages);
        bridgeLog('cacheMessages', `  ✓ IndexedDB write done in ${Date.now() - idbStart}ms`);
        break;
      case 3:
        // Phase 3: Write to SQLite only
        await sqliteMessageCache.cacheMessages(requestId, messages);
        break;
    }

    bridgeLog('cacheMessages', `✅ Total write time: ${Date.now() - startTime}ms`);
  }

  /**
   * Add a single message to the cache
   *
   * NOTE: Phase 1/2 writes SEQUENTIALLY to avoid race conditions.
   */
  async addMessage(message: ChatMessage): Promise<void> {
    const shortId = message.requestId.substring(0, 8);
    const msgId = message.id.substring(0, 8);
    bridgeLog('addMessage', `➕ Phase ${MIGRATION_PHASE} add for ${shortId}: msg ${msgId}, seq ${message.sequenceNumber}`, {
      caller: getCallStack()
    });

    const startTime = Date.now();

    switch (MIGRATION_PHASE) {
      case 1:
      case 2:
        // Phase 1/2: Write SEQUENTIALLY (not parallel!)
        await sqliteMessageCache.addMessage(message);
        await indexedDBCache.addMessage(message);
        break;
      case 3:
        // Phase 3: Write to SQLite only
        await sqliteMessageCache.addMessage(message);
        break;
    }

    bridgeLog('addMessage', `✅ addMessage done in ${Date.now() - startTime}ms`);

    // Notify chat sync service about the new message
    await chatSyncService.onNewMessage(message);
  }

  /**
   * Replace an optimistic message with the real one
   *
   * NOTE: Phase 1/2 writes SEQUENTIALLY to avoid race conditions.
   */
  async replaceOptimisticMessage(tempId: string, realMessage: ChatMessage): Promise<void> {
    bridgeLog('replaceOptimistic', `🔄 Phase ${MIGRATION_PHASE}: ${tempId.substring(0, 8)} -> ${realMessage.id.substring(0, 8)}`);

    switch (MIGRATION_PHASE) {
      case 1:
      case 2:
        // Phase 1/2: Write SEQUENTIALLY (not parallel!)
        await sqliteMessageCache.replaceOptimisticMessage(tempId, realMessage);
        await indexedDBCache.replaceOptimisticMessage(tempId, realMessage);
        break;
      case 3:
        await sqliteMessageCache.replaceOptimisticMessage(tempId, realMessage);
        break;
    }
  }

  /**
   * Clear cache for a specific chat
   *
   * NOTE: Phase 1/2 writes SEQUENTIALLY to avoid race conditions.
   */
  async clearChat(requestId: string): Promise<void> {
    bridgeLog('clearChat', `🗑️ Phase ${MIGRATION_PHASE} clear for ${requestId.substring(0, 8)}`);

    switch (MIGRATION_PHASE) {
      case 1:
      case 2:
        // Phase 1/2: Write SEQUENTIALLY (not parallel!)
        await sqliteMessageCache.clearChat(requestId);
        await indexedDBCache.clearChat(requestId);
        break;
      case 3:
        await sqliteMessageCache.clearChat(requestId);
        break;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{ chats: number; messages: number }> {
    switch (MIGRATION_PHASE) {
      case 1:
        return indexedDBCache.getStats();
      case 2:
      case 3:
        return sqliteMessageCache.getStats();
    }
  }

  /**
   * Get chat metadata
   */
  async getChatMeta(requestId: string) {
    switch (MIGRATION_PHASE) {
      case 1:
        return indexedDBCache.getChatMeta(requestId);
      case 2:
      case 3:
        return sqliteMessageCache.getChatMeta(requestId);
    }
  }

  // ==========================================================================
  // New SQLite-only methods (sync state)
  // ==========================================================================

  /**
   * Get sync metadata for a chat
   */
  async getSyncMeta(requestId: string) {
    return sqliteMessageCache.getSyncMeta(requestId);
  }

  /**
   * Update sync state for a chat
   */
  async updateSyncState(requestId: string, state: ChatSyncState) {
    return sqliteMessageCache.updateSyncState(requestId, state);
  }

  /**
   * Update backend sequence for a chat
   */
  async updateBackendSequence(requestId: string, seq: number) {
    return sqliteMessageCache.updateBackendSequence(requestId, seq);
  }

  /**
   * Validate sequences for a chat
   */
  async validateSequences(requestId: string): Promise<SequenceValidationResult> {
    return sqliteMessageCache.validateSequences(requestId);
  }

  /**
   * Mark all chats as UNKNOWN (for connectivity restoration)
   */
  async markAllChatsUnknown() {
    return sqliteMessageCache.markAllChatsUnknown();
  }
}

// Singleton instance
export const messageCacheBridge = new MessageCacheBridge();

export default messageCacheBridge;
