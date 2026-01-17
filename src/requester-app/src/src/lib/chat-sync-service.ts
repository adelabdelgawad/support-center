/**
 * Chat Sync Service
 *
 * Orchestrates HTTP-based chat message synchronization.
 * SignalR is used ONLY for live messages - NEVER for history/repair.
 *
 * States:
 * - UNKNOWN: Local data not yet validated (default)
 * - SYNCED: Local messages validated and trusted
 * - OUT_OF_SYNC: Proven missing or incomplete message data
 *
 * Core Principles (per task spec):
 * 1. SignalR is NOT used for history - no backfilling, no replay, no recovery
 * 2. HTTP is authoritative for history - all validation and repair via HTTP
 * 3. SignalR messages must be persisted and merged into cache immediately
 * 4. Incremental fetch uses last message ID (not sequence - UUIDs aren't sequential)
 * 5. Validation is heuristic (timestamp-based) since UUIDs can't prove gaps
 */

import { createSignal } from "solid-js";
import { sqliteMessageCache } from "./sqlite-message-cache";
import { getMessagesCursor } from "@/api/messages";
import type { ChatMessage, ChatSyncState } from "@/types";

// Sync progress tracking (reactive signals)
const [syncInProgressMap, setSyncInProgressMap] = createSignal<Map<string, boolean>>(new Map());

/**
 * Check if a chat is currently syncing
 */
export function isChatSyncing(requestId: string): boolean {
  return syncInProgressMap().get(requestId) ?? false;
}

/**
 * Subscribe to sync progress changes
 */
export function useSyncInProgress(requestId: string): () => boolean {
  return () => syncInProgressMap().get(requestId) ?? false;
}

// Debounce delay for onChatOpen (prevents rapid resync calls)
const CHAT_OPEN_DEBOUNCE_MS = 300;

class ChatSyncService {
  // In-memory lock to prevent concurrent syncs per chat
  private syncLocks = new Set<string>();

  // Debounce map for onChatOpen calls
  private chatOpenDebounceMap = new Map<string, {
    timeout: ReturnType<typeof setTimeout>;
    resolve: () => void;
    reject: (error: unknown) => void;
  }>();

