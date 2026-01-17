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
 */

import { messageCache as indexedDBCache } from "./message-cache";
import { sqliteMessageCache } from "./sqlite-message-cache";
import { chatSyncService } from "./chat-sync-service";
import type { ChatMessage, ChatSyncState, SequenceValidationResult } from "@/types";

// Migration phase control
type MigrationPhase = 1 | 2 | 3;
const MIGRATION_PHASE: MigrationPhase = 2; // Set to 2 to start using SQLite for reads

class MessageCacheBridge {
  /**
   * Get cached messages for a chat
   */
  async getCachedMessages(requestId: string): Promise<ChatMessage[]> {
    switch (MIGRATION_PHASE) {
      case 1:
        // Phase 1: Read from IndexedDB
        return indexedDBCache.getCachedMessages(requestId);
      case 2:
      case 3:
        // Phase 2/3: Read from SQLite
        return sqliteMessageCache.getCachedMessages(requestId);
    }
  }

  /**
   * Cache messages for a chat
   */
  async cacheMessages(requestId: string, messages: ChatMessage[]): Promise<void> {
    switch (MIGRATION_PHASE) {
      case 1:
      case 2:
        // Phase 1/2: Write to both for safety
        await Promise.all([
          indexedDBCache.cacheMessages(requestId, messages),
          sqliteMessageCache.cacheMessages(requestId, messages),
        ]);
        break;
      case 3:
        // Phase 3: Write to SQLite only
        await sqliteMessageCache.cacheMessages(requestId, messages);
        break;
    }
  }

  /**
   * Add a single message to the cache
   */
  async addMessage(message: ChatMessage): Promise<void> {
    switch (MIGRATION_PHASE) {
      case 1:
      case 2:
        // Phase 1/2: Write to both
        await Promise.all([
          indexedDBCache.addMessage(message),
          sqliteMessageCache.addMessage(message),
        ]);
        break;
      case 3:
        // Phase 3: Write to SQLite only
        await sqliteMessageCache.addMessage(message);
        break;
    }

    // Notify chat sync service about the new message
    await chatSyncService.onNewMessage(message);
  }

  /**
   * Replace an optimistic message with the real one
   */
  async replaceOptimisticMessage(tempId: string, realMessage: ChatMessage): Promise<void> {
    switch (MIGRATION_PHASE) {
      case 1:
      case 2:
        await Promise.all([
          indexedDBCache.replaceOptimisticMessage(tempId, realMessage),
          sqliteMessageCache.replaceOptimisticMessage(tempId, realMessage),
        ]);
        break;
      case 3:
        await sqliteMessageCache.replaceOptimisticMessage(tempId, realMessage);
        break;
    }
  }

  /**
   * Clear cache for a specific chat
   */
  async clearChat(requestId: string): Promise<void> {
    switch (MIGRATION_PHASE) {
      case 1:
      case 2:
        await Promise.all([
          indexedDBCache.clearChat(requestId),
          sqliteMessageCache.clearChat(requestId),
        ]);
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
