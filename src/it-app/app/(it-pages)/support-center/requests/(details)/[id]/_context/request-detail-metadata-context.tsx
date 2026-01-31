'use client';

/**
 * Request Detail Metadata Context
 * Provides ticket metadata (notes, assignees, status, priority) separate from chat
 *
 * Split from monolithic RequestDetailProvider to prevent unnecessary re-renders
 * when chat messages or typing indicators change.
 *
 * NOTE: We keep `import { mutate } from 'swr'` ONLY for global invalidation of
 * requests-list SWR cache keys after assignee/status changes. This is intentional
 * and documented in the SWR migration plan.
 */

import { createContext, useContext, useMemo, useCallback, useEffect, useState, useRef } from 'react';
import useSWR, { mutate as swrMutate } from 'swr';
import type { ServiceRequestDetail } from '@/types/ticket-detail';
import type { Technician, Priority, RequestStatus, RequestNote } from '@/types/metadata';
import type { Assignee } from '@/lib/hooks/use-request-assignees';
import type { SubTask, SubTaskStats } from '@/types/sub-task';
import type { Category } from '@/lib/hooks/use-categories-tags';
import type { TaskStatusChangedEvent, TicketUpdateEvent } from '@/lib/signalr/types';
import { useRequestNotes } from '@/lib/hooks/use-request-notes';
import { useRequestAssignees } from '@/lib/hooks/use-request-assignees';
import { useGlobalPriorities, useGlobalStatuses, useGlobalTechnicians } from '@/lib/hooks/use-global-metadata';
import { useRequestTicket } from '@/lib/hooks/use-request-ticket';
import { apiClient } from '@/lib/fetch/client';

export interface RequestDetailMetadataContextType {
  // Ticket data
  ticket: ServiceRequestDetail;
  technicians: Technician[];
  priorities: Priority[];
  statuses: RequestStatus[];
  categories: Category[];

  // Notes
  notes: RequestNote[];
  notesLoading: boolean;
  addNote: (content: string) => Promise<void>;

  // Assignees
  assignees: Assignee[];
  assigneesLoading: boolean;
  addAssignee: (technicianId: string, technicianName: string, technicianTitle?: string) => Promise<void>;
  removeAssignee: (technicianId: string) => Promise<void>;
  takeRequest: () => Promise<void>;
  canEditAssignees: boolean;
  canAddAssignees: boolean;
  canRemoveAssignees: boolean;
  canTakeRequest: boolean;

  // Ticket mutations
  updateTicketStatus: (statusId: number, resolution?: string) => Promise<void>;
  updateTicketPriority: (priorityId: number) => Promise<void>;
  updatingTicket: boolean;
  isUpdatingStatus: boolean;
  isUpdatingPriority: boolean;

  // Permission checks
  canUpdateStatus: boolean;
  canEditRequestDetails: boolean;
  isChatDisabled: boolean;
  chatDisabledReason: string | undefined;

  // Messaging permission
  messagingPermission: {
    canMessage: boolean;
    reason?: string;
    isAssignee: boolean;
    isRequester: boolean;
  };

  // User info
  currentUserId?: string;
  currentUser?: {
    id: string;
    username: string;
    fullName?: string | null;
    title?: string | null;
    email?: string | null;
  };

  // Sub-tasks
  initialSubTasks?: {
    items: SubTask[];
    total: number;
    stats: SubTaskStats;
  };

  // Scroll handler registration (for auto-scroll on new messages)
  registerScrollHandler: (handler: (() => void) | null) => void;
  registerForceScrollHandler: (handler: (() => void) | null) => void;

  // Refs for external access (used by chat context)
  mutateTicketRef: React.MutableRefObject<(() => Promise<void>) | null>;
  statusesDataRef: React.MutableRefObject<RequestStatus[]>;

  // SignalR event handlers for real-time updates
  handleTicketUpdateEvent: (event: TicketUpdateEvent) => Promise<void>;
  handleTaskStatusChangedEvent: (event: TaskStatusChangedEvent) => Promise<void>;
}

const RequestDetailMetadataContext = createContext<RequestDetailMetadataContextType | undefined>(undefined);

interface RequestDetailMetadataProviderProps {
  children: React.ReactNode;
  ticket: ServiceRequestDetail;
  technicians: Technician[];
  priorities: Priority[];
  statuses: RequestStatus[];
  categories: Category[];
  notes: RequestNote[];
  assignees: Assignee[];
  currentUserId?: string;
  currentUserRoles?: string[];
  isTechnician?: boolean;
  sessionUser?: { isSuperAdmin?: boolean } | null;
  subTasks?: {
    items: SubTask[];
    total: number;
    stats: SubTaskStats;
  };
}

