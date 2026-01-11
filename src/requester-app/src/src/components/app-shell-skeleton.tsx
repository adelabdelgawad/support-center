/**
 * AppShellSkeleton Component
 *
 * Skeleton loading state that matches the ChatLayout structure.
 * Used as Suspense fallback for instant visual structure without blank spinner.
 *
 * Design principles:
 * - Shows app structure immediately (header, content area)
 * - No layout shift when real content loads
 * - Subtle animation to indicate loading
 * - Matches ChatLayout dimensions exactly
 */

import { For } from "solid-js";

/**
 * Skeleton placeholder for ticket list items
 */
function TicketItemSkeleton() {
  return (
    <div class="flex items-center p-4 border-b border-border animate-pulse">
      {/* Avatar skeleton */}
      <div class="w-12 h-12 rounded-full bg-secondary me-3" />

      {/* Content skeleton */}
      <div class="flex-1">
        <div class="flex justify-between items-center mb-2">
          <div class="h-4 bg-secondary rounded w-2/3" />
          <div class="h-3 bg-secondary rounded w-12" />
        </div>
        <div class="h-3 bg-secondary rounded w-3/4" />
      </div>
    </div>
  );
}

/**
 * AppShellSkeleton - Full app skeleton matching ChatLayout structure
 * Used as Suspense fallback for lazy-loaded routes
 */
export function AppShellSkeleton() {
  return (
    <div class="flex flex-col h-screen bg-background overflow-hidden">
      {/* Header skeleton - matches ChatLayout header */}
      <div class="flex-shrink-0 bg-card px-3 py-2 flex items-center justify-between border-b border-border shadow-sm">
        {/* Title skeleton */}
        <div class="h-6 w-32 bg-secondary rounded animate-pulse" />

        {/* Profile menu skeleton */}
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-full bg-secondary animate-pulse" />
        </div>
      </div>

      {/* Filter bar skeleton - matches ChatLayout filterBar area */}
      <div class="flex-shrink-0 px-3 py-2.5 bg-card border-b border-border">
        {/* Search input skeleton */}
        <div class="h-10 bg-secondary rounded-lg mb-3 animate-pulse" />

        {/* Filter chips skeleton */}
        <div class="flex gap-2">
          <div class="h-8 w-16 bg-secondary rounded-full animate-pulse" />
          <div class="h-8 w-20 bg-secondary rounded-full animate-pulse" />
          <div class="h-8 w-14 bg-secondary rounded-full animate-pulse" />
        </div>
      </div>

      {/* Content area skeleton - ticket list */}
      <div class="flex-1 min-h-0 bg-card">
        <For each={[1, 2, 3, 4, 5]}>
          {(_) => <TicketItemSkeleton />}
        </For>
      </div>
    </div>
  );
}

/**
 * ChatSkeleton - Skeleton for chat/conversation view
 * Alternative skeleton for ticket-chat route
 */
export function ChatSkeleton() {
  return (
    <div class="flex flex-col h-screen bg-background overflow-hidden">
      {/* Chat header skeleton */}
      <div class="flex-shrink-0 bg-card px-4 py-3 flex items-center gap-3 border-b border-border shadow-sm">
        {/* Back button skeleton */}
        <div class="w-8 h-8 bg-secondary rounded-full animate-pulse" />

        {/* Avatar skeleton */}
        <div class="w-10 h-10 rounded-full bg-secondary animate-pulse" />

        {/* Title/status skeleton */}
        <div class="flex-1">
          <div class="h-4 w-32 bg-secondary rounded mb-1 animate-pulse" />
          <div class="h-3 w-20 bg-secondary rounded animate-pulse" />
        </div>
      </div>

      {/* Messages area skeleton */}
      <div class="flex-1 min-h-0 bg-card p-4 space-y-4">
        {/* Message bubbles skeleton - alternating sides */}
        <div class="flex justify-end">
          <div class="w-2/3 h-16 bg-secondary rounded-2xl rounded-br-sm animate-pulse" />
        </div>
        <div class="flex justify-start">
          <div class="w-1/2 h-12 bg-secondary rounded-2xl rounded-bl-sm animate-pulse" />
        </div>
        <div class="flex justify-end">
          <div class="w-3/5 h-10 bg-secondary rounded-2xl rounded-br-sm animate-pulse" />
        </div>
        <div class="flex justify-start">
          <div class="w-2/3 h-20 bg-secondary rounded-2xl rounded-bl-sm animate-pulse" />
        </div>
      </div>

      {/* Input area skeleton */}
      <div class="flex-shrink-0 bg-card px-4 py-3 border-t border-border">
        <div class="flex items-center gap-2">
          <div class="flex-1 h-10 bg-secondary rounded-full animate-pulse" />
          <div class="w-10 h-10 bg-secondary rounded-full animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export default AppShellSkeleton;
