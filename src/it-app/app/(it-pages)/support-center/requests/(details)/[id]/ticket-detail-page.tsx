'use client';

/**
 * Ticket Detail Page Client Wrapper
 * Receives server-side fetched data and provides it via RequestDetailProvider
 *
 * Includes:
 * - RequestDetailProvider: Ticket data, chat, notes, assignees
 * - RemoteAccessProvider: Inline remote access session management
 */

import { TicketDetailClient } from './_components/ticket-detail-client';
import { RequestDetailProvider } from './_context/request-detail-context';
import { RemoteAccessProvider } from './_context/remote-access-context';
import type { RequestDetailsPageData } from '@/types/requests-details';

interface TicketDetailsProps {
  pageData: RequestDetailsPageData;
}

export function TicketDetailPage({ pageData }: TicketDetailsProps) {
  return (
    <div className="relative h-full w-full">
      <RequestDetailProvider
        ticket={pageData.ticket}
        technicians={pageData.technicians}
        priorities={pageData.priorities}
        statuses={pageData.statuses}
        categories={pageData.categories}
        notes={pageData.notes}
        assignees={pageData.assignees}
        initialMessages={pageData.initialMessages}
        currentUserId={pageData.currentUserId}
        currentUserIsTechnician={pageData.currentUserIsTechnician}
        subTasks={pageData.subTasks}
      >
        <RemoteAccessProvider requestId={pageData.ticket.id}>
          <TicketDetailClient />
        </RemoteAccessProvider>
      </RequestDetailProvider>
    </div>
  );
}

export default TicketDetailPage;
