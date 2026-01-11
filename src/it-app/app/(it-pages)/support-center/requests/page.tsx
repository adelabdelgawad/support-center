import { redirect } from 'next/navigation';
import { RequestsListProvider } from './_context/requests-list-context';
import { TicketsPageClient } from './_components/tickets-page-client';
import { getTechnicianViewsData, getBusinessUnitCountsData } from '@/lib/actions/requests-list-actions';
import { getMyCustomView } from '@/lib/actions/custom-views.actions';
import type { ViewType } from '@/types/requests-list';

export const metadata = {
  title: 'Requests',
  description: 'View and manage service requests',
};

/**
 * Server Component: Requests Page
 *
 * Native SSR - all data fetched on the server:
 * - Custom view settings (visible tabs, default view)
 * - Technician views data (tickets, counts)
 * - Business unit counts
 *
 * Data is passed to RequestsListProvider for client-side SWR caching and revalidation.
 */

interface PageProps {
  searchParams: Promise<{
    view?: ViewType;
    page?: string;
    perPage?: string;
    business_unit_ids?: string;
  }>;
}

export default async function RequestsPage({ searchParams }: PageProps) {
  // Await the searchParams promise (required by Next.js)
  const params = await searchParams;

  // Parse URL parameters
  const page = params.page ? parseInt(params.page, 10) : 1;
  const perPage = params.perPage ? parseInt(params.perPage, 10) : 20;
  const businessUnitIds = params.business_unit_ids
    ? params.business_unit_ids.split(',').map(id => parseInt(id, 10))
    : undefined;

  // Fetch all data in parallel on the server
  const [customView, ticketsData, businessUnitsData] = await Promise.all([
    getMyCustomView(),
    getTechnicianViewsData(params.view || 'unassigned', page, perPage, businessUnitIds),
    getBusinessUnitCountsData(params.view || 'unassigned'),
  ]);

  // Determine visible tabs and default view from custom view settings
  const visibleTabs = (customView?.visibleTabs as ViewType[]) || [
    'unassigned',
    'all_unsolved',
    'my_unsolved',
    'recently_updated',
    'recently_solved',
  ];
  const defaultTab = (customView?.defaultTab as ViewType) || 'unassigned';

  // Determine the active view
  const view: ViewType = params.view || defaultTab;

  // If current view is not in visible tabs, redirect to default
  if (visibleTabs.length > 0 && !visibleTabs.includes(view)) {
    redirect(`/support-center/requests?view=${defaultTab}`);
  }

  // Provide fallback data if fetch failed (user will see loading state, SWR will retry)
  const safeTicketsData = ticketsData || {
    data: [],
    counts: {
      unassigned: 0,
      allUnsolved: 0,
      myUnsolved: 0,
      recentlyUpdated: 0,
      recentlySolved: 0,
      allYourRequests: 0,
      urgentHighPriority: 0,
      pendingRequesterResponse: 0,
      pendingSubtask: 0,
      newToday: 0,
      inProgress: 0,
    },
    filterCounts: { all: 0, parents: 0, subtasks: 0 },
    total: 0,
    page: 1,
    perPage: 20,
  };

  const safeBusinessUnitsData = businessUnitsData || {
    businessUnits: [],
    total: 0,
    unassignedCount: 0,
  };

  return (
    <RequestsListProvider
      initialData={safeTicketsData}
      initialBusinessUnitsData={safeBusinessUnitsData}
      initialView={view}
      initialPage={page}
      businessUnitIds={businessUnitIds}
      visibleTabs={visibleTabs}
    >
      <TicketsPageClient />
    </RequestsListProvider>
  );
}
