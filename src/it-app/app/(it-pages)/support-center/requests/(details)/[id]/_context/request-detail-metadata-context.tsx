'use client';

/**
 * Request Detail Metadata Context
 * Provides ticket metadata (notes, assignees, status, priority) separate from chat
 *
 * Split from monolithic RequestDetailProvider to prevent unnecessary re-renders
 * when chat messages or typing indicators change.
 */

import { createContext, useContext, useMemo, useCallback, useEffect, useState, useRef } from 'react';
import { mutate } from 'swr';
import type { ServiceRequestDetail } from '@/types/ticket-detail';
import type { Technician, Priority, RequestStatus, RequestNote } from '@/types/metadata';
import type { Assignee } from '@/lib/hooks/use-request-assignees';
import type { SubTask, SubTaskStats } from '@/types/sub-task';
import type { Category } from '@/lib/hooks/use-categories-tags';
import type { TaskStatusChangedEvent } from '@/lib/signalr/types';
import { useRequestNotes } from '@/lib/hooks/use-request-notes';
import { useRequestAssignees } from '@/lib/hooks/use-request-assignees';
import { useGlobalPriorities, useGlobalStatuses, useGlobalTechnicians } from '@/lib/hooks/use-global-metadata';
import { useRequestTicket } from '@/lib/hooks/use-request-ticket';

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
  // **SESSION STATE** - Hydration-safe: null initially, populated in useEffect
  const [session, setSession] = useState<{
    isAuthenticated: boolean;
    user: any;
    sessionId: string | null;
    accessToken: string | null;
  } | null>(null);

  // Load session from cookie after mount (client-side only)
  useEffect(() => {
    const getSessionFromCookie = () => {
      try {
        const userData = document.cookie
          .split(';')
          .map((c: string) => c.trim())
          .find((c: string) => c.startsWith('user_data='))
          ?.split('=')[1];

        if (!userData) return null;

        const user = JSON.parse(decodeURIComponent(userData));
        return {
          isAuthenticated: true,
          user,
          sessionId: null,
          accessToken: null,
        };
      } catch {
        return null;
      }
    };

    const sessionData = getSessionFromCookie();
    setSession(sessionData ?? {
      isAuthenticated: false,
      user: null,
      sessionId: null,
      accessToken: null,
    });
  }, []);

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
    updateStatus: updateTicketStatus,
    updatePriority: updateTicketPriority,
    mutate: mutateTicket,
  } = useRequestTicket({
    requestId: initialTicket.id,
    initialData: initialTicket,
    priorities: prioritiesData,
    statuses: statusesData,
    onError: handleTicketError,
  });

  // CRITICAL FIX: Use refs to access current values in WebSocket callbacks
  const mutateTicketRef = useRef(mutateTicket);
  const statusesDataRef = useRef(statusesData);

  // Keep refs in sync with current values
  useEffect(() => {
    mutateTicketRef.current = mutateTicket;
  }, [mutateTicket]);

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
      mutate((key) => typeof key === 'string' && key.startsWith('/api/requests/technician-views')),
      mutate('/api/requests/view-counts'),
      mutate((key) => typeof key === 'string' && key.startsWith('/api/requests/business-unit-counts')),
    ]);
  }, [mutateTicket]);

  // Callback to refresh ticket data when assignee is removed
  const handleAssigneeRemoved = useCallback(async () => {
    await mutateTicket();
    await Promise.all([
      mutate((key) => typeof key === 'string' && key.startsWith('/api/requests/technician-views')),
      mutate('/api/requests/view-counts'),
      mutate((key) => typeof key === 'string' && key.startsWith('/api/requests/business-unit-counts')),
    ]);
  }, [mutateTicket]);

  // **NOTES**
  const {
    notes,
    isLoading: notesLoading,
    addNote,
  } = useRequestNotes(ticket!.id, initialNotes);

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
  } = useRequestAssignees(ticket.id, initialAssignees, {
    getTechnicianById,
    onError: handleAssigneeError,
    onAssigneeAdded: handleAssigneeAdded,
    onAssigneeRemoved: handleAssigneeRemoved,
    currentUserId,
    currentUserRoles,
    isTechnician,
    countAsSolved: ticket.status?.countAsSolved === true,
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
    if (ticket.status?.countAsSolved === true) return false;
    if (sessionUser?.isSuperAdmin === true) return true;
    return isTechnician === true;
  }, [currentUserId, sessionUser, isTechnician, ticket.status?.countAsSolved]);

  // **REQUEST DETAILS EDIT PERMISSION CHECK**
  const canEditRequestDetails = useMemo(() => {
    if (!currentUserId) return false;
    if (ticket.status?.countAsSolved === true) return false;
    if (sessionUser?.isSuperAdmin === true) return true;
    if (assignees.some((a) => String(a.userId) === String(currentUserId))) return true;
    if (currentUserRoles) {
      const isSenior = currentUserRoles.some((r: { name?: string }) => r?.name === 'Senior');
      const isSupervisor = currentUserRoles.some((r: { name?: string }) => r?.name === 'Supervisor');
      return isSenior || isSupervisor;
    }
    return false;
  }, [currentUserId, sessionUser, currentUserRoles, assignees, ticket.status?.countAsSolved]);

  // **CHAT DISABLED CHECK**
  const chatDisabledState = useMemo(() => {
    const status = ticket.status;
    const isDisabled = status?.countAsSolved === true;
    let reason: string | undefined;
    if (isDisabled) {
      const statusName = status?.name || 'completed';
      const displayName = statusName.charAt(0).toUpperCase() + statusName.slice(1).toLowerCase();
      reason = `This ticket is ${displayName}. Chat is disabled for ${displayName.toLowerCase()} tickets.`;
    }
    return { isDisabled, reason };
  }, [ticket.status]);

  // **TAKE REQUEST ACTION**
  const takeRequest = async () => {
    if (!currentUser) throw new Error('Not authenticated');
    await takeRequestSWR(currentUser);
  };

  const value: RequestDetailMetadataContextType = useMemo(
    () => ({
      ticket,
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
      currentUserId,
      currentUser,
      initialSubTasks,
      registerScrollHandler,
      registerForceScrollHandler,
      mutateTicketRef,
      statusesDataRef,
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
      currentUserId,
      currentUser,
      initialSubTasks,
      registerScrollHandler,
      registerForceScrollHandler,
      mutateTicketRef,
      statusesDataRef,
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
