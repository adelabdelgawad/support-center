/**
 * Chat Sync Hook
 *
 * Provides reactive sync state management for chat components.
 *
 * CRITICAL RULES (per DecoupleChatRendering.md):
 * - Rule 1: Cache is the UI source of truth - render IMMEDIATELY from cache
 * - Rule 2: SignalR must NEVER block rendering - fire-and-forget connection
 * - Rule 3: HTTP sync is background-only - NEVER block UI rendering
 *
 * Handles:
 * - Immediate cache loading (non-blocking)
 * - Background HTTP validation/sync (after render)
 * - Periodic revalidation (every 5 minutes while chat is open)
 * - Manual resync trigger
 * - Lifecycle guards to prevent duplicate sync runs
 */

import {
  createSignal,
  createEffect,
  createMemo,
  onCleanup,
  type Accessor,
} from "solid-js";
import { chatSyncService, isChatSyncing } from "@/lib/chat-sync-service";
import { sqliteMessageCache } from "@/lib/sqlite-message-cache";
import type { ChatMessage, ChatSyncState, ChatSyncMeta } from "@/types";

// Periodic revalidation interval (5 minutes)
const REVALIDATION_INTERVAL_MS = 5 * 60 * 1000;

// Delay before running background HTTP sync
// This allows the UI to render FIRST, then sync runs in background
const BACKGROUND_SYNC_DELAY_MS = 100;

// Lifecycle guard: track which chats have had sync initiated per session
// Keyed by chatId - prevents re-running on React remount / state updates
const syncInitiatedMap = new Map<string, number>();

export interface UseChatSyncOptions {
  /**
   * Accessor for SignalR connected state.
   * NOTE: SignalR connection is fire-and-forget. HTTP sync does NOT wait for it.
   * This is informational only - used for connection status display.
   */
  isSignalRConnected?: Accessor<boolean>;

  /**
   * Optional: Get last_message_id from ticket list for cache freshness check.
   * If provided and matches cached last_message_id, HTTP sync is skipped entirely.
   */
  ticketListLastMessageId?: Accessor<string | null>;

  /**
   * Optional: Get last_message_sequence from ticket cache for deterministic sync.
   * Per fix-chat-navigation.md: Backend sequence is now updated ONLY when chat opens,
   * not on tickets page load (which caused SQLite write queue storm).
   */
  ticketLastMessageSequence?: Accessor<number | null | undefined>;
}

export interface UseChatSyncResult {
  /** Current sync state */
  syncState: Accessor<ChatSyncState>;
  /** Whether a sync is currently in progress */
  isSyncing: Accessor<boolean>;
  /** Trigger a manual resync */
  manualResync: () => Promise<void>;
  /** Cached messages from SQLite */
  cachedMessages: Accessor<ChatMessage[]>;
  /** Refresh cached messages from SQLite */
  refreshCachedMessages: () => Promise<void>;
  /** Whether there are missing older messages (local_min_seq > 1) */
  hasMissingOlderMessages: Accessor<boolean>;
}

/**
 * Hook for managing chat sync state
 *
 * Usage:
 * ```tsx
 * const { syncState, isSyncing, manualResync, cachedMessages } = useChatSync(
 *   () => requestId,
 *   { isSignalRConnected: () => realTimeChat.isConnected() }
 * );
 *
 * // Show cached messages immediately
 * <For each={cachedMessages()}>...</For>
 *
 * // Show sync indicator
 * <Show when={isSyncing()}><Spinner /></Show>
 *
 * // Manual resync button
 * <Button onClick={manualResync}>Resync</Button>
 * ```
 */
