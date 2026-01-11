/**
 * ============================================================================
 * PHASE 3 OPTIMIZATION: Lazy-Loaded Image Providers
 * ============================================================================
 *
 * This component lazy-loads ImageCache and ImageViewer providers.
 * They're only needed on the chat page when viewing images, so we don't
 * need to load them on initial app startup.
 *
 * Benefits:
 * - Smaller initial bundle (~10-20 KB)
 * - Faster initial render (fewer providers to initialize)
 * - Providers only load when actually needed
 *
 * Usage:
 * Wrap only routes that need image functionality
 */

import { Component, JSX, lazy, Suspense } from 'solid-js';

// Lazy load the providers
const ImageCacheProvider = lazy(() =>
  import('@/context/image-cache-context').then(mod => ({ default: mod.ImageCacheProvider }))
);

const ImageViewerProvider = lazy(() =>
  import('@/context/image-viewer-context').then(mod => ({ default: mod.ImageViewerProvider }))
);

interface LazyImageProvidersProps {
  children: JSX.Element;
}

/**
 * Chat page skeleton - matches the actual chat layout structure
 */
function ChatPageSkeleton() {
  return (
    <div class="flex flex-col h-screen bg-background overflow-hidden">
      {/* Header skeleton */}
      <div class="flex-shrink-0 bg-card px-3 py-2 flex items-center gap-3 border-b">
        <div class="w-8 h-8 rounded-full bg-secondary animate-pulse" />
        <div class="flex-1">
          <div class="h-4 w-32 bg-secondary rounded animate-pulse mb-1" />
          <div class="h-3 w-24 bg-secondary/60 rounded animate-pulse" />
        </div>
      </div>

      {/* Messages area skeleton */}
      <div class="flex-1 p-4 space-y-4 overflow-hidden">
        {/* Incoming message */}
        <div class="flex justify-start">
          <div class="max-w-[75%] rounded-2xl rounded-bl-sm bg-secondary/60 p-3">
            <div class="h-3 w-32 bg-secondary rounded animate-pulse mb-2" />
            <div class="h-3 w-48 bg-secondary rounded animate-pulse" />
          </div>
        </div>
        {/* Outgoing message */}
        <div class="flex justify-end">
          <div class="max-w-[75%] rounded-2xl rounded-br-sm bg-primary/20 p-3">
            <div class="h-3 w-40 bg-primary/30 rounded animate-pulse mb-2" />
            <div class="h-3 w-28 bg-primary/30 rounded animate-pulse" />
          </div>
        </div>
        {/* Incoming message */}
        <div class="flex justify-start">
          <div class="max-w-[75%] rounded-2xl rounded-bl-sm bg-secondary/60 p-3">
            <div class="h-3 w-56 bg-secondary rounded animate-pulse" />
          </div>
        </div>
      </div>

      {/* Input area skeleton */}
      <div class="flex-shrink-0 bg-card border-t p-3">
        <div class="flex items-center gap-2">
          <div class="w-10 h-10 rounded-full bg-secondary animate-pulse" />
          <div class="flex-1 h-10 rounded-full bg-secondary animate-pulse" />
          <div class="w-10 h-10 rounded-full bg-secondary animate-pulse" />
        </div>
      </div>
    </div>
  );
}

/**
 * Combined lazy-loaded image providers
 * Only loads when component mounts (i.e., when chat page is opened)
 */
export const LazyImageProviders: Component<LazyImageProvidersProps> = (props) => {
  return (
    <Suspense fallback={<ChatPageSkeleton />}>
      <ImageCacheProvider>
        <ImageViewerProvider>
          {props.children}
        </ImageViewerProvider>
      </ImageCacheProvider>
    </Suspense>
  );
};