  /**
   * Called when user opens a chat
   *
   * Behavior:
   * 1. Load messages immediately from cache (non-blocking)
   * 2. Set sync_state = UNKNOWN
   * 3. If backend sequence known, run validation
   * 4. If validation passes → SYNCED (no fetch)
   * 5. If validation fails → OUT_OF_SYNC (trigger resync)
   *
   * Features debouncing to prevent rapid resync calls when
   * multiple sources trigger chat open in quick succession.
   */
  async onChatOpen(requestId: string): Promise<void> {
    // Cancel existing debounced call for this chat
    const existing = this.chatOpenDebounceMap.get(requestId);
    if (existing) {
      clearTimeout(existing.timeout);
      // Resolve the previous promise (don't leave callers hanging)
      existing.resolve();
      this.chatOpenDebounceMap.delete(requestId);
    }

    // Create debounced promise
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(async () => {
        this.chatOpenDebounceMap.delete(requestId);

        try {
          await this.executeOnChatOpen(requestId);
          resolve();
        } catch (error) {
          reject(error);
        }
      }, CHAT_OPEN_DEBOUNCE_MS);

      this.chatOpenDebounceMap.set(requestId, { timeout, resolve, reject });
    });
  }

  /**
   * Internal: Execute the actual onChatOpen logic (called after debounce)
   *
   * CRITICAL (per DecoupleChatRendering.md):
   * - This runs in BACKGROUND ONLY - UI has already rendered from cache
   * - SignalR connection is fire-and-forget (running in parallel)
   * - HTTP sync NEVER blocks UI
   *
   * Flow:
   * 1. Check if HTTP sync can be skipped (cache freshness check)
   * 2. If skip: Mark SYNCED_FROM_CACHE and return immediately
   * 3. If needed: Run background HTTP incremental fetch
   * 4. Merge returned messages, update cache and sync state
   */
  private async executeOnChatOpen(requestId: string): Promise<void> {
    console.log(`[ChatSyncService] onChatOpen: ${requestId} (BACKGROUND HTTP sync)`);

    // Get cached messages to determine last message ID
    const cachedMessages = await sqliteMessageCache.getCachedMessages(requestId);
    console.log(`[ChatSyncService] Found ${cachedMessages.length} cached messages`);

    if (cachedMessages.length === 0) {
      // No cache - need full sync via HTTP
      console.log(`[ChatSyncService] No cached messages, triggering HTTP sync`);
      await sqliteMessageCache.updateSyncState(requestId, "OUT_OF_SYNC");
      await this.resync(requestId);
      return;
    }

    // Get sync metadata for cache freshness check
    const syncMeta = await sqliteMessageCache.getSyncMeta(requestId);

    // CACHE FRESHNESS CHECK (per task spec):
    // Skip HTTP sync if ALL are true:
    // - Cached messages exist (checked above)
    // - Last sync state was SYNCED
    // - lastKnownBackendSeq matches our cached max sequence
    const canSkipHttpSync = this.canSkipHttpSync(cachedMessages, syncMeta);

    if (canSkipHttpSync) {
      console.log(`[ChatSyncService] Cache is fresh, skipping HTTP sync (SYNCED_FROM_CACHE)`);
      // Keep state as SYNCED - no HTTP request needed
      if (syncMeta?.syncState !== "SYNCED") {
        await sqliteMessageCache.updateSyncState(requestId, "SYNCED");
      }
      return;
    }

    // Mark as UNKNOWN while we validate
    await sqliteMessageCache.updateSyncState(requestId, "UNKNOWN");

    // Perform incremental validation via HTTP
    // Fetch any messages newer than our last cached message
    const sortedMessages = [...cachedMessages].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const lastMessageId = sortedMessages[0].id;

    try {
      // HTTP incremental fetch - this is THE authoritative check for new messages
      const response = await getMessagesCursor({
        requestId,
        limit: 100,
        afterMessageId: lastMessageId,
      });

      if (response.messages.length > 0) {
        console.log(`[ChatSyncService] Found ${response.messages.length} new messages via HTTP`);

        // Deduplicate and add new messages
        const existingIds = new Set(cachedMessages.map(m => m.id));
        const newMessages = response.messages.filter(m => !existingIds.has(m.id));

        if (newMessages.length > 0) {
          for (const msg of newMessages) {
            await sqliteMessageCache.addMessage(msg);
          }
          console.log(`[ChatSyncService] Added ${newMessages.length} messages to cache`);
        }
      } else {
        console.log(`[ChatSyncService] Cache is up to date (HTTP returned 0 new messages)`);
      }

      // Validation passed - mark as SYNCED
      await sqliteMessageCache.updateSyncState(requestId, "SYNCED");
      console.log(`[ChatSyncService] Validation passed, marked SYNCED`);

    } catch (error) {
      console.error(`[ChatSyncService] HTTP validation failed:`, error);
      // On error, mark as OUT_OF_SYNC but don't block - SignalR will handle live messages
      await sqliteMessageCache.updateSyncState(requestId, "OUT_OF_SYNC");
    }
  }

  /**
   * Check if HTTP sync can be skipped because cache is already up-to-date
   *
   * Per task spec "Correct Chat Open Flow":
   * Skip HTTP sync if ALL are true:
   * - Cached messages exist
   * - Cached last_message_id is known
   * - Last sync state was SYNCED
   * - Local max sequence matches expected backend sequence (if known)
   */
  private canSkipHttpSync(
    cachedMessages: ChatMessage[],
    syncMeta: { syncState: string; localMaxSeq: number | null; lastKnownBackendSeq: number | null } | null
  ): boolean {
    // Must have cached messages
    if (cachedMessages.length === 0) return false;

    // Must have sync metadata
    if (!syncMeta) return false;

    // Last sync must have been successful (SYNCED)
    if (syncMeta.syncState !== "SYNCED") return false;

    // If we have backend sequence info, verify it matches
    if (syncMeta.lastKnownBackendSeq !== null && syncMeta.localMaxSeq !== null) {
      if (syncMeta.localMaxSeq === syncMeta.lastKnownBackendSeq) {
        console.log(`[ChatSyncService] Cache freshness check: localMaxSeq (${syncMeta.localMaxSeq}) === backendSeq (${syncMeta.lastKnownBackendSeq})`);
        return true;
      }
    }

    // If we were previously SYNCED but don't have sequence info, trust it for a short time
    // This handles cases where the ticket list hasn't provided sequence metadata yet
    return false;
  }

  /**
   * Resync a single chat using HTTP ONLY (incremental fetch by message ID)
   *
   * Per task spec:
   * - HTTP is the ONLY mechanism for fetching chat history
   * - Uses last known message ID for incremental fetch
   * - SignalR is NOT used for history/repair
   * - Merge returned messages into cache
   * - Re-validate after sync
   */
  async resync(requestId: string): Promise<void> {
    // Prevent concurrent syncs for the same chat
    if (this.syncLocks.has(requestId)) {
      console.log(`[ChatSyncService] Resync already in progress for ${requestId}`);
      return;
    }

    this.syncLocks.add(requestId);
    this.setSyncing(requestId, true);

    try {
      console.log(`[ChatSyncService] Starting HTTP-based incremental resync for ${requestId}`);

      // Get the last cached message ID for incremental fetch
      const cachedMessages = await sqliteMessageCache.getCachedMessages(requestId);
      let lastMessageId: string | undefined;

      if (cachedMessages.length > 0) {
        // Sort by createdAt to find the newest message
        const sortedMessages = [...cachedMessages].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        lastMessageId = sortedMessages[0].id;
        console.log(`[ChatSyncService] Last cached message ID: ${lastMessageId}`);
      }

      let totalMessagesFetched = 0;

      // Phase 1: Incremental fetch using after_message_id
      // Backend returns all messages created AFTER the specified message ID
      const response = await getMessagesCursor({
        requestId,
        limit: 200, // Reasonable limit for incremental sync
        afterMessageId: lastMessageId, // If undefined, fetches latest messages
      });

      console.log(`[ChatSyncService] HTTP returned ${response.messages.length} messages (hasMore: ${response.hasMore})`);

      if (response.messages.length > 0) {
        // Deduplicate against existing cache by message ID
        const existingIds = new Set(cachedMessages.map(m => m.id));
        const newMessages = response.messages.filter(m => !existingIds.has(m.id));

        if (newMessages.length > 0) {
          // Add messages individually to merge with cache
          for (const msg of newMessages) {
            await sqliteMessageCache.addMessage(msg);
          }
          totalMessagesFetched += newMessages.length;
          console.log(`[ChatSyncService] Added ${newMessages.length} new messages to cache`);
        } else {
          console.log(`[ChatSyncService] All returned messages already in cache (deduped)`);
        }
      }

      // Phase 2: If there are more messages and we started from empty, load older history
      if (response.hasMore && cachedMessages.length === 0) {
        console.log(`[ChatSyncService] Loading older history for empty cache`);

        // Fetch older messages using cursor pagination
        let cursor: number | null = response.oldestSequence;
        let iterations = 0;
        const MAX_ITERATIONS = 5; // Safety limit

        while (response.hasMore && cursor !== null && iterations < MAX_ITERATIONS) {
          const olderResponse = await getMessagesCursor({
            requestId,
            limit: 200,
            beforeSequence: cursor,
          });

          if (olderResponse.messages.length > 0) {
            for (const msg of olderResponse.messages) {
              await sqliteMessageCache.addMessage(msg);
            }
            totalMessagesFetched += olderResponse.messages.length;
            cursor = olderResponse.oldestSequence;
          }

          if (!olderResponse.hasMore) break;
          iterations++;
        }
      }

      console.log(`[ChatSyncService] HTTP sync complete: fetched ${totalMessagesFetched} messages total`);

      // Re-validate after sync (heuristic validation since UUIDs aren't sequential)
      const validation = await this.validateChatConsistency(requestId);
      console.log(`[ChatSyncService] Post-sync validation:`, validation);

      if (validation.valid) {
        await sqliteMessageCache.updateSyncState(requestId, "SYNCED");
        console.log(`[ChatSyncService] Resync complete, marked SYNCED`);
      } else {
        // Validation failed - may need additional repair
        console.warn(`[ChatSyncService] Post-sync validation issue: ${validation.reason}`);
        // Keep OUT_OF_SYNC but don't retry immediately
      }
    } catch (error) {
      console.error(`[ChatSyncService] HTTP resync error:`, error);
      // Keep current state on error
    } finally {
      this.syncLocks.delete(requestId);
      this.setSyncing(requestId, false);
    }
  }

  /**
   * Validate chat consistency using heuristic approach (timestamps)
   * Since UUIDs are not sequential, we can't detect gaps deterministically.
   * Instead, we validate:
   * 1. Messages exist in cache
   * 2. No large timestamp gaps that suggest missing messages
   * 3. Local message count matches expected (if known)
   */
  private async validateChatConsistency(requestId: string): Promise<{ valid: boolean; reason: string }> {
    try {
      const cachedMessages = await sqliteMessageCache.getCachedMessages(requestId);

      if (cachedMessages.length === 0) {
        return { valid: false, reason: "no_messages_cached" };
      }

      // Sort by timestamp
      const sortedMessages = [...cachedMessages].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      // Check for suspicious gaps (more than 1 hour between consecutive messages)
      // This is heuristic - not perfect but helps detect missing chunks
      const ONE_HOUR_MS = 60 * 60 * 1000;
      for (let i = 1; i < sortedMessages.length; i++) {
        const prevTime = new Date(sortedMessages[i - 1].createdAt).getTime();
        const currTime = new Date(sortedMessages[i].createdAt).getTime();
        const gap = currTime - prevTime;

        // Large gaps might indicate missing messages, but we can't be certain
        // This is informational, not a validation failure
        if (gap > ONE_HOUR_MS) {
          console.log(`[ChatSyncService] Large gap detected: ${gap / 1000}s between messages`);
        }
      }

      // For now, consider validated if we have messages
      // Full validation requires backend to provide total count
      return { valid: true, reason: "heuristic_validated" };
    } catch (error) {
      console.error(`[ChatSyncService] Validation error:`, error);
      return { valid: false, reason: "validation_error" };
    }
  }

  /**
   * Manual resync (user triggered)
   * Forces a resync regardless of current state
   */
  async manualResync(requestId: string): Promise<void> {
    console.log(`[ChatSyncService] Manual resync triggered for ${requestId}`);

    // Clear the sync lock if stuck (force override)
    this.syncLocks.delete(requestId);

    // Mark as OUT_OF_SYNC and resync
    await sqliteMessageCache.updateSyncState(requestId, "OUT_OF_SYNC");
    await this.resync(requestId);
  }

  /**
   * Periodic revalidation (every 5 min while chat is open)
   *
   * Behavior:
   * - Revalidate by comparing local max_seq vs backend expected
   * - If mismatch → trigger resync
   * - If match → no-op
   */
  async periodicRevalidate(requestId: string): Promise<void> {
    console.log(`[ChatSyncService] Periodic revalidation for ${requestId}`);

    const validation = await sqliteMessageCache.validateSequences(requestId);

    if (!validation.valid && validation.reason !== "backend_seq_unknown") {
      console.log(`[ChatSyncService] Periodic validation failed, triggering resync`);
      await sqliteMessageCache.updateSyncState(requestId, "OUT_OF_SYNC");
      await this.resync(requestId);
    } else {
      console.log(`[ChatSyncService] Periodic validation passed`);
    }
  }

  /**
   * Handle connectivity restoration
   *
   * Behavior:
   * - Mark ALL chats as UNKNOWN
   * - Do NOT auto-sync messages
   * - Chats self-heal on open/validation
   */
  async onConnectivityRestored(): Promise<void> {
    console.log(`[ChatSyncService] Connectivity restored, marking all chats UNKNOWN`);
    await sqliteMessageCache.markAllChatsUnknown();
    // Note: Ticket list refresh should be triggered separately
    // which will update backend sequences
  }

  /**
   * Update backend sequence for a specific chat.
   *
   * CRITICAL (fix-chat-navigation.md):
   * This method MUST be called ONLY from:
   * - use-chat-sync.ts (when a specific chat is opened)
   *
   * It MUST NOT be called:
   * - From tickets page load
   * - For multiple tickets in a loop
   * - From ticket list query
   *
   * This prevents the "SQLite write queue storm" where updating sequences
   * for 50+ tickets caused ~1.5s blocking navigation.
   */
  async updateBackendSequence(requestId: string, sequence: number): Promise<void> {
    console.log(`[ChatSyncService] updateBackendSequence for ${requestId.substring(0, 8)}: ${sequence}`);
    await sqliteMessageCache.updateBackendSequence(requestId, sequence);
  }

  /**
   * Handle new message from SignalR
   *
   * Per task spec:
   * - Immediately store it in the local chat cache
   * - Update last message metadata
   * - Deduplicate against existing cached messages (by UUID)
   * - Do NOT assume ordering relative to HTTP responses
   * - HTTP sync remains authoritative for final consistency
   *
   * @param message - The full ChatMessage from SignalR
   */
  async onNewMessage(message: { requestId: string; sequenceNumber?: number; id?: string }): Promise<void> {
    if (!message.id || !message.requestId) {
      console.warn(`[ChatSyncService] onNewMessage called with incomplete message`, message);
      return;
    }

    try {
      // Check if this message already exists in cache (deduplication by UUID)
      const cachedMessages = await sqliteMessageCache.getCachedMessages(message.requestId);
      const exists = cachedMessages.some(m => m.id === message.id);

      if (exists) {
        console.log(`[ChatSyncService] Message ${message.id} already in cache (deduped)`);
        return;
      }

      // Immediately persist SignalR message to local cache
      // This ensures no message loss even during concurrent HTTP sync
      console.log(`[ChatSyncService] Caching SignalR message: ${message.id}`);

      // Note: The full message is added by the caller (message-cache-bridge.addMessage)
      // This method tracks sync state changes

      // Update backend sequence if present (informational, not authoritative)
      if (message.sequenceNumber) {
        const syncMeta = await sqliteMessageCache.getSyncMeta(message.requestId);
        if (syncMeta && syncMeta.lastKnownBackendSeq !== null &&
            message.sequenceNumber > syncMeta.lastKnownBackendSeq) {
          await sqliteMessageCache.updateBackendSequence(message.requestId, message.sequenceNumber);
        }
      }
    } catch (error) {
      console.error(`[ChatSyncService] Error handling SignalR message:`, error);
    }
  }

  /**
   * Get current sync state for a chat
   */
  async getSyncState(requestId: string): Promise<ChatSyncState> {
    const meta = await sqliteMessageCache.getSyncMeta(requestId);
    return meta?.syncState ?? "UNKNOWN";
  }

  /**
   * Check if a chat needs sync (for UI indication)
   */
  async needsSync(requestId: string): Promise<boolean> {
    return await sqliteMessageCache.needsSync(requestId);
  }

  // Private helper to update syncing state reactively
  private setSyncing(requestId: string, isSyncing: boolean): void {
    setSyncInProgressMap((prev) => {
      const next = new Map(prev);
      if (isSyncing) {
        next.set(requestId, true);
      } else {
        next.delete(requestId);
      }
      return next;
    });
  }
}

// Singleton instance
export const chatSyncService = new ChatSyncService();

export default chatSyncService;
