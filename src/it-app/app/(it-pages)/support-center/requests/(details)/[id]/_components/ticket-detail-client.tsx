'use client';

import { useEffect, useRef, useMemo, useState, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useRequestDetail } from '../_context/request-detail-context';
import { useRemoteAccess } from '../_context/remote-access-context';
import {
  TicketNavigation,
  TicketMetadataSidebar,
  TicketMessages,
  TicketReplySection,
  UserInfoSidebar,
} from './index';
import { ScreenshotCounter } from './screenshot-counter';
import { RemoteAccessActions } from './remote-access-actions';
import { ViewModeToggle } from './view-mode-toggle';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { InlineConnectionStatusAlert } from '@/components/ui/connection-status-alert';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { MediaViewer } from '@/components/ui/media-viewer';
import { DEFAULT_STATUS } from '@/components/ui/status-badge';
import { useViewport } from '@/hooks/use-mobile';
import { useSwipeBack } from '@/hooks/use-swipe-gesture';
import { cn } from '@/lib/utils';
import type { MessageData, UserData } from '@/types/ticket-detail';

// Dynamic import for inline remote session (avoid SSR issues with WebRTC)
const InlineRemoteSession = dynamic(
  () => import('./inline-remote-session').then(mod => ({ default: mod.InlineRemoteSession })),
  { ssr: false }
);

/**
 * Get initials from a name
 */
