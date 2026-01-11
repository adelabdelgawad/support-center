"use client";

import { useState, KeyboardEvent, useRef, useMemo, useCallback } from 'react';
import { Paperclip, Send, AlertCircle, X, FileText, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

/** Maximum number of attachments per message */
const MAX_ATTACHMENTS = 10;

/** Staged file with preview URL */
export interface StagedFile {
  id: string;
  file: File;
  previewUrl?: string;
  isImage: boolean;
}

interface TicketReplySectionProps {
  recipientName: string;
  recipientInitials: string;
  onSubmit?: (replyText: string, attachments?: File[]) => void;
  disabled?: boolean;
  disabledReason?: string;
  isUploading?: boolean;
}

/**
 * TicketReplySection - SSR-safe reply component
 *
 * HYDRATION SAFETY:
 * - Single layout structure with CSS Grid for responsive design
 * - No duplicate elements - buttons/textarea rendered once
 * - Uses CSS Grid repositioning (grid-template-columns/rows) at md: breakpoint
 * - No conditional rendering based on viewport state
 * - Prevents hydration mismatches
 *
 * LAYOUT:
 * - Mobile: [Attach] [Textarea] [Send] - horizontal row
 * - Desktop: [Textarea] [Send]
 *            [Textarea] [Attach] - 2x2 grid with textarea spanning both rows
 */
/**
 * Check if a file is an image based on MIME type
 */
function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

/**
 * Generate a unique ID for staged files
 */
function generateFileId(): string {
  return `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TicketReplySection({
  recipientName,
  recipientInitials,
  onSubmit,
  disabled = false,
  disabledReason,
  isUploading = false,
}: TicketReplySectionProps) {
  const [replyText, setReplyText] = useState('');
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Check if can add more attachments
  const canAddMoreAttachments = stagedFiles.length < MAX_ATTACHMENTS;
  const remainingSlots = MAX_ATTACHMENTS - stagedFiles.length;

  /**
   * Add files to staging area (client-side only, no upload)
   */
  const stageFiles = useCallback((files: File[]) => {
    // Calculate how many files we can add
    const slotsAvailable = MAX_ATTACHMENTS - stagedFiles.length;
    if (slotsAvailable <= 0) {
      return; // Already at max
    }

    // Take only as many files as we have slots for
    const filesToAdd = files.slice(0, slotsAvailable);

    // Create staged file entries with previews for images
    const newStagedFiles: StagedFile[] = filesToAdd.map((file) => {
      const isImage = isImageFile(file);
      return {
        id: generateFileId(),
        file,
        previewUrl: isImage ? URL.createObjectURL(file) : undefined,
        isImage,
      };
    });

    setStagedFiles((prev) => [...prev, ...newStagedFiles]);
  }, [stagedFiles.length]);

  /**
   * Remove a staged file
   */
  const removeStagedFile = useCallback((id: string) => {
    setStagedFiles((prev) => {
      const fileToRemove = prev.find((f) => f.id === id);
      // Revoke object URL to prevent memory leaks
      if (fileToRemove?.previewUrl) {
        URL.revokeObjectURL(fileToRemove.previewUrl);
      }
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  /**
   * Clear all staged files
   */
  const clearStagedFiles = useCallback(() => {
    // Revoke all object URLs
    stagedFiles.forEach((f) => {
      if (f.previewUrl) {
        URL.revokeObjectURL(f.previewUrl);
      }
    });
    setStagedFiles([]);
  }, [stagedFiles]);

  const handleSubmit = () => {
    // Can submit if there's text OR attachments (or both)
    const hasContent = replyText.trim().length > 0 || stagedFiles.length > 0;
    if (onSubmit && hasContent && !disabled && !isUploading) {
      const attachmentFiles = stagedFiles.map((sf) => sf.file);
      onSubmit(replyText.trim(), attachmentFiles.length > 0 ? attachmentFiles : undefined);
      setReplyText('');
      clearStagedFiles();
      // Keep focus on the textarea after sending
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleAttachmentClick = () => {
    if (canAddMoreAttachments) {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      stageFiles(files);
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // Don't process paste if disabled or uploading
    if (disabled || isUploading) {
      return;
    }

    // Check if clipboard contains files
    const items = e.clipboardData?.items;
    if (!items) {
      return;
    }

    // Extract image files from clipboard
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      // Check if item is an image
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          imageFiles.push(file);
        }
      }
    }

    // If images were found, stage them (no upload)
    if (imageFiles.length > 0) {
      // Prevent the default paste behavior for images
      // (but allow text to paste normally)
      e.preventDefault();
      stageFiles(imageFiles);
    }
  };

  // Determine if send button should be enabled
  const canSend = !disabled && !isUploading && (replyText.trim().length > 0 || stagedFiles.length > 0);

  return (
    <>
      <Separator />
      {/* Reply Section */}
      <Card
        ref={containerRef}
        className="rounded-none border-x-0 border-b-0 shrink-0 transition-transform duration-150"
      >
        <div className="p-3 md:p-4">
          {/* Disabled reason banner */}
          {disabled && disabledReason && (
            <Alert variant="default" className="mb-2 md:mb-3 bg-muted/50">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm md:text-base">{disabledReason}</AlertDescription>
            </Alert>
          )}

          {/* Staged Attachments Preview - WhatsApp-like staging area */}
          {stagedFiles.length > 0 && (
            <div className="mb-3 p-2 bg-muted/30 rounded-lg border border-border/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground font-medium">
                  {stagedFiles.length} attachment{stagedFiles.length !== 1 ? 's' : ''} staged
                  {!canAddMoreAttachments && ' (max reached)'}
                </span>
                {isUploading && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Uploading...
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {stagedFiles.map((stagedFile) => (
                  <div
                    key={stagedFile.id}
                    className="relative group flex items-center gap-2 bg-background rounded-md border border-border p-1.5 pr-7 max-w-[200px]"
                  >
                    {/* Preview thumbnail or file icon */}
                    {stagedFile.isImage && stagedFile.previewUrl ? (
                      <img
                        src={stagedFile.previewUrl}
                        alt={stagedFile.file.name}
                        className="h-10 w-10 object-cover rounded"
                      />
                    ) : (
                      <div className="h-10 w-10 flex items-center justify-center bg-muted rounded">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}

                    {/* File info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" title={stagedFile.file.name}>
                        {stagedFile.file.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatFileSize(stagedFile.file.size)}
                      </p>
                    </div>

                    {/* Remove button */}
                    <button
                      type="button"
                      onClick={() => removeStagedFile(stagedFile.id)}
                      disabled={isUploading}
                      className={cn(
                        "absolute top-1 right-1 h-5 w-5 rounded-full flex items-center justify-center",
                        "bg-destructive/90 text-destructive-foreground hover:bg-destructive",
                        "opacity-0 group-hover:opacity-100 transition-opacity",
                        "focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-destructive",
                        isUploading && "cursor-not-allowed opacity-50"
                      )}
                      aria-label={`Remove ${stagedFile.file.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unified responsive layout using CSS Grid */}
          <div className="grid gap-2 grid-cols-[auto_1fr_auto] md:grid-cols-[1fr_auto] md:grid-rows-2 items-end md:items-center">
            {/* Attachment button - mobile: left, desktop: bottom-right */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-10 w-10 min-w-[40px] shrink-0 md:h-8 md:px-4 md:w-auto md:col-start-2 md:row-start-2 md:border md:border-border md:bg-background",
                    !canAddMoreAttachments && "opacity-50"
                  )}
                  onClick={handleAttachmentClick}
                  disabled={disabled || isUploading || !canAddMoreAttachments}
                >
                  <Paperclip className="h-5 w-5 md:h-4 md:w-4 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {canAddMoreAttachments
                  ? `Attach file (${remainingSlots} remaining)`
                  : `Maximum ${MAX_ATTACHMENTS} attachments reached`}
              </TooltipContent>
            </Tooltip>

            {/* Textarea - mobile: center, desktop: full left column */}
            <Textarea
              ref={textareaRef}
              placeholder="Type a message..."
              className="min-h-[40px] max-h-[100px] md:min-h-[72px] md:max-h-[72px] resize-none py-2 text-base md:text-sm md:col-start-1 md:row-span-2 md:self-stretch"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              rows={1}
              disabled={disabled || isUploading}
            />

            {/* Send button - mobile: right, desktop: top-right */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  className="h-10 w-10 min-w-[40px] shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground md:h-8 md:px-4 md:w-auto md:col-start-2 md:row-start-1 touch-manipulation"
                  onClick={handleSubmit}
                  disabled={!canSend}
                >
                  {isUploading ? (
                    <Loader2 className="h-5 w-5 md:h-4 md:w-4 animate-spin" />
                  ) : (
                    <Send className="h-5 w-5 md:h-4 md:w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isUploading ? 'Uploading...' : 'Send message (Enter)'}
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileChange}
            accept="image/*,.pdf,.doc,.docx,.txt,.log"
            disabled={isUploading}
          />
        </div>
      </Card>
    </>
  );
}
