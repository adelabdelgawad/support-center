/**
 * Chat Sync Service
 *
 * Orchestrates deterministic chat message synchronization using
 * per-chat sequence validation. Implements the sync state machine:
 *
 * States:
 * - UNKNOWN: Local data not yet validated (default)
 * - SYNCED: Local messages validated and trusted
 * - OUT_OF_SYNC: Proven missing or incomplete message data
 *
 * Core Principles:
 * - Load from cache instantly (non-blocking)
 * - Validate using sequence numbers (deterministic)
 * - Sync only when proven necessary (not blind polling)
 * - Handle offline/reconnect gracefully
 */

import { createSignal, createRoot, batch } from "solid-js";
import { sqliteMessageCache } from "./sqlite-message-cache";
import { getMessagesCursor } from "@/api/messages";
import type { ChatSyncState, SequenceValidationResult } from "@/types";

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

class ChatSyncService {
  // In-memory lock to prevent concurrent syncs per chat
  private syncLocks = new Set<string>();

  /**
   * Called when user opens a chat
   *
   * Behavior:
   * 1. Load messages immediately from cache (non-blocking)
   * 2. Set sync_state = UNKNOWN
   * 3. If backend sequence known, run validation
   * 4. If validation passes → SYNCED (no fetch)
   * 5. If validation fails → OUT_OF_SYNC (trigger resync)
   */
  async onChatOpen(requestId: string): Promise<void> {
    console.log(`[ChatSyncService] onChatOpen: ${requestId}`);

    // Mark as UNKNOWN initially
    await sqliteMessageCache.updateSyncState(requestId, "UNKNOWN");

    // Validate if backend sequence is known
    const validation = await sqliteMessageCache.validateSequences(requestId);
    console.log(`[ChatSyncService] Validation result:`, validation);

    if (validation.valid) {
      if (validation.reason === "backend_seq_unknown") {
        // Defer validation - stay UNKNOWN until ticket list refreshes
        console.log(`[ChatSyncService] Backend sequence unknown, staying UNKNOWN`);
      } else {
        // Validation passed
        await sqliteMessageCache.updateSyncState(requestId, "SYNCED");
        console.log(`[ChatSyncService] Validation passed, marked SYNCED`);
      }
    } else {
      // Validation failed - need to resync
      await sqliteMessageCache.updateSyncState(requestId, "OUT_OF_SYNC");
      console.log(`[ChatSyncService] Validation failed (${validation.reason}), triggering resync`);
      await this.resync(requestId);
    }
  }

