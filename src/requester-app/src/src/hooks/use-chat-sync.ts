/**
 * Chat Sync Hook
 *
 * Provides reactive sync state management for chat components.
 * Handles:
 * - Chat open validation
 * - Periodic revalidation (every 5 minutes while chat is open)
 * - Manual resync trigger
 * - Sync state subscription
 */

import {
  createSignal,
  createEffect,
  onCleanup,
  type Accessor,
} from "solid-js";
import { chatSyncService, isChatSyncing } from "@/lib/chat-sync-service";
import { sqliteMessageCache } from "@/lib/sqlite-message-cache";
import type { ChatMessage, ChatSyncState } from "@/types";

// Periodic revalidation interval (5 minutes)
const REVALIDATION_INTERVAL_MS = 5 * 60 * 1000;

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
}

/**
 * Hook for managing chat sync state
 *
 * Usage:
 * ```tsx
 * const { syncState, isSyncing, manualResync, cachedMessages } = useChatSync(requestId);
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
export function useChatSync(requestId: Accessor<string | null>): UseChatSyncResult {
  const [syncState, setSyncState] = createSignal<ChatSyncState>("UNKNOWN");
  const [cachedMessages, setCachedMessages] = createSignal<ChatMessage[]>([]);

  // Load cached messages and validate on mount/requestId change
  createEffect(() => {
    const id = requestId();
    if (!id) return;

    // Load cached messages immediately (non-blocking)
    sqliteMessageCache.getCachedMessages(id).then((messages) => {
      setCachedMessages(messages);
    });

    // Get current sync state
    sqliteMessageCache.getSyncMeta(id).then((meta) => {
      setSyncState(meta?.syncState ?? "UNKNOWN");
    });

    // Run chat open validation (async)
    chatSyncService.onChatOpen(id).then(() => {
      // Refresh sync state after validation
      sqliteMessageCache.getSyncMeta(id).then((meta) => {
        setSyncState(meta?.syncState ?? "UNKNOWN");
      });
      // Refresh cached messages if synced
      sqliteMessageCache.getCachedMessages(id).then((messages) => {
        setCachedMessages(messages);
      });
    });

    // Set up periodic revalidation (every 5 minutes while chat is open)
    const intervalId = setInterval(() => {
      chatSyncService.periodicRevalidate(id).then(() => {
        // Refresh sync state and messages after revalidation
        sqliteMessageCache.getSyncMeta(id).then((meta) => {
          setSyncState(meta?.syncState ?? "UNKNOWN");
        });
        sqliteMessageCache.getCachedMessages(id).then((messages) => {
          setCachedMessages(messages);
        });
      });
    }, REVALIDATION_INTERVAL_MS);

    // Cleanup interval on unmount or requestId change
    onCleanup(() => {
      clearInterval(intervalId);
    });
  });

  // Manual resync function
  const manualResync = async (): Promise<void> => {
    const id = requestId();
    if (!id) return;

    await chatSyncService.manualResync(id);

    // Refresh sync state and messages after manual resync
    const meta = await sqliteMessageCache.getSyncMeta(id);
    setSyncState(meta?.syncState ?? "UNKNOWN");

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
