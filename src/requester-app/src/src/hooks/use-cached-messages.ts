/**
 * Reactive hook for accessing cached messages
 * Subscribes to MessageCache and updates signal when cache changes
 */

import { createSignal, createEffect, onCleanup, Accessor } from "solid-js";
import { messageCache } from "@/lib/message-cache";
import type { ChatMessage } from "@/types";

export function useCachedMessages(requestIdAccessor: Accessor<string>) {
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = createSignal(true);
  const [hasLoadedOnce, setHasLoadedOnce] = createSignal(false);

  createEffect(() => {
    const requestId = requestIdAccessor();
    if (!requestId) return;

    // Reset state for new chat
    setMessages([]);
    setIsLoading(true);

    // 1. Try synchronous read first (instant if memory populated)
    const syncData = messageCache.getMessagesSync(requestId);
    if (syncData && syncData.length > 0) {
      setMessages(syncData);
      setIsLoading(false);
      setHasLoadedOnce(true);
    }

    // 2. Subscribe to cache updates
    const unsubscribe = messageCache.subscribeToMessages(requestId, (newMessages) => {
      setMessages(newMessages);
      setIsLoading(false);
      setHasLoadedOnce(true);
    });

    // 3. Preload from IndexedDB if not in memory (async)
    if (!syncData || syncData.length === 0) {
      messageCache.preloadChat(requestId).then((msgs) => {
        // If still no messages after preload, loading is complete (empty chat)
        if (msgs.length === 0) {
          setIsLoading(false);
        }
      });
    }

    onCleanup(unsubscribe);
  });

  return {
    messages,
    isLoading: () => isLoading() && !hasLoadedOnce(),
    hasData: () => messages().length > 0,
  };
}
