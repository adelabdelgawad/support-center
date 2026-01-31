'use client';

/**
 * Request Details Page Wrapper
 *
 * Client component that wraps the request detail provider and handles:
 * - Background data fetching with SWR
 * - Immediate skeleton rendering during load
 * - Transition to full content when data arrives
 *
 * PERFORMANCE: This component renders a skeleton immediately without waiting for API calls.
 * Data is fetched in the background and the full UI renders when ready.
 */

import { useRequestDetailsPage } from '@/lib/hooks/use-request-details-page';
import { RequestDetailProvider } from '../_context/request-detail-context';
import { RemoteAccessProvider } from '../_context/remote-access-context';
import { TicketDetailClient } from './ticket-detail-client';
import { RequestDetailsSkeleton } from './request-details-skeleton';
import type { RequestDetailsPageData } from '@/types/requests-details';

interface RequestDetailsWrapperProps {
  requestId: string;
  currentUserId?: string;
  currentUserIsTechnician?: boolean;
  initialData?: RequestDetailsPageData | null;
}

export function RequestDetailsWrapper({
  requestId,
  currentUserId,
  currentUserIsTechnician = false,
  initialData,
}: RequestDetailsWrapperProps) {
  // Fetch data with SWR (uses initialData if provided, fetches in background)
  const { data, isLoading, error } = useRequestDetailsPage(requestId, {
    currentUserId,
    currentUserIsTechnician,
  });

  // Use initial data from server if available, otherwise use SWR data
  const pageData = initialData ?? data;

  // Show error if data failed to load
  if (error && !pageData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-destructive">
          Failed to load ticket data. Please try again.
        </div>
      </div>
    );
  }

  // Show error if request not found
  if (!pageData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-destructive">
          Request not found.
        </div>
      </div>
    );
  }

  // Render full UI with data
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
