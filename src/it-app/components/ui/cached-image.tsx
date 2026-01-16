'use client';

/**
 * CachedImage Component - Viewport-aware media loading with caching
 *
 * Features:
 * - IntersectionObserver for viewport detection
 * - Cache-first loading (checks IndexedDB before network)
 * - Automatic download and caching when in viewport
 * - Loading skeleton with smooth transitions
 * - Error handling with retry support
 * - Memory-efficient blob URL management
 * - Auto-fetches userId from auth context if not provided
 *
 * T040: Integrated media cache into IT App screenshot/attachment display
 * T042: Viewport-aware media loading - only downloads when in viewport
 *
 * @component CachedImage
 */

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { ImageIcon, AlertCircle } from 'lucide-react';
import { MediaManager } from '@/lib/cache/media-manager';
import { useCurrentUser } from '@/hooks/useCurrentUser';

interface CachedImageProps {
  /** Request ID for cache key */
  requestId: string;
  /** Media filename */
  filename: string;
  /** Presigned URL for download (if not cached) */
  presignedUrl: string;
  /** Alternative text for image */
  alt?: string;
  /** CSS class name for styling */
  className?: string;
  /** Root margin for IntersectionObserver (default: '50px') */
  rootMargin?: string;
  /** Callback when image loads successfully */
  onLoad?: () => void;
  /** Callback when image fails to load */
  onError?: () => void;
  /** Expected file size for caching */
  expectedSize?: number;
  /**
   * User ID for MediaManager initialization
   * @deprecated Auto-fetched from auth context if not provided
   */
  userId?: string;
}

/**
 * CachedImage component with viewport-aware loading
 *
 * T040: Integrated media cache into IT App screenshot/attachment display
 * T042: Viewport-aware media loading - only downloads when in viewport
 *
 * CONSTRAINT: Only prefetch media for messages visible in the current chat viewport
 * - Does NOT prefetch media for other chats
 * - Does NOT prefetch media for messages not yet scrolled into view
 *
 * Only downloads and caches media when it enters the viewport,
 * reducing unnecessary network requests and memory usage.
 */
export function CachedImage({
  requestId,
  filename,
  presignedUrl,
  alt = 'Screenshot',
  className = '',
  rootMargin = '50px',
  onLoad,
  onError,
  expectedSize = 0,
  userId: propUserId,
}: CachedImageProps) {
  // T040: Auto-fetch userId from auth context if not provided
  const { user } = useCurrentUser();
  const userId = propUserId || user?.id || null;

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const imgRef = useRef<HTMLImageElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const hasLoadedRef = useRef(false);

  // T040: Initialize MediaManager (memoized to prevent re-creation)
  const mediaManager = useMemo(() => {
    if (!userId) {
      console.warn('[CachedImage] No userId available (no prop or auth context), caching disabled');
      return null;
    }
    return new MediaManager(userId);
  }, [userId]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      // Disconnect observer
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, []);

  // T040: Load image function - checks cache first, then downloads
  // useCallback to memoize and prevent recreating on every render
  const loadImage = useCallback(async () => {
    if (hasLoadedRef.current) {
      return;
    }

    hasLoadedRef.current = true;
    setLoading(true);
    setError(false);

    try {
      if (!mediaManager) {
        // No MediaManager, fall back to direct URL
        console.log(`[CachedImage] No MediaManager, using direct URL for ${filename}`);
        setImageUrl(presignedUrl);
        setLoading(false);
        onLoad?.();
        return;
      }

      // T040: Check cache first
      const cachedUrl = await mediaManager.getMediaUrl(requestId, filename);
      if (cachedUrl) {
        console.log(`[CachedImage] T040: Cache HIT for ${filename} (requestId: ${requestId})`);
        setImageUrl(cachedUrl);
        blobUrlRef.current = cachedUrl;
        setLoading(false);
        onLoad?.();
        return;
      }

      console.log(`[CachedImage] T040: Cache MISS for ${filename}, downloading...`);

      // T040: Download and cache
      const result = await mediaManager.downloadMedia({
        requestId,
        messageId: '', // Not needed for display
        filename,
        presignedUrl,
        expectedSize,
        priority: 'normal',
      });

      if (result.success && result.localUrl) {
        setImageUrl(result.localUrl);
        blobUrlRef.current = result.localUrl;
        setLoading(false);
        onLoad?.();

        console.log(
          `[CachedImage] T040: ${result.fromCache ? 'Loaded from cache' : 'Downloaded'} ${filename} (requestId: ${requestId})`
        );
      } else {
        throw new Error(result.error || 'Failed to download image');
      }
    } catch (err) {
      console.error(`[CachedImage] T040: Failed to load ${filename}:`, err);
      setError(true);
      setLoading(false);
      onError?.();
    }
  }, [mediaManager, requestId, filename, presignedUrl, expectedSize, onLoad, onError]);

  // T042: Intersection Observer for viewport detection
  // CONSTRAINT: Only download when media enters viewport
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    // T042: Create observer with viewport detection
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // T042: Only trigger load when image enters viewport
          if (entry.isIntersecting && !hasLoadedRef.current) {
            console.log(
              `[CachedImage] T042: Viewport DETECTED for ${filename} (requestId: ${requestId}), starting load...`
            );
            loadImage();

            // Disconnect after triggering load (only load once)
            observerRef.current?.disconnect();
            observerRef.current = null;
          }
        });
      },
      {
        rootMargin, // Start loading before entering viewport (default: 50px)
        threshold: 0, // Trigger as soon as any part is visible
      }
    );

    observerRef.current.observe(img);

    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, [filename, rootMargin, requestId, loadImage]); // Include loadImage in dependencies

  // Handle image load complete
  const handleImageLoad = () => {
    setLoading(false);
    console.log(`[CachedImage] Image rendered: ${filename}`);
  };

  // Handle image render error
  const handleImageError = () => {
    console.error(`[CachedImage] Failed to render image: ${filename}`);
    setError(true);
    setLoading(false);
    onError?.();
  };

  // Loading skeleton
  if (loading) {
    return (
      <div className={`relative ${className}`}>
        <Skeleton className="w-full h-48 bg-muted" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-background/80 rounded px-3 py-2">
            <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <span className="text-xs">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-4 py-6">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <span className="text-xs text-center">Failed to load image</span>
        </div>
      </div>
    );
  }

  // Render image
  return (
    <img
      ref={imgRef}
      src={imageUrl || undefined}
      alt={alt}
      className={className}
      onLoad={handleImageLoad}
      onError={handleImageError}
      loading="lazy" // Browser-native lazy loading as fallback
    />
  );
}