export function RequestDetailMetadataProvider({
  children,
  ticket: initialTicket,
  technicians: initialTechnicians,
  priorities,
  statuses,
  categories: initialCategories,
  notes: initialNotes,
  assignees: initialAssignees,
  currentUserId,
  currentUserRoles,
  isTechnician,
  sessionUser,
  subTasks: initialSubTasks,
}: RequestDetailMetadataProviderProps) {
  // **SESSION STATE** - Initialize synchronously to avoid post-mount re-render
  const [session] = useState<{
    isAuthenticated: boolean;
    user: any;
    sessionId: string | null;
    accessToken: string | null;
  }>(() => {
    // This runs once during initial render (client-side only due to 'use client')
    try {
      if (typeof document === 'undefined') {
        // SSR safety - return default state
        return {
          isAuthenticated: false,
          user: null,
          sessionId: null,
          accessToken: null,
        };
      }

      const userData = document.cookie
        .split(';')
        .map((c: string) => c.trim())
        .find((c: string) => c.startsWith('user_data='))
        ?.split('=')[1];

      if (!userData) {
        return {
          isAuthenticated: false,
          user: null,
          sessionId: null,
          accessToken: null,
        };
      }

      const user = JSON.parse(decodeURIComponent(userData));
      return {
        isAuthenticated: true,
        user,
        sessionId: null,
        accessToken: null,
      };
    } catch {
      return {
        isAuthenticated: false,
        user: null,
        sessionId: null,
        accessToken: null,
      };
    }
  });

  const currentUser = useMemo(() => {
    return session?.isAuthenticated && session?.user
      ? {
          id: session.user.id,
          username: session.user.username,
          fullName: session.user.fullName || (session.user as any).full_name || null,
          title: session.user.title,
          email: session.user.email || null,
          isTechnician: session.user.isTechnician || false,
          userRoles: session.user.userRoles || [],
        }
      : undefined;
  }, [session]);

  // **ERROR HANDLERS** - Memoized to prevent unnecessary re-renders
  const handleTicketError = useCallback((error: Error) => {
    console.error('❌ Ticket update error:', error);
  }, []);

  const handleAssigneeError = useCallback((error: Error) => {
    console.error('❌ Assignee operation error:', error);
  }, []);

  // **GLOBAL METADATA CACHE**
  const { technicians: techniciansData, getTechnicianById } = useGlobalTechnicians(initialTechnicians);
  const { priorities: prioritiesData } = useGlobalPriorities(priorities);
  const { statuses: statusesData } = useGlobalStatuses(statuses);

  // **TICKET MUTATIONS**
  const {
    ticket,
    isUpdating: updatingTicket,
    isUpdatingStatus,
    isUpdatingPriority,
    updateStatus: updateStatusRaw,
    updatePriority: updatePriorityRaw,
    mutate: mutateTicket,
  } = useRequestTicket({
    requestId: initialTicket.id,
    initialData: initialTicket,
    priorities: prioritiesData,
    statuses: statusesData,
    onError: handleTicketError,
  });

  // **60s AUTO-REFRESH FOR TICKET DATA (via SWR)**
  // SWR provides background polling without interrupting SignalR
  // SignalR handles real-time updates, this is a safety net for missed events
  const fetcher = useCallback(async (url: string) => {
    const response = await apiClient.get<ServiceRequestDetail>(url);
    // Update local state when SWR fetches fresh data
    if (response) {
      await mutateTicket(response);
    }
    return response;
  }, [mutateTicket]);

  useSWR(
    `/api/requests-details/${initialTicket.id}`,
    fetcher,
    {
      refreshInterval: 60000, // 60 seconds
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 10000,
      // Don't show loading states during background refresh
      keepPreviousData: true,
    }
  );

  // Wrapper functions to match interface signatures
  const updateTicketStatus = useCallback(
    async (statusId: number, resolution?: string) => {
      await updateStatusRaw(statusId, resolution);
    },
    [updateStatusRaw]
  );

  const updateTicketPriority = useCallback(
    async (priorityId: number) => {
      await updatePriorityRaw(priorityId);
    },
    [updatePriorityRaw]
  );

  // CRITICAL FIX: Use refs to access current values in WebSocket callbacks
  // Wrapper for mutateTicket that returns Promise<void>
  const mutateTicketWrapper = useCallback(async () => {
    await mutateTicket();
  }, [mutateTicket]);

  const mutateTicketRef = useRef<(() => Promise<void>) | null>(null);
  const statusesDataRef = useRef(statusesData);

  // Keep refs in sync with current values
  useEffect(() => {
    mutateTicketRef.current = mutateTicketWrapper;
  }, [mutateTicketWrapper]);

  useEffect(() => {
    statusesDataRef.current = statusesData;
  }, [statusesData]);

  // **SCROLL HANDLER REGISTRATION**
  const scrollHandlerRef = useRef<(() => void) | null>(null);
  const forceScrollHandlerRef = useRef<(() => void) | null>(null);

  const registerScrollHandler = useCallback((handler: (() => void) | null) => {
    scrollHandlerRef.current = handler;
  }, []);

  const registerForceScrollHandler = useCallback((handler: (() => void) | null) => {
    forceScrollHandlerRef.current = handler;
  }, []);

  // Callback to refresh ticket data when assignee is added
  const handleAssigneeAdded = useCallback(async () => {
    await mutateTicket();
    await Promise.all([
      swrMutate((key) => typeof key === 'string' && key.startsWith('/api/requests/technician-views')),
      swrMutate('/api/requests/view-counts'),
      swrMutate((key) => typeof key === 'string' && key.startsWith('/api/requests/business-unit-counts')),
    ]);
  }, [mutateTicket]);

  // Callback to refresh ticket data when assignee is removed
  const handleAssigneeRemoved = useCallback(async () => {
    await mutateTicket();
    await Promise.all([
      swrMutate((key) => typeof key === 'string' && key.startsWith('/api/requests/technician-views')),
      swrMutate('/api/requests/view-counts'),
      swrMutate((key) => typeof key === 'string' && key.startsWith('/api/requests/business-unit-counts')),
    ]);
  }, [mutateTicket]);

  // **NOTES**
  const {
    notes,
    isLoading: notesLoading,
    addNote: addNoteRaw,
    mutate: mutateNotes,
  } = useRequestNotes(ticket!.id, initialNotes);

  // Wrapper function to match interface signature
  const addNote = useCallback(
    async (content: string) => {
      await addNoteRaw(content);
    },
    [addNoteRaw]
  );

  // **ASSIGNEES**
  const {
    assignees,
    isLoading: assigneesLoading,
    addAssignee: addAssigneeRaw,
    removeAssignee: removeAssigneeRaw,
    takeRequest: takeRequestSWR,
    canEditAssignees,
    canAddAssignees,
    canRemoveAssignees,
    canTakeRequest,
    refresh: refreshAssignees,
  } = useRequestAssignees(ticket!.id, initialAssignees, {
    getTechnicianById,
    onError: handleAssigneeError,
    onAssigneeAdded: handleAssigneeAdded,
    onAssigneeRemoved: handleAssigneeRemoved,
    currentUserId,
    currentUserRoles,
    isTechnician,
    countAsSolved: ticket!.status?.countAsSolved === true,
  });

  // Wrapper functions for context API
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

  // **STATUS UPDATE PERMISSION CHECK**
  const canUpdateStatus = useMemo(() => {
    if (!currentUserId) return false;
    if (ticket!.status?.countAsSolved === true) return false;
    if (sessionUser?.isSuperAdmin === true) return true;
    return isTechnician === true;
  }, [currentUserId, sessionUser, isTechnician, ticket!.status?.countAsSolved]);

  // **REQUEST DETAILS EDIT PERMISSION CHECK**
  const canEditRequestDetails = useMemo(() => {
    if (!currentUserId) return false;
    if (ticket!.status?.countAsSolved === true) return false;
    if (sessionUser?.isSuperAdmin === true) return true;
    if (assignees.some((a) => String(a.userId) === String(currentUserId))) return true;
    if (currentUserRoles) {
      const isSenior = currentUserRoles.some((r) => r === 'Senior');
      const isSupervisor = currentUserRoles.some((r) => r === 'Supervisor');
      return isSenior || isSupervisor;
    }
    return false;
  }, [currentUserId, sessionUser, currentUserRoles, assignees, ticket!.status?.countAsSolved]);

  // **CHAT DISABLED CHECK**
  const chatDisabledState = useMemo(() => {
    const status = ticket!.status;
    const isDisabled = status?.countAsSolved === true;
    let reason: string | undefined;
    if (isDisabled) {
      const statusName = status?.name || 'completed';
      const displayName = statusName.charAt(0).toUpperCase() + statusName.slice(1).toLowerCase();
      reason = `This ticket is ${displayName}. Chat is disabled for ${displayName.toLowerCase()} tickets.`;
    }
    return { isDisabled, reason };
  }, [ticket!.status]);

  // **TAKE REQUEST ACTION**
  const takeRequest = async () => {
    if (!currentUser) throw new Error('Not authenticated');
    await takeRequestSWR(currentUser);
  };

  // **SIGNALR EVENT HANDLERS FOR REAL-TIME UPDATES**
  // These will be passed to chat context to trigger revalidation

  // Handler for TicketUpdateEvent (assignment changes, status changes, etc.)
  const handleTicketUpdateEvent = useCallback(async (event: TicketUpdateEvent) => {
    console.log('[MetadataContext] TicketUpdateEvent received:', event);

    // Refresh assignees when assignment changes
    if (event.eventType === 'assignment') {
      console.log('[MetadataContext] Assignment changed - refreshing assignees');
      await refreshAssignees();
    }

    // Refresh ticket for status/priority changes
    if (event.eventType === 'status_change' || event.eventType === 'priority_change') {
      console.log('[MetadataContext] Status/priority changed - refreshing ticket');
      await mutateTicket();
    }

    // Refresh notes when note is added
    if (event.eventType === 'note_added') {
      console.log('[MetadataContext] Note added - refreshing notes');
      await mutateNotes();
    }
  }, [refreshAssignees, mutateTicket, mutateNotes]);

  // Handler for TaskStatusChangedEvent
  const handleTaskStatusChangedEvent = useCallback(async (event: TaskStatusChangedEvent) => {
    console.log('[MetadataContext] TaskStatusChangedEvent received:', event);
    await mutateTicket();
  }, [mutateTicket]);

  // **MESSAGING PERMISSION CHECK**
  const messagingPermission = useMemo(() => {
    if (!currentUserId) {
      return {
        canMessage: false,
        reason: 'Not authenticated',
        isAssignee: false,
        isRequester: false,
      };
    }

    const isAssignee = assignees.some((a) => String(a.userId) === String(currentUserId));
    const isRequester = String(ticket!.requesterId) === String(currentUserId);

    // Check if chat is disabled due to solved status
    if (chatDisabledState.isDisabled) {
      return {
        canMessage: false,
        reason: chatDisabledState.reason,
        isAssignee,
        isRequester,
      };
    }

    // Super admin can always message
    if (sessionUser?.isSuperAdmin === true) {
      return {
        canMessage: true,
        isAssignee,
        isRequester,
      };
    }

    // Requester can message their own ticket
    if (isRequester) {
      return {
        canMessage: true,
        isAssignee,
        isRequester,
      };
    }

    // Assignee can message
    if (isAssignee) {
      return {
        canMessage: true,
        isAssignee,
        isRequester,
      };
    }

    // Others cannot message
    return {
      canMessage: false,
      reason: 'You must be assigned to this ticket to send messages',
      isAssignee,
      isRequester,
    };
  }, [currentUserId, assignees, ticket!.requesterId, chatDisabledState, sessionUser]);

  const value: RequestDetailMetadataContextType = useMemo(
    () => ({
      ticket: ticket!,
      technicians: techniciansData,
      priorities: prioritiesData,
      statuses: statusesData,
      categories: initialCategories,
      notes,
      notesLoading,
      addNote,
      assignees,
      assigneesLoading,
      addAssignee,
      removeAssignee,
      takeRequest,
      canEditAssignees,
      canAddAssignees,
      canRemoveAssignees,
      canTakeRequest,
      updateTicketStatus,
      updateTicketPriority,
      updatingTicket,
      isUpdatingStatus,
      isUpdatingPriority,
      canUpdateStatus,
      canEditRequestDetails,
      isChatDisabled: chatDisabledState.isDisabled,
      chatDisabledReason: chatDisabledState.reason,
      messagingPermission,
      currentUserId,
      currentUser,
      initialSubTasks,
      registerScrollHandler,
      registerForceScrollHandler,
      mutateTicketRef,
      statusesDataRef,
      handleTicketUpdateEvent,
      handleTaskStatusChangedEvent,
    }),
    [
      ticket,
      techniciansData,
      prioritiesData,
      statusesData,
      initialCategories,
      notes,
      notesLoading,
      addNote,
      assignees,
      assigneesLoading,
      addAssignee,
      removeAssignee,
      takeRequest,
      canEditAssignees,
      canAddAssignees,
      canRemoveAssignees,
      canTakeRequest,
      updateTicketStatus,
      updateTicketPriority,
      updatingTicket,
      isUpdatingStatus,
      isUpdatingPriority,
      canUpdateStatus,
      canEditRequestDetails,
      chatDisabledState,
      messagingPermission,
      currentUserId,
      currentUser,
      initialSubTasks,
      registerScrollHandler,
      registerForceScrollHandler,
      mutateTicketRef,
      statusesDataRef,
      handleTicketUpdateEvent,
      handleTaskStatusChangedEvent,
    ]
  );

  return (
    <RequestDetailMetadataContext.Provider value={value}>
      {children}
    </RequestDetailMetadataContext.Provider>
  );
}

export function useRequestDetailMetadata() {
  const context = useContext(RequestDetailMetadataContext);
  if (context === undefined) {
    throw new Error('useRequestDetailMetadata must be used within a RequestDetailMetadataProvider');
  }
  return context;
}