export function useChatSync(
  requestId: Accessor<string | null>,
  options: UseChatSyncOptions = {}
): UseChatSyncResult {
  const [syncState, setSyncState] = createSignal<ChatSyncState>("UNKNOWN");
  const [cachedMessages, setCachedMessages] = createSignal<ChatMessage[]>([]);
  const [syncMeta, setSyncMeta] = createSignal<ChatSyncMeta | null>(null);

  // Computed: whether there are missing older messages
  const hasMissingOlderMessages = createMemo(() => {
    const meta = syncMeta();
    if (!meta) return false;

    // Check if there are messages older than our cached range
    // If local_min_seq > 1, it means messages 1 to (local_min_seq - 1) are missing
    return (meta.localMinSeq !== null && meta.localMinSeq > 1);
  });

  // Load cached messages and validate on mount/requestId change
  createEffect(() => {
    const id = requestId();
    if (!id) return;

    // PHASE 1: IMMEDIATE CACHE LOAD (Rule 1: Cache is UI source of truth)
    // This MUST complete before any network calls
    // Per task spec: "Render cached messages IMMEDIATELY when available"
    sqliteMessageCache.getCachedMessages(id).then((messages) => {
      setCachedMessages(messages);
    });

    // Get current sync state and metadata (also immediate)
    sqliteMessageCache.getSyncMeta(id).then((meta) => {
      setSyncState(meta?.syncState ?? "UNKNOWN");
      setSyncMeta(meta);
    });

    // LIFECYCLE GUARD: Prevent re-running sync on remount/state updates
    // Per task spec: "Runs ONCE per chat open, does NOT re-run on React remount"
    const lastSyncTime = syncInitiatedMap.get(id);
    const GUARD_WINDOW_MS = 5000; // 5 second window to prevent duplicate syncs

    if (lastSyncTime && (Date.now() - lastSyncTime) < GUARD_WINDOW_MS) {
      console.log(`[useChatSync] Lifecycle guard: sync for ${id} already initiated ${Date.now() - lastSyncTime}ms ago, skipping`);
      // Still set up periodic revalidation even if skipping initial sync
      const intervalId = setInterval(() => {
        runPeriodicRevalidation(id);
      }, REVALIDATION_INTERVAL_MS);

      onCleanup(() => {
        clearInterval(intervalId);
      });
      return;
    }

    // Mark this chat as having sync initiated
    syncInitiatedMap.set(id, Date.now());

    // Helper to run background HTTP validation/sync
    const runBackgroundHttpSync = async () => {
      console.log(`[useChatSync] Running BACKGROUND HTTP validation for ${id}`);
      console.log(`[useChatSync] ✅ Backend sequence update happens HERE (chat page only) - NOT on tickets page`);

      try {
        // FIX (fix-chat-navigation.md): Update backend sequence for THIS chat ONLY
        // Previously, this was done for ALL tickets on tickets page load, causing
        // SQLite write queue storm (50 tickets × ~30ms = 1.5s blocking navigation)
        // Now we update backend sequence only when user actually opens this chat
        const backendSeq = options.ticketLastMessageSequence?.();
        if (backendSeq !== null && backendSeq !== undefined) {
          console.log(`[useChatSync] 📝 Updating backend sequence for ${id}: ${backendSeq} (single chat, NOT batch)`);
          await chatSyncService.updateBackendSequence(id, backendSeq);
        }

        await chatSyncService.onChatOpen(id);

        // Refresh sync state and metadata after validation
        const meta = await sqliteMessageCache.getSyncMeta(id);
        setSyncState(meta?.syncState ?? "UNKNOWN");
        setSyncMeta(meta);

        // Refresh cached messages if synced
        const messages = await sqliteMessageCache.getCachedMessages(id);
        setCachedMessages(messages);
      } catch (error) {
        console.error(`[useChatSync] Background sync error:`, error);
        // Don't throw - sync errors should not affect UI
      }
    };

    // Helper for periodic revalidation
    const runPeriodicRevalidation = async (chatId: string) => {
      try {
        await chatSyncService.periodicRevalidate(chatId);

        // Refresh sync state, metadata, and messages after revalidation
        const meta = await sqliteMessageCache.getSyncMeta(chatId);
        setSyncState(meta?.syncState ?? "UNKNOWN");
        setSyncMeta(meta);

        const messages = await sqliteMessageCache.getCachedMessages(chatId);
        setCachedMessages(messages);
      } catch (error) {
        console.error(`[useChatSync] Periodic revalidation error:`, error);
      }
    };

    // PHASE 2: BACKGROUND HTTP SYNC (Rule 3: HTTP sync is background-only)
    // Per task spec: "HTTP sync MUST never block UI rendering"
    // Schedule sync to run AFTER rendering completes
    const syncTimeoutId = setTimeout(() => {
      // NOTE: We do NOT wait for SignalR. Per Rule 2: "SignalR Must Never Block Rendering"
      // SignalR connection is fire-and-forget - it runs in parallel
      runBackgroundHttpSync();
    }, BACKGROUND_SYNC_DELAY_MS);

    // Set up periodic revalidation (every 5 minutes while chat is open)
    const intervalId = setInterval(() => {
      runPeriodicRevalidation(id);
    }, REVALIDATION_INTERVAL_MS);

    // Cleanup on unmount or requestId change
    onCleanup(() => {
      clearTimeout(syncTimeoutId);
      clearInterval(intervalId);
    });
  });

  // Manual resync function
  const manualResync = async (): Promise<void> => {
    const id = requestId();
    if (!id) return;

    await chatSyncService.manualResync(id);

    // Refresh sync state, metadata, and messages after manual resync
    const meta = await sqliteMessageCache.getSyncMeta(id);
    setSyncState(meta?.syncState ?? "UNKNOWN");
    setSyncMeta(meta);

    const messages = await sqliteMessageCache.getCachedMessages(id);
    setCachedMessages(messages);
  };

  // Refresh cached messages function
  const refreshCachedMessages = async (): Promise<void> => {
    const id = requestId();
    if (!id) return;

    const messages = await sqliteMessageCache.getCachedMessages(id);
    setCachedMessages(messages);
  };

  // Reactive syncing state
  const isSyncing = (): boolean => {
    const id = requestId();
    if (!id) return false;
    return isChatSyncing(id);
  };

  return {
    syncState,
    isSyncing,
    manualResync,
    cachedMessages,
    refreshCachedMessages,
    hasMissingOlderMessages,
  };
}

/**
 * Hook for sync state subscription without full chat sync management
 *
 * Use this for lightweight components that just need to display sync state
 */
export function useSyncState(requestId: Accessor<string | null>): Accessor<ChatSyncState> {
  const [syncState, setSyncState] = createSignal<ChatSyncState>("UNKNOWN");

  createEffect(() => {
    const id = requestId();
    if (!id) {
      setSyncState("UNKNOWN");
      return;
    }

    sqliteMessageCache.getSyncMeta(id).then((meta) => {
      setSyncState(meta?.syncState ?? "UNKNOWN");
    });
  });

  return syncState;
}

export default useChatSync;
