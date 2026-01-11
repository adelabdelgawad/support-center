'use client';

/**
 * MediaViewer Component
 * WhatsApp Web-style full-screen media viewer for chat screenshots
 *
 * Features:
 * - Full-screen overlay with centered image display
 * - WhatsApp Web-style header bar (close, sender info, actions)
 * - Left/right arrow navigation + keyboard shortcuts
 * - Touch/swipe support for mobile navigation
 * - Action toolbar (download, open in new tab, copy link)
 * - Thumbnail timeline at bottom
 * - Smooth transitions between images
 * - Mobile responsive
 */

import * as React from 'react';
import { useEffect, useCallback, useState, useRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  ExternalLinkIcon,
  CopyIcon,
  XIcon,
  Loader2Icon,
  AlertCircleIcon,
  MoreVerticalIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { formatChatTimestamp } from '@/lib/utils/date-formatting';
import { MediaViewerThumbnail } from '@/components/ui/media-viewer-thumbnail';
import type { MediaViewerProps, ScreenshotItem } from '@/types/media-viewer';

export function MediaViewer({
  screenshots,
  initialIndex,
  isOpen,
  onClose,
  onNavigate,
  onIndexChange,
}: MediaViewerProps) {
  // Component mount and updates tracking removed

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  // Refs for thumbnail auto-scrolling and touch gestures
  const timelineRef = useRef<HTMLDivElement>(null);
  const thumbnailRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const touchStartXRef = useRef<number>(0);
  const touchEndXRef = useRef<number>(0);

  // Update current index when initialIndex changes (external control)
  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  // Notify parent of index changes
  useEffect(() => {
    onIndexChange(currentIndex);
  }, [currentIndex, onIndexChange]);

  const currentScreenshot = screenshots[currentIndex];
  const hasMultiple = screenshots.length > 1;
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < screenshots.length - 1;

  // Reset loading and error state when screenshot changes
  useEffect(() => {
    if (isOpen && currentScreenshot) {
      setImageLoading(true);
      setImageError(false);
    }
  }, [isOpen, currentScreenshot]);

  // Auto-scroll to active thumbnail
  useEffect(() => {
    if (!isOpen || !currentScreenshot) return;

    const activeRef = thumbnailRefs.current.get(currentScreenshot.id);
    const timeline = timelineRef.current;

    if (activeRef && timeline) {
      // Calculate scroll position to center active thumbnail
      const scrollLeft =
        activeRef.offsetLeft - timeline.offsetWidth / 2 + activeRef.offsetWidth / 2;

      timeline.scrollTo({
        left: scrollLeft,
        behavior: 'smooth',
      });
    }
  }, [isOpen, currentScreenshot]);

  // Navigation handlers (defined early to avoid hoisting issues)
  const handlePrevious = useCallback(() => {
    if (canGoPrev) {
      setCurrentIndex(prev => prev - 1);
      onNavigate('prev');
    }
  }, [canGoPrev, onNavigate]);

  const handleNext = useCallback(() => {
    if (canGoNext) {
      setCurrentIndex(prev => prev + 1);
      onNavigate('next');
    }
  }, [canGoNext, onNavigate]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
          if (canGoPrev) {
            e.preventDefault();
            handlePrevious();
          }
          break;
        case 'ArrowRight':
          if (canGoNext) {
            e.preventDefault();
            handleNext();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, canGoPrev, canGoNext, onClose, handleNext, handlePrevious]);

  // Touch/swipe navigation for mobile
  useEffect(() => {
    if (!isOpen) return;
    const container = imageContainerRef.current;
    if (!container) return;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartXRef.current = e.touches[0].clientX;
    };

    const handleTouchMove = (e: TouchEvent) => {
      touchEndXRef.current = e.touches[0].clientX;
    };

    const handleTouchEnd = () => {
      const swipeThreshold = 50; // Minimum swipe distance in pixels
      const diff = touchStartXRef.current - touchEndXRef.current;

      if (Math.abs(diff) > swipeThreshold) {
        if (diff > 0 && canGoNext) {
          // Swiped left - go to next
          handleNext();
        } else if (diff < 0 && canGoPrev) {
          // Swiped right - go to previous
          handlePrevious();
        }
      }

      // Reset refs
      touchStartXRef.current = 0;
      touchEndXRef.current = 0;
    };

    container.addEventListener('touchstart', handleTouchStart);
    container.addEventListener('touchmove', handleTouchMove);
    container.addEventListener('touchend', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isOpen, canGoPrev, canGoNext, handleNext, handlePrevious]);

  // Action handlers
  const handleDownload = async () => {
    if (!currentScreenshot) return;

    try {
      const response = await fetch(currentScreenshot.url, {
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to download');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = currentScreenshot.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Download started');
    } catch (error) {
      console.error('Download failed:', error);
      toast.error('Failed to download screenshot');
    }
  };

  const handleOpenInNewTab = () => {
    if (!currentScreenshot) return;
    window.open(currentScreenshot.url, '_blank', 'noopener,noreferrer');
  };

  const handleCopyLink = async () => {
    if (!currentScreenshot) return;

    try {
      const fullUrl = `${window.location.origin}${currentScreenshot.url}`;
      await navigator.clipboard.writeText(fullUrl);
      toast.success('Link copied to clipboard');
    } catch (error) {
      console.error('Copy failed:', error);
      toast.error('Failed to copy link');
    }
  };

  const handleImageLoad = () => {
    setImageLoading(false);
  };

  const handleImageError = () => {
    setImageLoading(false);
    setImageError(true);
  };

  const handleRetry = () => {
    setImageError(false);
    setImageLoading(true);
  };

  if (!currentScreenshot) return null;

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={onClose}>
      <DialogPrimitive.Portal>
        {/* Custom full-screen overlay */}
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50',
            'bg-black/98 backdrop-blur-sm',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
          )}
        />

        {/* Custom full-screen content - NO default close button */}
        <DialogPrimitive.Content
          className={cn(
            // Full screen
            'fixed inset-0 z-50',
            'w-screen h-screen',
            'p-0 border-none rounded-none shadow-none',
            'bg-transparent',
            // Prevent scroll
            'overflow-hidden',
            // Animations
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0'
          )}
        >
          {/* Visually hidden title for accessibility */}
          <DialogPrimitive.Title className="sr-only">
            Screenshot from {currentScreenshot.sender.name} - {currentIndex + 1} of {screenshots.length}
          </DialogPrimitive.Title>

          {/* WhatsApp Web-style Header Bar */}
          <div
            className={cn(
              'fixed top-0 left-0 right-0 z-50',
              'h-16 px-4',
              'flex items-center justify-between gap-4',
              'bg-[#1f1f1f]/95 backdrop-blur-md',
              'border-b border-white/5',
              'text-white'
            )}
            data-testid="whatsapp-header-bar"
          >
            {/* Left: Close button */}
            <button
              onClick={onClose}
              className={cn(
                'size-10 rounded-full',
                'flex items-center justify-center',
                'hover:bg-white/10',
                'transition-colors duration-200',
                'focus:outline-none focus:ring-2 focus:ring-white/30'
              )}
              aria-label="Close viewer"
            >
              <XIcon className="size-5" />
            </button>

            {/* Center: Sender info and counter */}
            <div className="flex-1 flex flex-col items-center justify-center min-w-0">
              {/* Sender name */}
              <div className="font-medium text-sm truncate max-w-md">
                {currentScreenshot.sender.name}
              </div>

              {/* Timestamp and counter */}
              <div className="flex items-center gap-2 text-xs text-white/70">
                <span>{formatChatTimestamp(currentScreenshot.timestamp)}</span>
                {hasMultiple && (
                  <>
                    <span>•</span>
                    <span className="font-medium text-white/90">
                      {currentIndex + 1} / {screenshots.length}
                    </span>
                  </>
                )}
              </div>

              {/* Optional message content */}
              {currentScreenshot.messageContent && (
                <div className="text-xs text-white/50 mt-0.5 truncate max-w-md">
                  {currentScreenshot.messageContent}
                </div>
              )}
            </div>

            {/* Right: Action buttons */}
            <div className="flex items-center gap-1">
              {/* Download button */}
              <button
                onClick={handleDownload}
                className={cn(
                  'size-10 rounded-full',
                  'flex items-center justify-center',
                  'hover:bg-white/10',
                  'transition-colors duration-200',
                  'focus:outline-none focus:ring-2 focus:ring-white/30'
                )}
                aria-label="Download screenshot"
                title="Download"
              >
                <DownloadIcon className="size-4.5" />
              </button>

              {/* Open in new tab button */}
              <button
                onClick={handleOpenInNewTab}
                className={cn(
                  'size-10 rounded-full',
                  'flex items-center justify-center',
                  'hover:bg-white/10',
                  'transition-colors duration-200',
                  'focus:outline-none focus:ring-2 focus:ring-white/30'
                )}
                aria-label="Open in new tab"
                title="Open in new tab"
              >
                <ExternalLinkIcon className="size-4.5" />
              </button>

              {/* More options button */}
              <button
                onClick={handleCopyLink}
                className={cn(
                  'size-10 rounded-full',
                  'flex items-center justify-center',
                  'hover:bg-white/10',
                  'transition-colors duration-200',
                  'focus:outline-none focus:ring-2 focus:ring-white/30'
                )}
                aria-label="More options"
                title="Copy link"
              >
                <MoreVerticalIcon className="size-4.5" />
              </button>
            </div>
          </div>

          {/* Main image container - with touch support */}
          <div
            ref={imageContainerRef}
            className={cn(
              'relative w-full h-full flex items-center justify-center',
              // Space for header (64px) and thumbnail timeline (~120px)
              'pt-16',
              hasMultiple ? 'pb-32' : 'pb-4'
            )}
            style={{ touchAction: 'pan-y' }} // Allow vertical scroll but handle horizontal swipes
          >
            {/* Previous button - Left edge */}
            {hasMultiple && canGoPrev && (
              <button
                onClick={handlePrevious}
                className={cn(
                  'absolute left-4 top-1/2 -translate-y-1/2 z-40',
                  'size-14 rounded-full',
                  'flex items-center justify-center',
                  'bg-white/10 backdrop-blur-md',
                  'text-white hover:bg-white/20',
                  'transition-all duration-200',
                  'focus:outline-none focus:ring-2 focus:ring-white/40',
                  'hover:scale-105',
                  'active:scale-95',
                  // Hide on mobile if image is large
                  'md:flex'
                )}
                aria-label="Previous screenshot"
              >
                <ChevronLeftIcon className="size-7" />
              </button>
            )}

            {/* Image - Larger display area */}
            <div className="relative w-full h-full flex items-center justify-center">
              {imageLoading && (
                <div className="absolute inset-0 flex items-center justify-center z-10">
                  <Loader2Icon className="size-10 text-white animate-spin" />
                </div>
              )}

              {imageError ? (
                <div className="flex flex-col items-center justify-center gap-4 p-8 bg-white/5 backdrop-blur-md rounded-lg">
                  <AlertCircleIcon className="size-14 text-red-400" />
                  <p className="text-white text-center text-base">
                    Failed to load screenshot
                  </p>
                  <button
                    onClick={handleRetry}
                    className={cn(
                      'px-6 py-2.5 rounded-lg',
                      'bg-white/15 hover:bg-white/25',
                      'text-white text-sm font-medium',
                      'transition-colors duration-200',
                      'focus:outline-none focus:ring-2 focus:ring-white/40'
                    )}
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={currentScreenshot.url}
                    alt={`Screenshot from ${currentScreenshot.sender.name}`}
                    className={cn(
                      // Larger image - account for header (64px) + thumbnail area (120px) + spacing
                      'max-w-[95vw] w-auto h-auto',
                      hasMultiple
                        ? 'max-h-[calc(100vh-12rem)]' // With thumbnails: 100vh - 192px
                        : 'max-h-[calc(100vh-5rem)]',  // Without thumbnails: 100vh - 80px
                      'object-contain',
                      // Subtle shadow for depth
                      'shadow-2xl',
                      // Smooth fade in
                      'transition-opacity duration-300 ease-out',
                      imageLoading ? 'opacity-0' : 'opacity-100',
                      // Select disabled to prevent drag artifacts
                      'select-none'
                    )}
                    onLoad={handleImageLoad}
                    onError={handleImageError}
                    draggable={false}
                  />
                </>
              )}
            </div>

            {/* Next button - Right edge */}
            {hasMultiple && canGoNext && (
              <button
                onClick={handleNext}
                className={cn(
                  'absolute right-4 top-1/2 -translate-y-1/2 z-40',
                  'size-14 rounded-full',
                  'flex items-center justify-center',
                  'bg-white/10 backdrop-blur-md',
                  'text-white hover:bg-white/20',
                  'transition-all duration-200',
                  'focus:outline-none focus:ring-2 focus:ring-white/40',
                  'hover:scale-105',
                  'active:scale-95',
                  // Hide on mobile if image is large
                  'md:flex'
                )}
                aria-label="Next screenshot"
              >
                <ChevronRightIcon className="size-7" />
              </button>
            )}
          </div>

          {/* Thumbnail timeline - Bottom (Separate section) */}
          {hasMultiple && (
            <div
              className={cn(
                'fixed bottom-0 left-0 right-0 z-50',
                'py-4 px-4',
                'bg-[#1f1f1f]/95 backdrop-blur-md',
                'border-t border-white/10'
              )}
            >
              <div
                className={cn(
                  'max-w-[95vw] mx-auto',
                  'px-3 py-2.5 rounded-xl',
                  'bg-black/30'
                )}
              >
              <div
                ref={timelineRef}
                className={cn(
                  'flex items-center gap-2.5',
                  'overflow-x-auto overflow-y-hidden',
                  'scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent',
                  'scroll-smooth',
                  // Padding for better scroll experience
                  'px-2 py-1'
                )}
                style={{
                  // Enable scroll snap on mobile for better UX
                  scrollSnapType: 'x proximity',
                }}
              >
                {screenshots.map((screenshot, index) => (
                  <div
                    key={screenshot.id}
                    style={{ scrollSnapAlign: 'center' }}
                  >
                    <MediaViewerThumbnail
                      ref={(el) => {
                        if (el) {
                          thumbnailRefs.current.set(screenshot.id, el);
                        } else {
                          thumbnailRefs.current.delete(screenshot.id);
                        }
                      }}
                      screenshot={screenshot}
                      isActive={index === currentIndex}
                      onClick={() => {
                        setCurrentIndex(index);
                        onIndexChange(index);
                      }}
                    />
                  </div>
                ))}
              </div>
              </div>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
