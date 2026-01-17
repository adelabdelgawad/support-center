/**
 * CachedImage Component - Persistent, retry-capable image with offline support
 *
 * Architecture:
 * - SQLite stores metadata only (no image data)
 * - Filesystem stores actual image bytes (%APPDATA%/supportcenter.requester/images/)
 *
 * Features:
 * - Cache-first loading (instant from filesystem if cached)
 * - Shows loading spinner while fetching
 * - Shows retry button for NOT_FOUND or ERROR states
 * - Retry button disabled when offline
 * - Click handler for image viewer integration
 *
 * Usage:
 * <CachedImage
 *   filename="screenshot-123.png"
 *   requestId="request-uuid"
 *   onClick={() => openViewer()}
 *   class="w-full h-full object-cover"
 * />
 */

import { createSignal, createResource, Show, type JSX } from "solid-js";
import { useImageCache } from "@/context/image-cache-context";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Image, RefreshCw, WifiOff } from "lucide-solid";

interface CachedImageProps {
  /** Screenshot filename to load */
  filename: string;
  /** Request ID for cache association */
  requestId: string;
  /** Alt text for the image */
  alt?: string;
  /** Additional CSS classes */
  class?: string;
  /** Click handler (for opening image viewer) */
  onClick?: () => void;
  /** Callback when image loads (for layout adjustment) */
  onLoad?: () => void;
  /** Callback when image dimensions are determined */
  onDimensionsReady?: (dimensions: { width: number; height: number }) => void;
  /** Initial dimensions (to prevent layout shift on re-render) */
  initialDimensions?: { width: number; height: number } | null;
  /** Container width constraint */
  maxWidth?: number;
}

export function CachedImage(props: CachedImageProps) {
  const imageCache = useImageCache();
  const maxWidth = () => props.maxWidth ?? 200;

  // Track if we're in retry mode
  const [retryCount, setRetryCount] = createSignal(0);

  // Track online status
  const [isOnline, setIsOnline] = createSignal(navigator.onLine);

  // Listen for online/offline events
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => setIsOnline(true));
    window.addEventListener("offline", () => setIsOnline(false));
  }

  // Image dimensions for stable layout
  const [imageDimensions, setImageDimensions] = createSignal(
    props.initialDimensions ?? null
  );

  // Load image using the cache context
  // The resource refetches when retryCount changes
  const [imageResult] = createResource(
    () => ({ filename: props.filename, requestId: props.requestId, retry: retryCount() }),
    async ({ filename, requestId, retry }) => {
      if (retry > 0) {
        // This is a retry - use the retry method
        return await imageCache.retryImage(filename, requestId);
      }
      // Normal fetch
      return await imageCache.getImageUrl(filename, requestId);
    }
  );

  // Handle retry button click
  const handleRetry = () => {
    if (!isOnline()) return;
    setRetryCount((c) => c + 1);
  };

  // Handle image load
  const handleImageLoad: JSX.EventHandler<HTMLImageElement, Event> = (e) => {
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight) {
      const dims = { width: img.naturalWidth, height: img.naturalHeight };
      setImageDimensions(dims);
      props.onDimensionsReady?.(dims);
    }
    props.onLoad?.();
  };

  // Calculate display dimensions
  const displayDimensions = () => {
    const dims = imageDimensions();
    if (!dims) return { width: maxWidth(), height: 150 };

    const scale = Math.min(maxWidth() / dims.width, 1);
    return {
      width: Math.round(dims.width * scale),
      height: Math.round(dims.height * scale),
    };
  };

  return (
    <div
      style={{
        width: `${displayDimensions().width}px`,
        height: `${displayDimensions().height}px`,
      }}
      class="relative overflow-hidden rounded bg-muted"
    >
      {/* Loading state */}
      <Show when={imageResult.loading}>
        <div class="flex items-center justify-center w-full h-full">
          <Spinner size="sm" />
        </div>
      </Show>

      {/* Error/NOT_FOUND states with retry button */}
      <Show when={!imageResult.loading && imageResult()?.status !== 'CACHED'}>
        <div class="flex flex-col items-center justify-center gap-2 w-full h-full p-2">
          {/* Icon based on status */}
          <Show when={imageResult()?.status === 'NOT_FOUND'}>
            <Image class="h-6 w-6 text-muted-foreground" />
            <span class="text-xs text-muted-foreground text-center">
              Image not found
            </span>
          </Show>
          <Show when={imageResult()?.status === 'ERROR'}>
            <Image class="h-6 w-6 text-destructive" />
            <span class="text-xs text-destructive text-center">
              Failed to load
            </span>
          </Show>

          {/* Retry button */}
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleRetry();
            }}
            disabled={!isOnline()}
            class="text-xs h-7 px-2 gap-1"
            title={isOnline() ? "Retry loading image" : "Offline - cannot retry"}
          >
            <Show when={isOnline()} fallback={
              <>
                <WifiOff class="h-3 w-3" />
                Offline
              </>
            }>
              <RefreshCw class="h-3 w-3" />
              Retry
            </Show>
          </Button>
        </div>
      </Show>

      {/* Successfully cached image */}
      <Show when={!imageResult.loading && imageResult()?.status === 'CACHED' && imageResult()?.blobUrl}>
        <Button
          onClick={(e) => {
            e.stopPropagation();
            props.onClick?.();
          }}
          class="block hover:opacity-80 transition-opacity w-full h-full"
          type="button"
        >
          <img
            src={imageResult()!.blobUrl!}
            alt={props.alt || "Screenshot"}
            class={props.class || "w-full h-full object-cover rounded cursor-pointer shadow-sm"}
            onLoad={handleImageLoad}
            loading="lazy"
            decoding="async"
          />
        </Button>
      </Show>
    </div>
  );
}

export default CachedImage;
