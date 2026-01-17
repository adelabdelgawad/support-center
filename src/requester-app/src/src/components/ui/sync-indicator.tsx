/**
 * Sync Indicator Component
 *
 * Shows a spinner ONLY while an actual resync is in progress.
 * Does NOT show a permanent "synced" or "true" state.
 * No indicator during validation-only checks.
 */

import { Show, createMemo, type JSX } from "solid-js";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";
import { isChatSyncing } from "@/lib/chat-sync-service";

export interface SyncIndicatorProps {
  requestId: string;
  class?: string;
}

/**
 * Sync indicator that shows only during active resync
 */
export function SyncIndicator(props: SyncIndicatorProps): JSX.Element {
  // Reactive check if syncing
  const isSyncing = createMemo(() => isChatSyncing(props.requestId));

  return (
    <Show when={isSyncing()}>
      <div
        class={cn(
          "flex items-center gap-1 text-xs text-muted-foreground",
          props.class
        )}
      >
        <Spinner size="sm" />
        <span>Syncing...</span>
      </div>
    </Show>
  );
}

/**
 * Compact sync indicator (icon only)
 */
export function SyncIndicatorCompact(props: SyncIndicatorProps): JSX.Element {
  const isSyncing = createMemo(() => isChatSyncing(props.requestId));

  return (
    <Show when={isSyncing()}>
      <Spinner size="sm" class={props.class} />
    </Show>
  );
}

export default SyncIndicator;
