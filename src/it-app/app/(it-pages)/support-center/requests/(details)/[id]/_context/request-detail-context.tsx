'use client';

/**
 * Request Detail Provider
 * Provides centralized data and actions for the request details page
 *
 * Features:
 * - **WebSocket for Real-time Messaging**: Chat messages only, no metadata enrichment
 * - **Server-Side Rendering**: Initial data fetched on page load (technicians, priorities, statuses, notes, assignees, messages)
 * - Uses simple state hooks with optimistic updates (notes, assignees, status, priority)
 * - Real-time chat messages with sequence-based gap detection
 * - Implements messaging permissions (assignee only)
 * - Clean separation: WebSocket = messaging, REST API = data & mutations
 *
 * Architecture: SSR (initial load) → WebSocket (real-time messages) → State hooks (mutations) → REST API (persistence)
 */

import { createContext, useContext, useMemo, useCallback, useState, useRef, useEffect } from 'react';
import { mutate } from 'swr';
import { useSignalRChatRoom, useSignalR, useConnectionStatus } from '@/lib/signalr';
import { useRequestNotes } from '@/lib/hooks/use-request-notes';
import { useRequestAssignees, type Assignee } from '@/lib/hooks/use-request-assignees';
import { useTechnicians } from '@/lib/hooks/use-technicians';
import { useGlobalPriorities, useGlobalStatuses, useGlobalTechnicians } from '@/lib/hooks/use-global-metadata';
import { useRequestTicket } from '@/lib/hooks/use-request-ticket';
import { useChatMutations } from '@/lib/hooks/use-chat-mutations';
import { checkMessagingPermission } from '@/lib/utils/messaging-permissions';
// Cache integration
import { MessageCache } from '@/lib/cache/message-cache';
import { SyncEngine } from '@/lib/cache/sync-engine';
import { rebuildCacheIfIncompatible } from '@/lib/cache/db';
import { getMessagesWithHeaders } from '@/lib/api/chat-cache';
import type { CachedMessage } from '@/lib/cache/schemas';

// **LOCAL AUTH HELPER** - Workaround for import issues
// Returns null during SSR and initial hydration to prevent mismatch
function getSessionFromCookie() {
  try {
    const userData = document.cookie
      .split(';')
      .map(c => c.trim())
      .find(c => c.startsWith('user_data='))
      ?.split('=')[1];

    if (!userData) {
      return null;
    }

    const user = JSON.parse(decodeURIComponent(userData));
    return {
      isAuthenticated: true,
      user,
      sessionId: null,
      accessToken: null,
    };
  } catch (error) {
    console.error('Error parsing session:', error);
    return null;
  }
}

/**
 * Generate initials from a name (e.g., "John Doe" -> "JD")
 */
