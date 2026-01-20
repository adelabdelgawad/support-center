'use client';

/**
 * Request Detail Provider
 * Provides centralized data and actions for the request details page
 *
 * NOW SPLIT into two separate contexts to prevent unnecessary re-renders:
 * 1. RequestDetailMetadataContext - ticket, notes, assignees, permissions
 * 2. RequestDetailChatContext - messages, screenshots, chat actions
 *
 * Each context independently memoizes its value, so changes in chat
 * don't cause re-renders in components that only consume metadata.
 */

import { useRef, useEffect, useMemo, createContext, useState } from 'react';
import type { ServiceRequestDetail } from '@/types/ticket-detail';
import type { Technician, Priority, RequestStatus, RequestNote } from '@/types/metadata';
import type { ChatMessage, TaskStatusChangedEvent } from '@/lib/signalr/types';
import type { SubTask, SubTaskStats } from '@/types/sub-task';
import type { Category } from '@/lib/hooks/use-categories-tags';
import type { Assignee } from '@/lib/hooks/use-request-assignees';

// Import split contexts
import {
  RequestDetailMetadataProvider,
  useRequestDetailMetadata,
  type RequestDetailMetadataContextType,
} from './request-detail-metadata-context';
import {
  RequestDetailChatProvider,
  useRequestDetailChat,
  type RequestDetailChatContextType,
} from './request-detail-chat-context';

// Re-export combined type for backward compatibility
import type { RequestDetailsContextType } from '@/types/requests-details';

const RequestDetailContext = createContext<RequestDetailsContextType | undefined>(undefined);

interface RequestDetailProviderProps {
  children: React.ReactNode;
  ticket: ServiceRequestDetail;
  technicians: Technician[];
  priorities: Priority[];
  statuses: RequestStatus[];
  categories: Category[];
  notes: RequestNote[];
  assignees: Assignee[];
  initialMessages: ChatMessage[];
  currentUserId?: string;
  currentUserIsTechnician?: boolean;
  subTasks?: {
    items: SubTask[];
    total: number;
    stats: SubTaskStats;
  };
}

/**
 * Combined provider that wraps both split providers
 * This maintains the same API as the original monolithic provider
 */
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
  currentUserIsTechnician,
  subTasks: initialSubTasks,
}: RequestDetailProviderProps) {
  // **SESSION STATE** - Hydration-safe: null initially, populated in useEffect
  const [session, setSession] = useState<{ user: any } | null>(null);

  // Load session from cookie after mount (client-side only)
  useEffect(() => {
    const getSessionFromCookie = () => {
      try {
        const userData = document.cookie
          .split(';')
          .map((c) => c.trim())
          .find((c) => c.startsWith('user_data='))
          ?.split('=')[1];

        if (!userData) return null;

        const user = JSON.parse(decodeURIComponent(userData));
        return { user };
      } catch {
        return null;
      }
    };

    setSession(getSessionFromCookie());
  }, []);

  const currentUser = useMemo(() => {
    return session?.user
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

  // **SCROLL HANDLER REGISTRATION** - Shared between contexts
  const scrollHandlerRef = useRef<(() => void) | null>(null);
  const forceScrollHandlerRef = useRef<(() => void) | null>(null);

  // Build combined context value
  const value: RequestDetailsContextType = useMemo(
    () => ({
      // Will be populated by the combined hook below
    } as RequestDetailsContextType),
    [] // Dependencies don't matter since this is just a placeholder
  );

  // Bridge component to connect reactive metadata values to chat provider
  // This component sits inside RequestDetailMetadataProvider and can access reactive values
  function ChatProviderBridge({ children }: { children: React.ReactNode }) {
    // Get reactive values and event handlers from metadata context
    const {
      messagingPermission,
      isChatDisabled,
      handleTicketUpdateEvent,
      handleTaskStatusChangedEvent,
    } = useRequestDetailMetadata();

    return (
      <RequestDetailChatProvider
        requestId={initialTicket.id}
        initialMessages={initialMessages}
        currentUserId={currentUserId ? String(currentUserId) : undefined}
        currentUser={currentUser}
        messagingPermission={messagingPermission}
        ticketSolved={isChatDisabled}
        scrollHandlerRef={scrollHandlerRef}
        forceScrollHandlerRef={forceScrollHandlerRef}
        onTicketUpdate={handleTicketUpdateEvent}
        onTaskStatusChanged={handleTaskStatusChangedEvent}
      >
        {children}
      </RequestDetailChatProvider>
    );
  }

  return (
    <RequestDetailContext.Provider value={value}>
      <RequestDetailMetadataProvider
        ticket={initialTicket}
        technicians={initialTechnicians}
        priorities={priorities}
        statuses={statuses}
        categories={initialCategories}
        notes={initialNotes}
        assignees={initialAssignees}
        currentUserId={currentUserId ? String(currentUserId) : undefined}
        currentUserRoles={currentUser?.userRoles}
        isTechnician={currentUser?.isTechnician}
        sessionUser={session?.user}
        subTasks={initialSubTasks}
      >
        <ChatProviderBridge>
          {children}
        </ChatProviderBridge>
      </RequestDetailMetadataProvider>
    </RequestDetailContext.Provider>
  );
}

/**
 * Combined hook that returns values from both split contexts
 * Maintains backward compatibility with existing code
 */
export function useRequestDetail() {
  const metadata = useRequestDetailMetadata();
  const chat = useRequestDetailChat();

  // Combine all context values into a single object
  return {
    ...metadata,
    ...chat,
  };
}

// Re-export individual hooks for granular access
export { useRequestDetailMetadata } from './request-detail-metadata-context';
export { useRequestDetailChat } from './request-detail-chat-context';