function getInitials(name: string): string {
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

export function TicketDetailClient() {
  const router = useRouter();

  // Viewport state
  const { isMobile } = useViewport();

  // Mobile sheet states
  const [showMetadataSheet, setShowMetadataSheet] = useState(false);
  const [showUserInfoSheet, setShowUserInfoSheet] = useState(false);

  // Remote access view mode
  const { viewMode, sessionStatus } = useRemoteAccess();
  const isRemoteViewActive = viewMode === 'remote' && sessionStatus === 'active';

  // Client-only mounting to avoid hydration mismatch
  const [isRemoteSessionMounted, setIsRemoteSessionMounted] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  // Swipe-back gesture for mobile navigation
  const { state: swipeState, bind: bindSwipe } = useSwipeBack({
    onBack: () => {
      // Set flag so the requests list knows to refresh data
      sessionStorage.setItem('returning-from-details', 'true');
      router.back();
    },
    enabled: isMobile,
  });

  // Use context for all data and functionality
  const {
    ticket,
    technicians,
    priorities,
    messages,
    messagesLoading,
    sendMessage,
    sendAttachmentMessage,
    retryMessage,
    uploadAttachments,
    sendingMessage,
    uploadingAttachment,
    isSignalRConnected,
    connectionAlertLevel, // Progressive connection alerts with grace period
    currentUserId, // ← From server-side, no client-side fetch needed
    chatNeedsReload,
    dismissReloadWarning,
    messagingPermission, // **NEW: Messaging permission data**
    isChatDisabled, // **NEW: Status-based chat disable**
    chatDisabledReason, // **NEW: Reason for chat being disabled**
    mediaViewerOpen,
    mediaViewerIndex,
    screenshots,
    closeMediaViewer,
    navigateMediaViewer,
    setMediaViewerIndex,
  } = useRequestDetail();

  // Track if we've shown the reload toast to avoid duplicates
  const hasShownReloadToast = useRef(false);

  // Show toast notification when chat needs reload
  useEffect(() => {
    if (chatNeedsReload && !hasShownReloadToast.current) {
      hasShownReloadToast.current = true;

      toast.warning('Some messages may be missing', {
        description: 'Please reload the page to sync all messages.',
        duration: Infinity, // Don't auto-dismiss
        action: {
          label: 'Reload',
          onClick: () => window.location.reload(),
        },
        onDismiss: () => {
          dismissReloadWarning();
          hasShownReloadToast.current = false;
        },
      });
    } else if (!chatNeedsReload) {
      hasShownReloadToast.current = false;
    }
  }, [chatNeedsReload, dismissReloadWarning]);

  // Mount remote session component only on client side (after hydration)
  useEffect(() => {
    startTransition(() => {
      setIsRemoteSessionMounted(true);
      setIsHydrated(true);
    });
  }, []);

  // Build user data from requester info with defensive fallback
  const requester = useMemo(() => ticket.requester ?? {
    id: 0,
    username: 'Unknown user',
    fullName: 'Unknown user',
    email: '',
    phoneNumber: '',
    title: '',
    office: '',
    managerId: null,
    managerName: '',
  }, [ticket.requester]);

  const displayName = requester.fullName || requester.username;

  const userData: UserData = {
    name: displayName,
    initials: getInitials(displayName),
    email: requester.email || '',
    title: requester.title || '',
    directManager: requester.managerName || '',
    office: requester.office || '',
    phoneNumber: requester.phoneNumber || '',
  };

  // Format messages for display
  // Chat positioning determined server-side - no layout shifts!
  const formattedMessages: MessageData[] = useMemo(() => {
    return messages.map((msg) => {
      // Check if this is a system message (no sender)
      const isSystemMessage = !msg.senderId || msg.senderId === null;

      // Use sender information from WebSocket message
      const isFromRequester = msg.senderId === ticket.requesterId;
      const isCurrentUserMsg = currentUserId ? msg.senderId === currentUserId : false;

      // For system messages, extract only English text (format: "EN|AR")
      // System messages always show English regardless of UI language
      let messageContent = msg.content;
      if (isSystemMessage && msg.content.includes('|')) {
        messageContent = msg.content.split('|')[0]; // Take English part only
      }

      // Get sender name from message sender info or fallback to requester
      let senderName: string;
      if (isSystemMessage) {
        // System messages (status changes, assignments, etc.)
        senderName = 'System';
      } else if (msg.sender) {
        // Use sender info from backend (includes full name)
        senderName = msg.sender.fullName || msg.sender.username || 'Unknown';
      } else if (isFromRequester) {
        // Fallback: use requester info from ticket (using defensive requester variable)
        senderName = requester.fullName || requester.username;
      } else {
        // Try to find technician in the list (with defensive array check)
        const technicianSender = Array.isArray(technicians)
          ? technicians.find(t => t.id === msg.senderId)
          : undefined;
        if (technicianSender) {
          senderName = technicianSender.fullName || technicianSender.username;
        } else {
          // Final fallback: show a generic name with sender ID for debugging
          senderName = `Support Agent`;
        }
      }

      return {
        id: msg.id,
        author: senderName,
        authorInitials: getInitials(senderName),
        timestamp: msg.createdAt, // Pass raw ISO string - formatting moved to child component for hydration safety
        content: messageContent,
        isCurrentUser: isCurrentUserMsg,
        isScreenshot: msg.isScreenshot,
        screenshotFileName: msg.screenshotFileName,
        fileName: msg.fileName,
        fileSize: msg.fileSize,
        fileMimeType: msg.fileMimeType,
        status: msg.status,
        tempId: msg.tempId,
        createdAt: msg.createdAt, // For stuck message detection
      };
    });
  }, [messages, currentUserId, ticket.requesterId, requester, technicians]);

  /**
   * Handle reply submission with optional staged attachments
   * Implements WhatsApp-like flow: upload attachments first then send text message
   * Note: uploadAttachments handles creating messages for each uploaded file internally
   */
  const handleReplySubmit = async (replyText: string, attachments?: File[]) => {
    if (sendingMessage || uploadingAttachment) return;

    try {
      // If there are attachments, upload them first
      if (attachments && attachments.length > 0) {
        try {
          await uploadAttachments(attachments);
          // Messages are created internally by the context provider
        } catch (err: any) {
          console.error('Failed to upload attachments:', err);

          // Handle screenshot limit error with user-friendly message
          if (err?.detail?.error === 'screenshot_limit_reached') {
            const { current_count, max_limit } = err.detail;
            toast.error(`Screenshot limit reached (${current_count}/${max_limit})`, {
              description: `You can upload up to ${max_limit} screenshots per request.`,
            });
            return;
          }

          // Generic error - don't send message if upload fails
          toast.error('Failed to upload attachments', {
            description: 'Please try again.',
          });
          return;
        }
      }

      // Send text message if there's content
      if (replyText.trim()) {
        await sendMessage(replyText);
      }
    } catch (err) {
      console.error('Failed to send reply:', err);
    }
  };

  // Generate ticket number from UUID (use first 8 chars as hex)
  const ticketNumber = parseInt(ticket.id.replace(/-/g, '').substring(0, 8), 16);

  // Calculate swipe visual feedback styles
  const swipeStyles = isHydrated && isMobile && swipeState.isSwiping ? {
    transform: `translateX(${Math.min(swipeState.translation.x, 100)}px)`,
    opacity: 1 - (swipeState.progress * 0.3),
  } : {};

  return (
    <>
      <div
        className={cn("absolute inset-0 flex flex-col bg-background", isHydrated && isMobile && "transition-transform")}
        {...(isHydrated && isMobile ? bindSwipe() : {})}
        style={swipeStyles}
      >
        {/* Top Navigation Bar - SSR-safe responsive design */}
        <TicketNavigation
          status={ticket.status || DEFAULT_STATUS}
          title={ticket.title}
          ticketNumber={ticketNumber}
          onOpenMetadata={() => setShowMetadataSheet(true)}
          onOpenUserInfo={() => setShowUserInfoSheet(true)}
        />

        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar - Ticket Metadata (hidden on mobile) */}
          {(!isHydrated || !isMobile) && <TicketMetadataSidebar />}

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* View Mode Toggle + Remote Access Actions */}
            <div className="px-3 sm:px-4 pt-2 pb-1 flex items-center gap-2 flex-wrap" suppressHydrationWarning>
              {/* Show ViewModeToggle when session is active, otherwise show RemoteAccessActions */}
              {sessionStatus === 'active' ? (
                <ViewModeToggle />
              ) : (
                <RemoteAccessActions
                  requesterId={ticket.requesterId}
                  disabled={isChatDisabled || !messagingPermission.canMessage}
                />
              )}

              {/* Screenshot Counter - only in chat view */}
              {!isRemoteViewActive && (
                <div className="ml-auto">
                  <ScreenshotCounter messages={messages} />
                </div>
              )}
            </div>

            {/* Connection status indicator - Progressive alerts with grace period (chat view only) */}
            {!isChatDisabled && !isRemoteViewActive && <InlineConnectionStatusAlert alertLevel={connectionAlertLevel} />}

            {/* Remote Access Inline View - Keep mounted to preserve WebRTC connection when switching tabs */}
            {isRemoteSessionMounted && sessionStatus === 'active' && (
              <div className={cn(
                'flex-1',
                !isRemoteViewActive && 'hidden'
              )}>
                <InlineRemoteSession className="h-full" />
              </div>
            )}

            {/* Chat View - hidden but kept in DOM when remote is active to preserve state */}
            <div className={cn(
              'flex-1 flex flex-col overflow-hidden',
              isRemoteViewActive && 'hidden'
            )}>
              {/* Messages */}
              <TicketMessages
                messages={formattedMessages}
                isLoading={messagesLoading}
                onRetryMessage={retryMessage}
              />

              {/* Reply Section - disabled for solved tickets or when user doesn't have permission */}
              {/* SSR-safe: messagingPermission now uses SSR-provided currentUserIsTechnician */}
              <div>
                {isChatDisabled ? (
                  <>
                    <Separator />
                    <div className="px-3 sm:px-4 py-3">
                      <Alert variant="default">
                        <AlertDescription className="text-sm text-muted-foreground">
                          {chatDisabledReason}
                        </AlertDescription>
                      </Alert>
                    </div>
                  </>
                ) : !messagingPermission.canMessage ? (
                  <>
                    <Separator />
                    <div className="px-3 sm:px-4 py-3">
                      <Alert variant="default">
                        <AlertDescription className="text-sm text-muted-foreground">
                          {messagingPermission.reason || 'You do not have permission to send messages on this request.'}
                        </AlertDescription>
                      </Alert>
                    </div>
                  </>
                ) : (
                  <TicketReplySection
                    recipientName={userData.name}
                    recipientInitials={userData.initials}
                    onSubmit={handleReplySubmit}
                    disabled={sendingMessage}
                    isUploading={uploadingAttachment}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Right Sidebar - User Info (hidden on mobile) */}
          {(!isHydrated || !isMobile) && <UserInfoSidebar />}
        </div>
      </div>

      {/* Mobile: Metadata Sheet - Ticket Details button */}
      {isHydrated && isMobile && (
        <Sheet open={showMetadataSheet} onOpenChange={setShowMetadataSheet}>
          <SheetContent side="left" className="w-[85vw] max-w-[360px] p-0 overflow-hidden flex flex-col gap-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Ticket Details</SheetTitle>
              <SheetDescription>View and edit ticket metadata</SheetDescription>
            </SheetHeader>
            <TicketMetadataSidebar />
          </SheetContent>
        </Sheet>
      )}

      {/* Mobile: User Info Sheet - Requester Info button */}
      {isHydrated && isMobile && (
        <Sheet open={showUserInfoSheet} onOpenChange={setShowUserInfoSheet}>
          <SheetContent side="right" className="w-[85vw] max-w-[360px] p-0 overflow-hidden flex flex-col gap-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Requester Info</SheetTitle>
              <SheetDescription>View requester details and notes</SheetDescription>
            </SheetHeader>
            <UserInfoSidebar />
          </SheetContent>
        </Sheet>
      )}

      {/* Media Viewer Portal */}
      <MediaViewer
        screenshots={screenshots}
        initialIndex={mediaViewerIndex}
        isOpen={mediaViewerOpen}
        onClose={closeMediaViewer}
        onNavigate={navigateMediaViewer}
        onIndexChange={setMediaViewerIndex}
      />
    </>
  );
}