function getInitials(name: string | null | undefined): string {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

/**
 * Validate and normalize ticket data structure.
 * Ensures status/priority/requester objects exist (defensive programming).
 *
 * Handles cases where data might come from different sources:
 * - WebSocket (flat structure before transformation)
 * - SSR (nested structure from API)
 * - SWR cache (nested structure)
 */
function validateTicketData(ticket: any): ServiceRequestDetail {
  // If status is missing but statusId exists, create minimal status object
  // IMPORTANT: Include countAsSolved to prevent race condition where inputs
  // flash as enabled before status data loads
  if (!ticket.status && ticket.statusId != null) {
    ticket.status = {
      id: ticket.statusId,
      name: (ticket as any).statusName || 'Unknown',
      color: null,
      countAsSolved: (ticket as any).statusCountAsSolved ?? false,
    };
  }

  // If priority is missing but priorityId exists, create minimal priority object
  if (!ticket.priority && ticket.priorityId != null) {
    ticket.priority = {
      id: ticket.priorityId,
      name: (ticket as any).priorityName || 'Unknown',
      responseTimeMinutes: 0,
      resolutionTimeHours: 0,
    };
  }

  // If requester is missing, create minimal requester object
  if (!ticket.requester && ticket.requesterId) {
    ticket.requester = {
      id: ticket.requesterId,
      username: (ticket as any).requesterName || 'Unknown',
      fullName: (ticket as any).requesterName || null,
      email: null,
      phoneNumber: null,
      title: null,
      office: null,
      managerId: null,
      managerName: null,
    };
  }

  return ticket;
}

// Import types from centralized location
import type { RequestDetailsContextType } from '@/types/requests-details';
import type { ServiceRequestDetail } from '@/types/ticket-detail';
import type { Technician, Priority, RequestNote, RequestStatus } from '@/types/metadata';
import type { ChatMessage, TaskStatusChangedEvent } from '@/lib/signalr/types';
import type { SubTask, SubTaskStats } from '@/types/sub-task';
import type { ScreenshotItem } from '@/types/media-viewer';
import type { Category } from '@/lib/hooks/use-categories-tags';

// API functions have been moved to individual hooks:
// - useChatMutations: sendMessage, uploadAttachments
// - useRequestTicket: updateStatus, updatePriority

const RequestDetailContext = createContext<RequestDetailsContextType | undefined>(undefined);

interface RequestDetailProviderProps {
  children: React.ReactNode;
  ticket: ServiceRequestDetail;
  technicians: Technician[];
  priorities: Priority[];
  statuses: RequestStatus[];
  categories: Category[];  // SSR categories data for dropdown
  notes: RequestNote[];
  assignees: Assignee[];
  initialMessages: ChatMessage[];
  currentUserId?: string; // UUID from backend
  currentUserIsTechnician?: boolean; // From SSR cookie data for messaging permissions
  subTasks?: {
    items: SubTask[];
    total: number;
    stats: SubTaskStats;
  };
}

export function RequestDetailProvider({
  children,
  ticket: initialTicket,
  technicians: initialTechnicians,
  priorities,
  statuses,
  categories: initialCategories,
  notes: initialNotes,
  assignees: initialAssignees,
  initialMessages,
  currentUserId,
  currentUserIsTechnician, // From SSR - reliable for messaging permissions
  subTasks: initialSubTasks,
}: RequestDetailProviderProps) {
  // **SESSION STATE** - Hydration-safe: null initially, populated in useEffect
  // This prevents server/client mismatch since both render with null first
  const [session, setSession] = useState<{
    isAuthenticated: boolean;
    user: any;
    sessionId: string | null;
    accessToken: string | null;
  } | null>(null);

  // Load session from cookie after mount (client-side only)
  useEffect(() => {
    const sessionData = getSessionFromCookie();
    setSession(sessionData ?? {
      isAuthenticated: false,
      user: null,
      sessionId: null,
      accessToken: null,
    });
  }, []);

  // **CACHE INTEGRATION**
  // Cache state for WhatsApp-style local sync
  const [cacheInitialized, setCacheInitialized] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const cacheRef = useRef<{ cache: MessageCache | null; syncEngine: SyncEngine | null }>({
    cache: null,
    syncEngine: null,
  });

  // Initialize cache on mount (after we have currentUserId)
  useEffect(() => {
    if (!currentUserId) return;

    const initCache = async () => {
      try {
        console.log('[Cache] Initializing for user:', currentUserId);

        // T057: Check schema version and rebuild if incompatible
        const wasRebuilt = await rebuildCacheIfIncompatible(currentUserId);
        if (wasRebuilt) {
          console.log('[Cache] Database was rebuilt due to schema version mismatch');
        }

        // Create cache instance
        const cache = new MessageCache(currentUserId);

        // T057, T059: Perform startup maintenance (cleanup expired cache, log stats)
        const maintenanceResult = await cache.performStartupMaintenance();
        if (maintenanceResult.expiredMessagesRemoved > 0) {
          console.log(
            `[Cache] Startup maintenance: removed ${maintenanceResult.expiredMessagesRemoved} expired messages`
          );
        }

        // Create sync engine with fetch function
        const syncEngine = new SyncEngine(cache, async (requestId, params) => {
          // Fetch messages from backend via Next.js API route
          const response = await getMessagesWithHeaders(requestId, params);
          return response.data;
        });

        // Store refs
        cacheRef.current = { cache, syncEngine };

        // Load cached messages immediately (synchronously from IndexedDB)
        const cached = await cache.getCachedMessages(initialTicket.id);
        console.log('[Cache] Loaded', cached.length, 'cached messages');

        setCacheInitialized(true);
      } catch (error) {
        console.error('[Cache] Initialization failed:', error);
        setSyncError(error instanceof Error ? error.message : 'Cache initialization failed');
      }
    };

    initCache();

    // Cleanup on unmount
    return () => {
      cacheRef.current = { cache: null, syncEngine: null };
    };
  }, [currentUserId, initialTicket.id]);

  // **DELTA SYNC** - Run after cache initialization
  // Triggers background sync to fetch new messages since last checkpoint
  useEffect(() => {
    if (!cacheInitialized || !cacheRef.current.syncEngine) return;
    if (!initialTicket?.id) return;

    const syncEngine = cacheRef.current.syncEngine;

    const runDeltaSync = async () => {
      try {
        console.log('[Cache] Starting delta sync for request:', initialTicket.id);
        setIsSyncing(true);
        setSyncError(null);

        const result = await syncEngine.syncChat(initialTicket.id);

        if (result.success) {
          console.log(
            '[Cache] Delta sync complete:',
            result.messagesAdded,
            'new messages,',
            result.gapsDetected,
            'gaps detected'
          );

          // If new messages were added, we could trigger a refresh here
          // For now, SignalR will handle new messages in real-time
        } else {
          console.error('[Cache] Delta sync failed:', result.error);
          setSyncError(result.error || 'Sync failed');
        }
      } catch (error) {
        console.error('[Cache] Delta sync error:', error);
        setSyncError(error instanceof Error ? error.message : 'Sync error');
      } finally {
        setIsSyncing(false);
      }
    };

    runDeltaSync();
  }, [cacheInitialized, initialTicket?.id]);

  // **CLIENT-SIDE MARK-AS-READ FALLBACK**
  // SSR mark-as-read can fail silently. This ensures messages are marked as read
  // even if the SSR call failed (e.g., token expired, network timeout).
  useEffect(() => {
    // Skip if no ticket data or ticket is solved (no need to mark read)
    if (!initialTicket?.id || initialTicket.status?.countAsSolved) return;

    const abortController = new AbortController();

    const markReadOnMount = async () => {
      try {
        await fetch(`/api/chat/${initialTicket.id}/mark-read`, {
          method: 'POST',
          credentials: 'include',
          signal: abortController.signal,
        });
      } catch (error) {
        // Ignore abort errors (happens when navigating away quickly)
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        // Silent failure - user will see updated state on next refresh
      }
    };

    markReadOnMount();

    // Cleanup: abort the fetch if component unmounts
    return () => {
      abortController.abort();
    };
  }, [initialTicket?.id, initialTicket?.status?.countAsSolved]);

  const currentUser = useMemo(() => {
    return session?.isAuthenticated && session?.user ? {
      id: session.user.id,
      username: session.user.username,
      // Handle both camelCase (fullName) and snake_case (full_name) from backend
      fullName: session.user.fullName || (session.user as any).full_name || null,
      title: session.user.title,
      email: session.user.email || null,
      isTechnician: session.user.isTechnician || false,
      userRoles: session.user.userRoles || [],
    } : undefined;
  }, [session]);

  // **WEBSOCKET REQUEST DETAILS** - Load all data via WebSocket for < 2s page load
  // Replaces 7 REST API calls with single WebSocket connection
  const handleRequestDetailsInit = useCallback((state: any) => {
    // WebSocket successfully loaded initial data
  }, []);

  const handleRequestDetailsError = useCallback((error: string) => {
    console.error('❌ Request details WebSocket error:', error);
  }, []);


  // **ERROR HANDLERS** - Memoized to prevent unnecessary re-renders
  const handleTicketError = useCallback((error: Error) => {
    console.error('❌ Ticket update error:', error);
  }, []);

  const handleAssigneeError = useCallback((error: Error) => {
    console.error('❌ Assignee operation error:', error);
  }, []);

  // **GLOBAL METADATA CACHE**
  // Pass SSR data as initialData to prevent race condition on first render
  // This ensures statuses/priorities/technicians are available immediately
  // without waiting for client-side revalidation
  const { technicians: techniciansData } = useGlobalTechnicians(initialTechnicians);
  const { priorities: prioritiesData } = useGlobalPriorities(priorities);
  const { statuses: statusesData } = useGlobalStatuses(statuses);

  const { getTechnicianById: getTechnicianByIdRaw } = useTechnicians(techniciansData);

  // Wrapper to convert Technician to TechnicianInfo
  const getTechnicianById = useCallback((userId: string) => {
    const tech = getTechnicianByIdRaw(userId);
    if (!tech) return undefined;
    return {
      ...tech,
      id: String(tech.id),  // Keep as string (UUID)
    } as any;
  }, [getTechnicianByIdRaw]);

  // **TICKET MUTATIONS**
  // Handles status and priority updates with optimistic updates and rollback
  // MOVED BEFORE useChatWebSocket so mutateTicket is available for handleTaskStatusChanged
  const {
    ticket,
    isUpdating: updatingTicket,
    isUpdatingStatus,
    isUpdatingPriority,
    updateStatus: updateTicketStatus,
    updatePriority: updateTicketPriority,
    mutate: mutateTicket,
  } = useRequestTicket({
    requestId: initialTicket.id,
    initialData: initialTicket, // Use SSR data
    priorities: prioritiesData,
    statuses: statusesData,
    onError: handleTicketError,
  });

  // CRITICAL FIX: Use refs to access current values in WebSocket callbacks
  // This prevents callback recreation which would cause WebSocket disconnections
  const mutateTicketRef = useRef(mutateTicket);
  const statusesDataRef = useRef(statusesData);

  // **SCROLL HANDLER REGISTRATION**
  // TicketMessages component registers its scroll handler here after mounting
  // This allows WebSocket to trigger scroll immediately when message arrives
  const scrollHandlerRef = useRef<(() => void) | null>(null);
  const forceScrollHandlerRef = useRef<(() => void) | null>(null);

  const registerScrollHandler = useCallback((handler: (() => void) | null) => {
    scrollHandlerRef.current = handler;
    console.log('[Context] Scroll handler', handler ? 'registered' : 'unregistered');
  }, []);

  const registerForceScrollHandler = useCallback((handler: (() => void) | null) => {
    forceScrollHandlerRef.current = handler;
    console.log('[Context] Force scroll handler', handler ? 'registered' : 'unregistered');
  }, []);

  // Keep refs in sync with current values
  useEffect(() => {
    mutateTicketRef.current = mutateTicket;
  }, [mutateTicket]);

  useEffect(() => {
    statusesDataRef.current = statusesData;
  }, [statusesData]);

  // **WEBSOCKET CALLBACKS** - Memoized to prevent unnecessary reconnections
  const handleNewMessage = useCallback((message: any) => {
    // New message received
  }, []);

  const handleReadStatusUpdate = useCallback((data: any) => {
    // Read status update is now handled in signalr-context.tsx
    // This callback is for any additional side effects needed at the page level
    console.log('[RequestDetail] ReadStatusUpdate received:', data);
  }, []);

  // Memoized callback for onNewMessage to prevent infinite re-subscription loops
  // This callback triggers scroll when new messages arrive
  const handleNewMessageWithScroll = useCallback((message: any) => {
    handleNewMessage(message);
    // Trigger scroll for new messages
    scrollHandlerRef.current?.();
  }, [handleNewMessage]);

  const handleConnect = useCallback(() => {
    // WebSocket connected
  }, []);

  const handleDisconnect = useCallback(() => {
    // WebSocket disconnected
  }, []);

  const handleError = useCallback((error: string | Error) => {
    console.error('❌ Chat WebSocket error:', error);
  }, []);

  const handleGapDetected = useCallback((expected: number, received: number) => {
    console.error(`⚠️ Sequence gap detected! Expected ${expected}, got ${received}`);
  }, []);

  // CRITICAL FIX: Use refs to access current values to keep callback stable
  // Unstable callbacks cause WebSocket disconnections due to dependency chain:
  // handleTaskStatusChanged → handleMessage → connect → useEffect cleanup
  const handleTaskStatusChanged = useCallback(async (event: TaskStatusChangedEvent) => {
    // Use refs to access current values (prevents callback recreation)
    const mutate = mutateTicketRef.current;
    const statuses = statusesDataRef.current;

    // Immediately update ticket status from WebSocket event (no API call needed)
    // This ensures chat input disables instantly without waiting for server round-trip
    await mutate((prevTicket) => {
      if (!prevTicket) return prevTicket;

      // Find the status from statuses array for full status object (with defensive array check)
      const newStatus = Array.isArray(statuses)
        ? statuses.find((s) => s.id === event.data.statusId)
        : undefined;

      return {
        ...prevTicket,
        statusId: event.data.statusId,
        status: newStatus ? {
          id: newStatus.id,
          name: newStatus.name,
          nameEn: newStatus.nameEn,
          nameAr: newStatus.nameAr,
          color: newStatus.color,
          countAsSolved: event.data.countAsSolved, // Use WebSocket value (authoritative)
        } : {
          ...prevTicket.status,
          id: event.data.statusId,
          countAsSolved: event.data.countAsSolved,
        },
      };
    }, { revalidate: false }); // Don't revalidate - WebSocket data is authoritative
  }, []); // Empty deps - uses refs for current values

  // Use the SWR-managed ticket or fall back to SSR data
  // Validate and normalize to ensure nested objects exist
  const ticketData = validateTicketData(ticket ?? initialTicket);

  // **SIGNALR FOR REAL-TIME CHAT**
  // Uses SignalR hub connection for real-time messaging
  // Data (notes, assignees, metadata) comes from SSR + SWR mutations
  // Disable SignalR for solved tickets (no live updates needed)
  const {
    isConnected: isSignalRConnected,
    isLoading: messagesLoading,
    messages,
    error: signalRError,
    sendMessage: sendChatMessageSignalR,
    updateMessageStatus,
    sendTypingIndicator,
    markAsRead,
  } = useSignalRChatRoom(initialTicket.id, {
    enabled: ticketData.status?.countAsSolved !== true, // Skip SignalR for solved tickets
    initialMessages,
    onNewMessage: handleNewMessageWithScroll,
    onReadStatusUpdate: handleReadStatusUpdate,
    onTaskStatusChanged: handleTaskStatusChanged,
  });

  // Wrapper for sendMessage to match previous API
  // Also triggers force scroll after optimistic message is added
  const sendChatMessage = useCallback((content: string) => {
    const tempId = sendChatMessageSignalR(content, currentUser ? {
      id: currentUser.id,
      username: currentUser.username,
      fullName: currentUser.fullName,
      email: currentUser.email,
    } : undefined);

    // CRITICAL: Trigger force scroll after optimistic message is added
    // Use double RAF to ensure React has reconciled the new message
    if (tempId) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          forceScrollHandlerRef.current?.();
        });
      });
    }

    return tempId;
  }, [sendChatMessageSignalR, currentUser]);

  // Chat needs reload state (based on SignalR error)
  const chatNeedsReload = !!signalRError;

  // Dismiss reload warning - SignalR will auto-reconnect
  const dismissReloadWarning = useCallback(() => {
    // No-op: SignalR handles reconnection automatically
  }, []);

  // **CONNECTION STATUS WITH GRACE PERIOD**
  // Implements progressive alerts to avoid false "Connection Lost" during normal page load
  // - No alert during initial connection (grace period)
  // - Progressive alerts: none → info → warning → error
  const { alertLevel: connectionAlertLevel } = useConnectionStatus({
    isConnected: isSignalRConnected,
    gracePeriod: 5000,      // 5s before showing any alert
    warningPeriod: 15000,   // 15s before showing warning
    errorPeriod: 30000,     // 30s before showing error
    initialLoadGrace: 8000, // 8s extra grace for initial page load
  });

  // NOTE: Chat is marked as read during SSR in getRequestDetailsPageData()
  // This happens BEFORE the page renders, so the list is already updated

  // **NOTES (SWR for background refresh)**
  // Use SSR data for initial notes
  const {
    notes,
    isLoading: notesLoading,
    addNote,
  } = useRequestNotes(ticketData.id, initialNotes);

  // Callback to refresh ticket data when assignee is added
  // Backend automatically updates status from "Open" to "In Progress" when assignee added
  const handleAssigneeAdded = useCallback(async () => {
    // Refresh ticket to get updated status (backend sets status_id=8 when assignee added to Open ticket)
    await mutateTicket();

    // Invalidate list page caches to ensure sidebar counts, business unit cards, and tickets table update immediately
    // This ensures that when a ticket moves from "unassigned" to "assigned", all views reflect the change
    await Promise.all([
      // Invalidate all technician views (tickets table) - matches any view/page/perPage/businessUnitIds combination
      mutate((key) => typeof key === 'string' && key.startsWith('/api/requests/technician-views')),
      // Invalidate view counts (sidebar counts)
      mutate('/api/requests/view-counts'),
      // Invalidate business unit counts (cards) - matches all views
      mutate((key) => typeof key === 'string' && key.startsWith('/api/requests/business-unit-counts')),
    ]);
  }, [mutateTicket]);

  // Callback to refresh ticket data and list page caches when assignee is removed
  const handleAssigneeRemoved = useCallback(async () => {
    // Refresh ticket to get updated status
    await mutateTicket();

    // Invalidate list page caches to ensure counts update immediately
    await Promise.all([
      mutate((key) => typeof key === 'string' && key.startsWith('/api/requests/technician-views')),
      mutate('/api/requests/view-counts'),
      mutate((key) => typeof key === 'string' && key.startsWith('/api/requests/business-unit-counts')),
    ]);
  }, [mutateTicket]);

  // **ASSIGNEES**
  // Use SSR data for initial assignees
  const {
    assignees,
    isLoading: assigneesLoading,
    addAssignee: addAssigneeRaw,
    removeAssignee: removeAssigneeRaw,
    takeRequest: takeRequestSWR,
    canEditAssignees, // @deprecated - use canAddAssignees/canRemoveAssignees
    canAddAssignees,
    canRemoveAssignees,
    canTakeRequest,
  } = useRequestAssignees(ticketData.id, initialAssignees, {
    getTechnicianById,
    onError: handleAssigneeError,
    onAssigneeAdded: handleAssigneeAdded,
    onAssigneeRemoved: handleAssigneeRemoved,
    currentUserId,
    currentUserRoles: currentUser?.userRoles,
    isTechnician: currentUser?.isTechnician,
    // NF-3: Pass countAsSolved to block modifications on solved requests
    countAsSolved: ticketData.status?.countAsSolved === true,
  });

  // Wrapper functions for context API (IDs are already strings)
  const addAssignee = useCallback(
    (technicianId: string, technicianName: string, technicianTitle?: string) => {
      return addAssigneeRaw(technicianId, technicianName, technicianTitle);
    },
    [addAssigneeRaw]
  );

  const removeAssignee = useCallback(
    (technicianId: string) => {
      return removeAssigneeRaw(technicianId);
    },
    [removeAssigneeRaw]
  );

  // **MESSAGING PERMISSION CHECK**
  // Only assignees and the requester can send messages to non-solved requests
  // Uses SSR-provided currentUserIsTechnician for reliable permission check
  const messagingPermission = useMemo(() => {
    if (!currentUserId || !ticketData) {
      return {
        canMessage: false,
        reason: 'User not authenticated',
        isAssignee: false,
        isRequester: false
      };
    }

    // Check if request is solved (block messaging)
    const isStatusSolved = ticketData.status?.countAsSolved === true;
    if (isStatusSolved) {
      return {
        canMessage: false,
        reason: 'Cannot send messages to solved requests',
        isAssignee: assignees.some(a => String(a.userId) === String(currentUserId)),
        isRequester: String(ticketData.requester?.id ?? ticketData.requesterId ?? '') === String(currentUserId)
      };
    }

    // Check if user is an assignee
    const isAssignee = assignees.some(a => String(a.userId) === String(currentUserId));

    // Check if user is the requester
    const requesterId = ticketData.requester?.id ?? ticketData.requesterId ?? null;
    const isRequester = requesterId !== null && String(requesterId) === String(currentUserId);

    // Only assignees and the requester can send messages
    const canMessage = isAssignee || isRequester;

    return {
      canMessage,
      reason: canMessage ? undefined : "Only assigned technicians can send messages on this request",
      isAssignee,
      isRequester
    };
  }, [currentUserId, ticketData, assignees]);

  // **STATUS UPDATE PERMISSION CHECK**
  // NF-3: Any technician can update status of any non-solved request
  // The assignee concept is informational only, not a permission gate
  const canUpdateStatus = useMemo(() => {
    if (!currentUserId) return false;

    // Check if request is solved (block updates)
    const isStatusSolved = ticketData.status?.countAsSolved === true;
    if (isStatusSolved) return false;

    // Super admins can always update
    const userIsSuperAdmin = session?.user?.isSuperAdmin === true;
    if (userIsSuperAdmin) return true;

    // NF-3: Any technician can update status of non-solved requests
    const isTechnician = currentUser?.isTechnician === true;
    return isTechnician;
  }, [currentUserId, session, currentUser?.isTechnician, ticketData.status?.countAsSolved]);

  // **REQUEST DETAILS EDIT PERMISSION CHECK**
  // Only assignees, Senior, Supervisor, and Admin users can edit:
  // Status, Category, Subcategory, and Notes
  const canEditRequestDetails = useMemo(() => {
    if (!currentUserId) return false;

    // Check if request is solved (block all edits)
    const isStatusSolved = ticketData.status?.countAsSolved === true;
    if (isStatusSolved) return false;

    // Super admins can always edit
    const userIsSuperAdmin = session?.user?.isSuperAdmin === true;
    if (userIsSuperAdmin) return true;

    // Check if user is an assignee
    const isAssignee = assignees.some(a => String(a.userId) === String(currentUserId));
    if (isAssignee) return true;

    // Check if user has Senior or Supervisor role
    const userRoles = currentUser?.userRoles || [];
    const isSenior = userRoles.some((r: { name?: string }) => r?.name === 'Senior');
    const isSupervisor = userRoles.some((r: { name?: string }) => r?.name === 'Supervisor');

    return isSenior || isSupervisor;
  }, [currentUserId, session, currentUser?.userRoles, assignees, ticketData.status?.countAsSolved]);

  // **CHAT DISABLED CHECK**
  // Chat is disabled when ticket status has countAsSolved=true
  // This indicates the ticket is complete/closed/solved
  const chatDisabledState = useMemo(() => {
    // Support both nested and flat structures (defensive programming)
    // Nested: ticketData.status (from API/SSR)
    const status = ticketData.status;

    // Check if status has countAsSolved flag
    const isDisabled = status?.countAsSolved === true;

    let reason: string | undefined;
    if (isDisabled) {
      const statusName = status?.name || 'completed';
      const displayName = statusName.charAt(0).toUpperCase() + statusName.slice(1).toLowerCase();
      reason = `This ticket is ${displayName}. Chat is disabled for ${displayName.toLowerCase()} tickets.`;
    }

    return { isDisabled, reason };
  }, [ticketData]);

  // **CHAT MUTATIONS ERROR HANDLER** - Memoized to prevent unnecessary re-renders
  const handleChatMutationError = useCallback((error: Error) => {
    console.error('❌ Chat mutation error:', error);
  }, []);

  // **CHAT MUTATIONS**
  // Handles send message and upload with optimistic updates
  const {
    isSending: sendingMessage,
    isUploading: uploadingAttachment,
    sendMessage,
    sendAttachmentMessage,
    retryMessage: retryMessageMutation,
    discardFailedMessage,
    uploadAttachments,
  } = useChatMutations({
    requestId: ticketData.id,
    currentUserId,
    currentUser,
    messagingPermission,
    sendChatMessageViaWebSocket: sendChatMessage,
    updateMessageStatus,
    onError: handleChatMutationError,

    // Cache integration for offline support
    messageCache: cacheRef.current.cache ? {
      addMessage: (msg) => cacheRef.current.cache!.addMessage(msg),
      getByTempId: (tempId) => cacheRef.current.cache!.getByTempId(tempId),
      replaceOptimisticMessage: (tempId, realMsg) => cacheRef.current.cache!.replaceOptimisticMessage(tempId, realMsg),
      updateMessage: (msg) => cacheRef.current.cache!.updateMessage(msg),
    } : null,
    syncEngine: cacheRef.current.syncEngine ? {
      isOnline: true, // TODO: Add network status detection
      queueOperation: (op) => cacheRef.current.syncEngine!.queueOperation(op as any),
    } : null,
  });

  // **RETRY MESSAGE ACTION**
  // Wraps retryMessage for context API
  const retryMessage = useCallback((tempId: string) => {
    console.log('[Context] Retrying message:', tempId);
    retryMessageMutation(tempId).catch((err) => {
      console.error('[Context] Retry failed:', err);
    });
  }, [retryMessageMutation]);

  // **MEDIA VIEWER STATE**
  // State for managing the screenshot viewer
  const [mediaViewerOpen, setMediaViewerOpen] = useState(false);
  const [mediaViewerIndex, setMediaViewerIndex] = useState(0);

  // Derive screenshots array from messages (memoized)
  const screenshots = useMemo<ScreenshotItem[]>(() => {
    return messages
      .filter(msg => msg.isScreenshot && msg.screenshotFileName)
      .map(msg => ({
        id: msg.id,
        requestId: ticket?.id || '', // Add requestId for media caching (safe fallback)
        filename: msg.screenshotFileName!,
        url: `/api/screenshots/by-filename/${msg.screenshotFileName}`,
        timestamp: msg.createdAt,
        sender: {
          name: msg.sender?.fullName || msg.sender?.username || 'Unknown',
          initials: getInitials(msg.sender?.fullName || msg.sender?.username || 'U'),
        },
        messageContent: msg.content !== 'Screenshot' ? msg.content : undefined,
        sequenceNumber: msg.sequenceNumber,
      }))
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  }, [messages, ticket?.id]);

  // Handler to open viewer at specific screenshot
  const openMediaViewer = useCallback((screenshotFilename: string) => {
    const index = screenshots.findIndex(s => s.filename === screenshotFilename);
    if (index !== -1) {
      setMediaViewerIndex(index);
      setMediaViewerOpen(true);
    }
  }, [screenshots]);

  // Close handler
  const closeMediaViewer = useCallback(() => {
    setMediaViewerOpen(false);
  }, []);

  // Navigation handler
  const navigateMediaViewer = useCallback((direction: 'next' | 'prev') => {
    setMediaViewerIndex(current => {
      if (direction === 'next') {
        return current < screenshots.length - 1 ? current + 1 : current;
      } else {
        return current > 0 ? current - 1 : current;
      }
    });
  }, [screenshots.length]);

  // **TAKE REQUEST ACTION**
  // Wraps the takeRequest with current user
  const takeRequest = async () => {
    if (!currentUser) {
      throw new Error('Not authenticated');
    }
    await takeRequestSWR(currentUser);
  };

  // Build context value with WebSocket + state-managed data
  const value: RequestDetailsContextType = {
    // Ticket data (state-managed)
    ticket: ticketData,
    technicians: techniciansData,
    priorities: prioritiesData,
    statuses: statusesData,
    categories: initialCategories,  // SSR data passed directly

    // Notes (SWR-managed for background refresh)
    notes,
    notesLoading,
    addNote,

    // Assignees (state-managed with technicians cache)
    assignees,
    assigneesLoading,
    addAssignee,
    removeAssignee,
    takeRequest,
    canEditAssignees, // @deprecated - use canAddAssignees/canRemoveAssignees
    canAddAssignees,
    canRemoveAssignees,
    canTakeRequest,

    // Current user
    currentUserId: currentUserId ? String(currentUserId) : undefined,
    currentUser,

    // Messages (WebSocket-managed)
    messages,
    messagesLoading,

    // Chat mutations
    sendMessage,
    sendAttachmentMessage,
    retryMessage,
    discardFailedMessage,
    uploadAttachments,
    sendingMessage,
    uploadingAttachment,

    // SignalR connection status
    isSignalRConnected,
    connectionAlertLevel,

    // Media Viewer (for screenshot viewing)
    mediaViewerOpen,
    mediaViewerIndex,
    screenshots,
    openMediaViewer,
    closeMediaViewer,
    navigateMediaViewer,
    setMediaViewerIndex,

    // Ticket mutations (state-managed)
    updateTicketStatus,
    updateTicketPriority,
    updatingTicket,
    isUpdatingStatus,

    // Status update permission
    canUpdateStatus,

    // Request details edit permission (status, category, subcategory, notes)
    canEditRequestDetails,

    // Chat reload warning
    chatNeedsReload,
    dismissReloadWarning,

    // Messaging permissions
    messagingPermission,

    // Chat disabled state (based on ticket status)
    isChatDisabled: chatDisabledState.isDisabled,
    chatDisabledReason: chatDisabledState.reason,

    // Sub-tasks (from SSR, passed to SubTasksPanel)
    initialSubTasks,

    // Scroll handler registration (for auto-scroll on new messages)
    registerScrollHandler,
    registerForceScrollHandler,

    // Cache integration state
    cacheInitialized,
    isSyncing,
    syncError,
  };

  return (
    <RequestDetailContext.Provider value={value}>
      {children}
    </RequestDetailContext.Provider>
  );
}

export function useRequestDetail() {
  const context = useContext(RequestDetailContext);
  if (context === undefined) {
    throw new Error('useRequestDetail must be used within a RequestDetailProvider');
  }
  return context;
}