  /**
   * Resync a single chat (INCREMENTAL - fetches only missing messages)
   *
   * Behavior:
   * - Detect missing sequence ranges
   * - Fetch ONLY missing messages using cursor pagination
   * - Merge with existing cache (preserves already-cached messages)
   * - Re-validate after sync
   * - Only clear OUT_OF_SYNC if validation passes
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
      console.log(`[ChatSyncService] Starting incremental resync for ${requestId}`);

      const syncMeta = await sqliteMessageCache.getSyncMeta(requestId);
      if (!syncMeta) {
        console.warn(`[ChatSyncService] No sync metadata found for ${requestId}`);
        this.syncLocks.delete(requestId);
        this.setSyncing(requestId, false);
        return;
      }

      let totalMessagesFetched = 0;

      // Case 1: Need newer messages (most common after receiving notification)
      if (syncMeta.localMaxSeq !== null &&
          syncMeta.lastKnownBackendSeq !== null &&
          syncMeta.localMaxSeq < syncMeta.lastKnownBackendSeq) {

        const missingCount = syncMeta.lastKnownBackendSeq - syncMeta.localMaxSeq;
        console.log(`[ChatSyncService] Fetching ${missingCount} newer messages (seq ${syncMeta.localMaxSeq + 1} to ${syncMeta.lastKnownBackendSeq})`);

        // Fetch latest messages without cursor (gets newest first)
        const response = await getMessagesCursor({
          requestId,
          limit: Math.min(missingCount + 10, 200), // buffer + cap at 200
        });

        // Filter to only messages we don't have
        const newMessages = response.messages.filter(
          m => m.sequenceNumber && m.sequenceNumber > syncMeta.localMaxSeq!
        );

        if (newMessages.length > 0) {
          // Add messages individually to merge with cache (preserves existing messages)
          for (const msg of newMessages) {
            await sqliteMessageCache.addMessage(msg);
          }
          totalMessagesFetched += newMessages.length;
          console.log(`[ChatSyncService] Fetched ${newMessages.length} newer messages`);
        }
      }

      // Case 2: Need older messages or mid-gaps (gaps in history)
      const gaps = await sqliteMessageCache.findMissingSequenceRanges(requestId);

      if (gaps.length > 0) {
        console.log(`[ChatSyncService] Found ${gaps.length} sequence gaps:`, gaps);

        for (const gap of gaps) {
          const gapSize = gap.toSeq - gap.fromSeq + 1;
          console.log(`[ChatSyncService] Filling gap: seq ${gap.fromSeq} to ${gap.toSeq} (${gapSize} messages)`);

          // Fetch using cursor (before_sequence = gap.toSeq + 1)
          // This fetches messages older than gap.toSeq + 1
          const response = await getMessagesCursor({
            requestId,
            limit: Math.min(gapSize + 20, 200), // buffer + cap
            beforeSequence: gap.toSeq + 1,
          });

          // Filter to messages within the gap range
          const gapMessages = response.messages.filter(
            m => m.sequenceNumber && m.sequenceNumber >= gap.fromSeq && m.sequenceNumber <= gap.toSeq
          );

          if (gapMessages.length > 0) {
            // Add messages individually to merge with cache
            for (const msg of gapMessages) {
              await sqliteMessageCache.addMessage(msg);
            }
            totalMessagesFetched += gapMessages.length;
            console.log(`[ChatSyncService] Filled gap with ${gapMessages.length} messages`);
          }
        }
      }

      console.log(`[ChatSyncService] Incremental sync complete: fetched ${totalMessagesFetched} messages`);

      // Re-validate after sync
      const validation = await sqliteMessageCache.validateSequences(requestId);
      console.log(`[ChatSyncService] Post-sync validation:`, validation);

      if (validation.valid) {
        await sqliteMessageCache.updateSyncState(requestId, "SYNCED");
        console.log(`[ChatSyncService] Resync complete, marked SYNCED`);
      } else {
        // Still out of sync (should be rare)
        console.warn(`[ChatSyncService] Resync failed validation: ${validation.reason} - ${validation.details || ''}`);
        // Keep OUT_OF_SYNC state
      }
    } catch (error) {
      console.error(`[ChatSyncService] Resync error:`, error);
      // Keep current state on error
    } finally {
      this.syncLocks.delete(requestId);
      this.setSyncing(requestId, false);
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
   * Update backend sequence when ticket list is fetched
   * Called from ticket list query after successful fetch
   */
  async updateBackendSequence(requestId: string, sequence: number): Promise<void> {
    await sqliteMessageCache.updateBackendSequence(requestId, sequence);
  }

  /**
   * Handle new message from WebSocket
   * Updates local cache and potentially adjusts sync state
   */
  async onNewMessage(message: { requestId: string; sequenceNumber?: number }): Promise<void> {
    if (!message.sequenceNumber) return;

    const syncMeta = await sqliteMessageCache.getSyncMeta(message.requestId);
    if (!syncMeta) return;

    // If we receive a sequential message, update the backend sequence
    if (syncMeta.lastKnownBackendSeq !== null &&
        message.sequenceNumber === syncMeta.lastKnownBackendSeq + 1) {
      await sqliteMessageCache.updateBackendSequence(message.requestId, message.sequenceNumber);
      console.log(`[ChatSyncService] Updated backend sequence to ${message.sequenceNumber}`);
    } else if (syncMeta.lastKnownBackendSeq !== null &&
               message.sequenceNumber > syncMeta.lastKnownBackendSeq + 1) {
      // Gap detected - mark as out of sync
      console.warn(`[ChatSyncService] Gap detected: expected ${syncMeta.lastKnownBackendSeq + 1}, got ${message.sequenceNumber}`);
      await sqliteMessageCache.updateSyncState(message.requestId, "OUT_OF_SYNC");
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
