"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { ImageIcon, Loader2, FileText, FileSpreadsheet, FileIcon, Download, Paperclip } from "lucide-react";
import { useRequestDetail } from "../_context/request-detail-context";
import { useFormattedChatTimestamp } from "@/lib/utils/hydration-safe-date";
// NOTE: Using regular <img> instead of next/image because the screenshot endpoint
// requires authentication cookies, which next/image doesn't send by default

// Screenshot retry configuration
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 1500; // 1.5 seconds
const MAX_RETRY_DELAY = 8000; // 8 seconds max

/**
 * Format file size in bytes to human readable format
 * @param bytes - File size in bytes
 * @returns Formatted string like "1.2 MB", "500 KB", etc.
 */
function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = bytes / Math.pow(k, i);

  // Show 1 decimal place for KB and above, no decimals for bytes
  return i === 0
    ? `${size} ${units[i]}`
    : `${size.toFixed(1)} ${units[i]}`;
}

/**
 * Get appropriate icon component based on MIME type
 */
function getFileIcon(mimeType: string | null | undefined) {
  if (!mimeType) return FileIcon;

  if (mimeType.includes("pdf")) return FileText;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv")) return FileSpreadsheet;
  if (mimeType.includes("document") || mimeType.includes("word") || mimeType.includes("text")) return FileText;

  return Paperclip;
}

/**
 * Check if a MIME type represents an image
 */
function isImageMimeType(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false;
  return mimeType.startsWith("image/");
}

interface LeftChatMessageProps {
  /** Unique message ID for tracking */
  id?: string;
  author: string;
  authorInitials: string;
  timestamp: string;
  content: string;
  avatarUrl?: string;
  isScreenshot?: boolean;
  screenshotFileName?: string | null;
  /** File attachment fields */
  fileName?: string | null;
  fileSize?: number | null;
  fileMimeType?: string | null;
  isMobile?: boolean;
  /** Called when image starts loading (for scroll coordination) */
  onImageLoadStart?: (messageId: string) => void;
  /** Called when image finishes loading (for scroll coordination) */
  onImageLoad?: (messageId: string) => void;
}

/**
 * Left-aligned chat message component for other users (requester)
 * Avatar on left, muted bubble, name and timestamp aligned left
 */
