'use client';

/**
 * MediaViewerThumbnail Component
 * Individual thumbnail item for the media viewer timeline
 *
 * Features:
 * - Viewport-aware lazy-loaded thumbnail image with caching
 * - Active state highlighting (border + scale)
 * - Sender initials badge overlay
 * - Click handler to jump to screenshot
 * - Hover effects
 * - Responsive sizing (desktop vs mobile)
 * - Cached media loading with IndexedDB
 */

import * as React from 'react';
import { useState, forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { ImageIcon } from 'lucide-react';
import { CachedImage } from '@/components/ui/cached-image';
import type { MediaViewerThumbnailProps } from '@/types/media-viewer';

export const MediaViewerThumbnail = forwardRef<HTMLButtonElement, MediaViewerThumbnailProps>(
  function MediaViewerThumbnail({ screenshot, isActive, onClick }, ref) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const handleImageLoad = () => {
    setImageLoaded(true);
  };

  const handleImageError = () => {
    setImageError(true);
  };

  return (
    <button
      ref={ref}
      onClick={onClick}
      className={cn(
        'relative flex-shrink-0',
        'rounded-fluent-md overflow-hidden',
        'transition-all duration-fast ease-fluent-standard',
        'focus:outline-none focus:ring-2 focus:ring-white/50',
        // Size - responsive
        'w-20 h-14 sm:w-20 sm:h-15', // 80x60px on desktop, 80x60px on mobile
        // Active state
        isActive && [
          'ring-2 ring-primary scale-110',
          'shadow-fluent-16',
        ],
        // Hover state (only if not active)
        !isActive && 'hover:scale-105 hover:ring-1 hover:ring-white/30'
      )}
      aria-label={`View screenshot from ${screenshot.sender.name}`}
      aria-current={isActive}
    >
      {/* Thumbnail image */}
      <div className="relative w-full h-full bg-black/40">
        {!imageError ? (
          <>
            {/* Use CachedImage for viewport-aware loading with caching */}
            <CachedImage
              requestId={screenshot.requestId}
              filename={screenshot.filename}
              presignedUrl={screenshot.url}
              alt={`Thumbnail from ${screenshot.sender.name}`}
              className={cn(
                'w-full h-full object-cover',
                'transition-opacity duration-normal ease-fluent-decelerate',
                imageLoaded ? 'opacity-100' : 'opacity-0'
              )}
              onLoad={handleImageLoad}
              onError={handleImageError}
              rootMargin="100px" // Load thumbnails earlier for smoother UX
            />
          </>
        ) : (
          // Error state
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <ImageIcon className="size-5 text-white/40" />
          </div>
        )}

        {/* Sender initials badge - Bottom right corner */}
        <div
          className={cn(
            'absolute bottom-1 right-1',
            'size-6 rounded-full',
            'flex items-center justify-center',
            'bg-primary text-primary-foreground',
            'text-[10px] font-semibold',
            'shadow-fluent-8'
          )}
          title={screenshot.sender.name}
        >
          {screenshot.sender.initials}
        </div>

        {/* Active indicator overlay */}
        {isActive && (
          <div className="absolute inset-0 bg-primary/10 pointer-events-none" />
        )}
      </div>
    </button>
  );
});
