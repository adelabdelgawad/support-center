import { redirect } from 'next/navigation';
import { getMyCustomView } from '@/lib/actions/custom-views.actions';
import { getTicketsConsolidated } from '@/lib/actions/requests.actions';
import TicketsTable from './_components/table/tickets-table';
import type { ViewType } from '@/lib/types/api/requests';

export const metadata = {
  title: 'Requests',
  description: 'View and manage service requests',
};

/**
 * Server Component: Requests Page
 *
 * Simplified SSR pattern - all data fetched on server:
 * - Custom view settings (visible tabs, default view)
 * - Consolidated tickets data (technician views + business unit counts)
 *
 * Data is passed to TicketsTable for client-side state management.
 */

interface PageProps {
  searchParams: Promise<{
    view?: string;
    assigned_to_me?: string;
    page?: string;
    limit?: string;
    business_unit_ids?: string;
  }>;
}

export default async function RequestsPage({ searchParams }: PageProps) {
  // Await searchParams promise (required by Next.js)
  const params = await searchParams;

  // Parse URL parameters
  const page = params.page ? parseInt(params.page, 10) : 1;
  const perPage = params.limit ? parseInt(params.limit, 10) : 10;
  const businessUnitIds = params.business_unit_ids
    ? params.business_unit_ids.split(',').map(id => parseInt(id, 10))
    : undefined;
  const assignedToMe = params.assigned_to_me === 'true';

  // View param may be comma-separated for multi-select; use first for backend query
  const viewParam = params.view || '';
  const firstView = (viewParam.split(',')[0] || 'unassigned') as ViewType;

  // Fetch all data in parallel on server
  const [customView, ticketsData] = await Promise.all([
    getMyCustomView(),
    getTicketsConsolidated(firstView, page, perPage, businessUnitIds, assignedToMe),
  ]);

  // Determine visible tabs and default view from custom view settings
  const visibleViews = (customView?.visibleTabs as ViewType[]) || [
    'unassigned',
    'all_unsolved',
    'my_unsolved',
    'recently_updated',
    'recently_solved',
  ];
  const defaultTab = (customView?.defaultTab as ViewType) || 'unassigned';

  // Determine active view (first selected view from URL or default)
  const view: ViewType = firstView || defaultTab;

  // If current view is not in visible tabs, redirect to default
  if (visibleViews.length > 0 && !visibleViews.includes(view)) {
    redirect(`/support-center/requests?view=${defaultTab}`);
  }

  // Provide fallback data if fetch failed (camelCase to match CamelModel API response)
  const safeInitialData = ticketsData || {
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
      allTickets: 0,
      allSolved: 0,
    },
    filterCounts: { all: 0, parents: 0, subtasks: 0 },
    total: 0,
    page: 1,
    perPage: 10,
    businessUnits: [],
    businessUnitsTotal: 0,
    unassignedCount: 0,
  };

  return (
    <TicketsTable
      initialData={safeInitialData}
      visibleViews={visibleViews}
      defaultView={defaultTab}
      initialView={view}
      initialPage={page}
      initialPerPage={perPage}
      initialBusinessUnitIds={businessUnitIds}
    />
  );
}