export function LeftChatMessage({
  id,
  author,
  authorInitials,
  timestamp,
  content,
  avatarUrl,
  isScreenshot,
  screenshotFileName,
  fileName,
  fileSize,
  fileMimeType,
  isMobile = false,
  onImageLoadStart,
  onImageLoad,
}: LeftChatMessageProps) {
  const [imageError, setImageError] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [imageKey, setImageKey] = useState(0); // Force re-render of img tag
  const { openMediaViewer } = useRequestDetail();
  const hasNotifiedLoadStartRef = useRef(false);

  // Hydration-safe timestamp formatting (UTC on server, local timezone on client)
  const formattedTimestamp = useFormattedChatTimestamp(timestamp);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const screenshotUrl = screenshotFileName
    ? `/api/screenshots/by-filename/${screenshotFileName}`
    : null;

  // Use message ID for tracking (fallback to screenshotFileName for backward compat)
  const messageId = id || screenshotFileName || '';

  // Cleanup retry timeout on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // Notify parent when image starts loading (only once)
  useEffect(() => {
    if (isScreenshot && screenshotFileName && onImageLoadStart && !hasNotifiedLoadStartRef.current) {
      hasNotifiedLoadStartRef.current = true;
      onImageLoadStart(messageId);
    }
  }, [isScreenshot, screenshotFileName, onImageLoadStart, messageId]);

  // Schedule retry with exponential backoff
  const scheduleRetry = useCallback(() => {
    if (retryCount >= MAX_RETRIES) {
      console.log(`[Screenshot] Max retries (${MAX_RETRIES}) reached for ${screenshotFileName}`);
      setImageError(true);
      setIsProcessing(false);
      if (onImageLoad && messageId) {
        onImageLoad(messageId);
      }
      return;
    }

    // Calculate delay with exponential backoff (capped at MAX_RETRY_DELAY)
    const delay = Math.min(INITIAL_RETRY_DELAY * Math.pow(1.5, retryCount), MAX_RETRY_DELAY);
    console.log(`[Screenshot] Scheduling retry ${retryCount + 1}/${MAX_RETRIES} for ${screenshotFileName} in ${delay}ms`);

    retryTimeoutRef.current = setTimeout(() => {
      setRetryCount(prev => prev + 1);
      setImageKey(prev => prev + 1); // Force img tag to re-fetch
    }, delay);
  }, [retryCount, screenshotFileName, messageId, onImageLoad]);

  // Handle image load complete
  const handleImageLoad = () => {
    console.log(`[Screenshot] Successfully loaded: ${screenshotFileName}`);
    setIsProcessing(false);
    setImageError(false);
    if (onImageLoad && messageId) {
      onImageLoad(messageId);
    }
  };

  // Handle image error with retry logic
  const handleImageError = async () => {
    console.log(`[Screenshot] Load error for ${screenshotFileName}, checking if processing...`);

    // Check if this is a "still processing" error (HTTP 202)
    if (screenshotUrl && retryCount < MAX_RETRIES) {
      try {
        const response = await fetch(screenshotUrl, { method: 'HEAD' });

        if (response.status === 202) {
          // Screenshot still processing - show loading state and retry
          console.log(`[Screenshot] Still processing (202): ${screenshotFileName}`);
          setIsProcessing(true);
          setImageError(false);
          scheduleRetry();
          return;
        } else if (response.status === 404 || response.status === 410) {
          // Permanent failure - don't retry
          console.log(`[Screenshot] Permanent failure (${response.status}): ${screenshotFileName}`);
          setImageError(true);
          setIsProcessing(false);
          if (onImageLoad && messageId) {
            onImageLoad(messageId);
          }
          return;
        }
      } catch {
        // Network error or other issue - try again
        console.log(`[Screenshot] Network error checking status, will retry: ${screenshotFileName}`);
      }

      // Unknown error but under retry limit - show processing and retry
      setIsProcessing(true);
      scheduleRetry();
      return;
    }

    // Max retries reached or other permanent error
    setImageError(true);
    setIsProcessing(false);
    if (onImageLoad && messageId) {
      onImageLoad(messageId);
    }
  };

  return (
    <div className={`flex items-start ${isMobile ? 'gap-2' : 'gap-3'} flex-row`}>
      {/* Avatar on the left */}
      <Avatar className={`shrink-0 ${isMobile ? 'h-8 w-8' : ''}`}>
        <AvatarFallback className={isMobile ? 'text-xs' : ''}>{authorInitials}</AvatarFallback>
      </Avatar>

      {/* Message content */}
      <div className={`flex-1 min-w-0 ${isMobile ? 'max-w-[85%]' : 'max-w-[70%]'}`}>
        {/* Name and timestamp aligned left */}
        <div className={`flex items-center gap-2 ${isMobile ? 'mb-1' : 'mb-2'} flex-row`}>
          <span className={`font-semibold text-foreground ${isMobile ? 'text-sm' : ''}`}>{author}</span>
          <span className="text-muted-foreground">•</span>
          <span className={`text-muted-foreground ${isMobile ? 'text-xs' : 'text-sm'}`}>{formattedTimestamp}</span>
        </div>

        {/* Message bubble - Muted color for other users */}
        <Card className={`bg-muted border-muted ${isMobile ? 'py-2' : 'py-3'} my-0`}>
          <CardContent className={`py-0 ${isMobile ? 'px-2' : 'px-2'} space-y-2`}>
            {/* Screenshot processing indicator */}
            {isScreenshot && screenshotFileName && isProcessing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-background/50 rounded px-3 py-2 min-w-[200px]">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="truncate">Processing screenshot...</span>
              </div>
            )}

            {/* Screenshot thumbnail - only show when not processing */}
            {isScreenshot && screenshotUrl && !imageError && !isProcessing && (
              <div
                onClick={() => screenshotFileName && openMediaViewer(screenshotFileName)}
                className="block hover:opacity-80 transition-opacity cursor-pointer"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    screenshotFileName && openMediaViewer(screenshotFileName);
                  }
                }}
                aria-label="View screenshot in full screen"
              >
                {/* Using <img> instead of Next Image to preserve authentication cookies */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={imageKey}
                  src={`${screenshotUrl}?v=${imageKey}`}
                  alt="Screenshot"
                  className="rounded border border-border cursor-pointer w-full h-auto shadow-sm max-w-md"
                  onLoad={handleImageLoad}
                  onError={handleImageError}
                  loading="lazy"
                />
              </div>
            )}

            {/* Fallback to filename if image fails after retries */}
            {isScreenshot && screenshotFileName && imageError && !isProcessing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-background/50 rounded px-2 py-1.5">
                <ImageIcon className="h-4 w-4" />
                <span className="truncate">Screenshot unavailable</span>
              </div>
            )}

            {/* File attachment (non-image files like PDF, DOC, etc.) */}
            {fileName && !isImageMimeType(fileMimeType) && (() => {
              const FileIconComponent = getFileIcon(fileMimeType);
              const downloadUrl = `/api/chat-files/by-filename/${fileName}`;
              return (
                <a
                  href={downloadUrl}
                  download
                  className="flex items-center gap-3 bg-background/50 hover:bg-background/70 transition-colors rounded-lg px-3 py-2 border border-border/50 max-w-xs group"
                  title={`Download ${fileName}`}
                >
                  <div className="flex-shrink-0 p-2 bg-primary/10 rounded-md">
                    <FileIconComponent className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{fileName}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(fileSize)}</p>
                  </div>
                  <Download className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                </a>
              );
            })()}

            {/* Message text - only show if NOT default screenshot text */}
            {(!isScreenshot || (content && !content.includes("📷") && content.trim() !== "Screenshot" && content.trim() !== "[Screenshot]")) && (
              <p dir="auto" className="whitespace-pre-line wrap-break text-foreground m-0 leading-tight">
                {content}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
