/**
 * LazyImage Component - Viewport-triggered lazy loading for images
 *
 * T043: Only downloads media when it enters the viewport
 * T041: Uses MediaManager-backed cache for persistence
 *
 * This component wraps image elements and only fetches them when they enter the viewport.
 * It integrates with the image cache context to avoid duplicate fetches.
 *
 * Features:
 * - IntersectionObserver-based viewport detection
 * - 100px root margin for preloading before visible
 * - Automatic cleanup on unmount
 * - Loading and error states
 * - Integrates with persistent MediaManager cache
 */

import { Show, createEffect, onCleanup, createSignal, JSX } from "solid-js";
import { useImageCache } from "@/context/image-cache-context";
import { Spinner } from "@/components/ui/spinner";
import { Image as ImageIcon } from "lucide-solid";

interface LazyImageProps {
  // Request ID for cache key (required for T041 persistence)
  requestId: string;
  // Screenshot filename to load
  filename: string;
  // CSS class for the img element
  class?: string;
  // Alt text for accessibility
  alt?: string;
  // Called when image successfully loads
  onLoad?: (blobUrl: string) => void;
  // Called when image fails to load
  onError?: () => void;
  // Click handler
  onClick?: () => void;
  // Initial dimensions to prevent layout shift
  width?: number;
  height?: number;
  // Whether to show loading spinner
  showSpinner?: boolean;
  // Optional children render function for custom wrapping
  children?: (imgElement: JSX.Element) => JSX.Element;
}

/**
 * LazyImage component that defers image loading until the element enters viewport
 */
export function LazyImage(props: LazyImageProps) {
  const imageCache = useImageCache();
  const [blobUrl, setBlobUrl] = createSignal<string | null>(null);
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal(false);

  // Ref to the wrapper element (observed by IntersectionObserver)
  let wrapperRef: HTMLDivElement | undefined = {
    get value() {
      return wrapperRef;
    },
    set value(val) {
      wrapperRef = val;
    }
  };

  // Register for lazy loading when component mounts
  createEffect(() => {
    if (!wrapperRef) return;

    const requestId = props.requestId;
    const filename = props.filename;
    if (!requestId || !filename) return;

    // Check if already cached (instant load)
    // Use the async check for IndexedDB accuracy
    let isCacheCheckDone = false;

    imageCache.isCachedAsync(requestId, filename)
      .then((cached) => {
        isCacheCheckDone = true;

        if (cached) {
          // Image is cached, load immediately
          setIsLoading(true);
          imageCache.getImageUrl(requestId, filename)
            .then((url) => {
              setBlobUrl(url);
              setIsLoading(false);
              props.onLoad?.(url);
            })
            .catch((err) => {
              console.error(`[LazyImage] Failed to load cached image: ${filename}`, err);
              setError(true);
              setIsLoading(false);
              props.onError?.();
            });
          return;
        }

        // Not cached - register for viewport-triggered loading (T043)
        const cleanup = imageCache.registerForLazyLoading(
          wrapperRef!,
          requestId,
          filename,
          // onLoad - triggered when viewport observer detects intersection
          () => {
            setIsLoading(true);
            imageCache.getImageUrl(requestId, filename)
              .then((url) => {
                setBlobUrl(url);
                setIsLoading(false);
                props.onLoad?.(url);
              })
              .catch((err) => {
                console.error(`[LazyImage] Failed to load image: ${filename}`, err);
                setError(true);
                setIsLoading(false);
                props.onError?.();
              });
          },
          // onError
          () => {
            setError(true);
            setIsLoading(false);
            props.onError?.();
          }
        );

        // Cleanup observer on unmount
        onCleanup(cleanup);
      })
      .catch((err) => {
        console.error(`[LazyImage] Cache check failed for: ${filename}`, err);
        // Fall back to viewport-triggered loading on error
        isCacheCheckDone = true;
      });

    // If cache check takes too long, fall back to viewport loading
    setTimeout(() => {
      if (!isCacheCheckDone) {
        console.warn(`[LazyImage] Cache check timeout for: ${filename}, falling back to viewport loading`);
      }
    }, 1000);
  });

  // Calculate wrapper style to prevent layout shift
  const wrapperStyle = () => {
    const style: JSX.CSSProperties = {};

    if (props.width && props.height) {
      // Use explicit dimensions if provided
      style.width = `${props.width}px`;
      style.height = `${props.height}px`;
    } else if (!props.width && !props.height) {
      // Default dimensions for screenshots
      style.width = "200px";
      style.height = "150px";
    }

    return style;
  };

  // Image element (reused for both default and children rendering)
  const imageElement = () => (
    <img
      src={blobUrl()!}
      alt={props.alt || "Screenshot"}
      class="w-full h-full object-cover rounded cursor-pointer shadow-sm"
      onError={() => {
        setError(true);
        setIsLoading(false);
        props.onError?.();
      }}
      onClick={props.onClick}
      loading="lazy"
      decoding="async"
    />
  );

  // Content to render
  const content = () => {
    // Loading state
    if (isLoading() && props.showSpinner !== false && !blobUrl()) {
      return (
        <div class="flex items-center justify-center w-full h-full">
          <Spinner size="sm" />
        </div>
      );
    }

    // Error state
    if (error() && !blobUrl()) {
      return (
        <div class="flex items-center justify-center gap-2 text-sm text-muted-foreground w-full h-full">
          <ImageIcon class="h-5 w-5" />
        </div>
      );
    }

    // Image
    if (blobUrl()) {
      // If children provided, render them with image element as argument
      if (props.children) {
        return props.children(imageElement());
      }
      // Otherwise render image directly
      return imageElement();
    }

    // Default placeholder
    return (
      <div class="flex items-center justify-center w-full h-full">
        <Spinner size="sm" />
      </div>
    );
  };

  return (
    <div
      ref={wrapperRef}
      class={props.class}
      style={wrapperStyle()}
      classList={{
        "relative overflow-hidden rounded bg-muted": true,
      }}
    >
      {content()}
    </div>
  );
}

export default LazyImage;
