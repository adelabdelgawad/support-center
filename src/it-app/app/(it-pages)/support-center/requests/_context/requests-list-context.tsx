'use client';

/**
 * Requests List Provider
 * Provides centralized data and actions for the requests list page
 *
 * Features:
 * - **Auto-revalidation**: Data refreshes every 30 seconds automatically via refreshInterval
 * - **Server-Side Rendering**: Initial data fetched on page load (NO client refetch on mount/focus/reconnect)
 * - Uses SWR for requests list, simple state hooks for counts and business units
 * - Real-time view counts and request data
 * - Background revalidation without blocking UI
 * - **URL-driven state**: Reads current view/page from URL for client-side navigation
 *
 * Architecture: SSR (initial load, no spinner) → SWR/State hooks (background refresh every 30s)
 */

import { createContext, useContext, useMemo, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRequestsList } from '@/lib/hooks/use-requests-list';
import { useViewCounts } from '@/lib/hooks/use-view-counts';
import { useAllBusinessUnits } from '@/lib/hooks/use-business-unit-counts';
import type {
  TechnicianViewsResponse,
  ViewType,
  ViewItem,
  ViewCounts,
  RequestListItem,
  TicketTypeCounts,
} from '@/types/requests-list';
import type { BusinessUnitCountsResponse } from '@/lib/actions/requests-list-actions';

interface RequestsListContextType {
  // Data - always have values (SSR provides initial data, no undefined)
  tickets: RequestListItem[];
  counts: ViewCounts;
  filterCounts: TicketTypeCounts;
  viewItems: ViewItem[];
  total: number;
  currentPage: number;
  perPage: number;
  allBusinessUnits: Array<{ id: number; name: string; count: number }>;
  unassignedCount: number;
  isBusinessUnitsValidating: boolean;

  // View settings
  activeView: ViewType;
  activeViewDisplayName: string;

  // Loading states
  isLoading: boolean;
  isValidating: boolean; // True during background refresh
  isCountsValidating: boolean; // True during view counts background refresh
  isViewChanging: boolean; // True when switching views (show skeleton)
  isCountsReady: boolean; // True when counts data is available

  // Actions
  refresh: () => Promise<void>;
  refreshCounts: () => Promise<void>;
  decrementViewCount: (view: keyof ViewCounts, amount?: number) => Promise<void>;
  incrementViewCount: (view: keyof ViewCounts, amount?: number) => Promise<void>;
}

const RequestsListContext = createContext<RequestsListContextType | undefined>(undefined);

interface RequestsListProviderProps {
  children: React.ReactNode;
  initialData: TechnicianViewsResponse;
  initialBusinessUnitsData: BusinessUnitCountsResponse;
  initialView: ViewType;
  initialPage: number;
  businessUnitIds?: number[];
  visibleTabs?: ViewType[]; // User's visible tabs from custom view
}

// Map view types to display names
const viewDisplayNames: Record<ViewType, string> = {
  // Existing views
  unassigned: 'Unassigned tickets',
  all_unsolved: 'All unsolved tickets',
  my_unsolved: 'Your unsolved tickets',
  recently_updated: 'Recently updated tickets',
  recently_solved: 'Recently solved tickets',
  // New views
  all_your_requests: 'All your requests',
  urgent_high_priority: 'Urgent / High priority',
  pending_requester_response: 'Pending requester response',
  pending_subtask: 'Pending subtask',
  new_today: 'New today',
  in_progress: 'In progress',
};

export function RequestsListProvider({
  children,
  initialData,
  initialBusinessUnitsData,
  initialView,
  initialPage,
  businessUnitIds: initialBusinessUnitIds,
  visibleTabs,
}: RequestsListProviderProps) {
  // HYDRATION GUARD: Track first render to ensure SSR data is used during hydration
  // This prevents hydration mismatch when SWR cache has stale data
  const isFirstRenderRef = useRef(true);
  const [isHydrated, setIsHydrated] = useState(false);

  // Mark as hydrated after first client render
  useEffect(() => {
    isFirstRenderRef.current = false;
    setIsHydrated(true);
  }, []);

  // Read current state from URL for client-side navigation support
  // This ensures data updates when URL changes via router.push()
  const searchParams = useSearchParams();

  // Parse URL parameters - fall back to initial values from SSR
  const urlView = (searchParams.get('view') as ViewType) || initialView;
  const urlPage = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : initialPage;
  const urlPerPage = searchParams.get('perPage') ? parseInt(searchParams.get('perPage')!, 10) : initialData.perPage;
  const urlUnread = searchParams.get('unread') === 'true';
  const urlBusinessUnitIds = useMemo(() => {
    const param = searchParams.get('business_unit_ids');
    if (param) {
      return param.split(',').map(id => parseInt(id, 10));
    }
    return initialBusinessUnitIds;
  }, [searchParams, initialBusinessUnitIds]);

  // Always use SSR data as fallback - SWR will use it only when cache is empty
  // This ensures no client-side fetch on initial page load
  const fallbackData = initialData;
  const fallbackBusinessUnitsData = initialBusinessUnitsData;

  // Track view changing state for skeleton display
  // This is true when URL view differs from the last loaded view
  const [isViewChanging, setIsViewChanging] = useState(false);
  const lastLoadedViewRef = useRef<ViewType>(initialView);

  // Use SWR hook with auto-revalidation every 30 seconds for tickets
  // Pass URL-derived values so data updates on client-side navigation
  const {
    tickets,
    filterCounts,
    total,
    currentPage,
    perPage,
    isLoading,
    isValidating,
    refresh: refreshTickets,
  } = useRequestsList(
    urlView,
    urlPage,
    urlPerPage,
    fallbackData,
    urlBusinessUnitIds
  );

  // Use dedicated state hook for view counts with optimistic updates (auto-refresh every 30s)
  const {
    counts,
    isCountsReady,
    isValidating: isCountsValidating,
    refreshCounts,
    decrementCount,
    incrementCount,
  } = useViewCounts(initialData.counts);

  // Use state hook for business units with server-side data as fallback (auto-refresh every 30s)
  // Pass current view (from URL) to filter counts by the active view
  const {
    allBusinessUnits,
    unassignedCount,
    isValidating: isBusinessUnitsValidating,
    refresh: refreshBusinessUnits,
  } = useAllBusinessUnits(urlView, fallbackBusinessUnitsData);

  // Track previous URL state to detect navigation changes
  const prevUrlStateRef = useRef<string | null>(null);
  const currentUrlState = `${urlView}:${urlPage}:${urlPerPage}:${urlBusinessUnitIds?.join(',') || ''}:${urlUnread}`;
  const hasCheckedReturnFromDetails = useRef(false);

  // Save current URL to sessionStorage for back navigation from details page
  useEffect(() => {
    // Build the full URL with all params
    const params = new URLSearchParams();
    params.set('view', urlView);
    params.set('page', urlPage.toString());
    params.set('perPage', urlPerPage.toString());
    if (urlBusinessUnitIds && urlBusinessUnitIds.length > 0) {
      params.set('business_unit_ids', urlBusinessUnitIds.join(','));
    }
    if (urlUnread) {
      params.set('unread', 'true');
    }
    const fullUrl = `/support-center/requests?${params.toString()}`;
    sessionStorage.setItem('requests-list-url', fullUrl);
  }, [urlView, urlPage, urlPerPage, urlBusinessUnitIds, urlUnread]);

  // Store refresh functions in refs to avoid dependency issues
  const refreshTicketsRef = useRef(refreshTickets);
  const refreshBusinessUnitsRef = useRef(refreshBusinessUnits);
  const refreshCountsRef = useRef(refreshCounts);
  refreshTicketsRef.current = refreshTickets;
  refreshBusinessUnitsRef.current = refreshBusinessUnits;
  refreshCountsRef.current = refreshCounts;

  // Check if returning from details page and trigger refresh
  useEffect(() => {
    if (hasCheckedReturnFromDetails.current) return;
    hasCheckedReturnFromDetails.current = true;

    // Check if we're returning from a details page
    const returnFromDetails = sessionStorage.getItem('returning-from-details');
    if (returnFromDetails === 'true') {
      sessionStorage.removeItem('returning-from-details');
      // Trigger refresh to get latest data after viewing details
      refreshTicketsRef.current();
      refreshBusinessUnitsRef.current();
      refreshCountsRef.current();
    }
  }, []);

  // Trigger refresh when URL changes (client-side navigation)
  // This is needed because revalidateIfStale: false prevents auto-fetch on key change
  useEffect(() => {
    // Skip initial render (SSR data is already fresh)
    if (prevUrlStateRef.current === null) {
      prevUrlStateRef.current = currentUrlState;
      return;
    }

    // If URL state changed, trigger refresh
    if (prevUrlStateRef.current !== currentUrlState) {
      const prevView = prevUrlStateRef.current.split(':')[0];
      const newView = currentUrlState.split(':')[0];

      prevUrlStateRef.current = currentUrlState;

      // If view changed (not just page/filter), show skeleton
      if (prevView !== newView) {
        setIsViewChanging(true);
      }

      // Refresh tickets and business units (counts are global, don't need refresh per view)
      refreshTicketsRef.current();
      refreshBusinessUnitsRef.current();
    }
  }, [currentUrlState]);

  // Clear isViewChanging when data loads for the new view
  useEffect(() => {
    // When isValidating becomes false and we were changing views, clear the flag
    if (!isValidating && isViewChanging) {
      setIsViewChanging(false);
      lastLoadedViewRef.current = urlView;
    }
  }, [isValidating, isViewChanging, urlView]);

  // HYDRATION SAFETY: Force SSR data during first render to prevent hydration mismatch
  // SWR cache might have stale data that differs from fresh SSR data
  // After hydration completes, we can use the potentially newer SWR data
  const safeCounts = isFirstRenderRef.current ? initialData.counts : (counts ?? initialData.counts);
  const safeFilterCounts = isFirstRenderRef.current ? initialData.filterCounts : (filterCounts ?? initialData.filterCounts);
  const safeTotal = isFirstRenderRef.current ? initialData.total : (total ?? initialData.total);
  const safeUnassignedCount = isFirstRenderRef.current ? initialBusinessUnitsData.unassignedCount : (unassignedCount ?? initialBusinessUnitsData.unassignedCount);
  const safeTickets = isFirstRenderRef.current ? initialData.data : tickets;
  const safeAllBusinessUnits = isFirstRenderRef.current ? initialBusinessUnitsData.businessUnits : allBusinessUnits;

  // Build view items from counts - filter by visible tabs
  const viewItems: ViewItem[] = useMemo(() => {
    // All available view items - use safeCounts to ensure hydration match
    const allViewItems = [
      // Existing views
      { name: viewDisplayNames.unassigned, count: safeCounts.unassigned, viewType: 'unassigned' as ViewType },
      { name: viewDisplayNames.all_unsolved, count: safeCounts.allUnsolved, viewType: 'all_unsolved' as ViewType },
      { name: viewDisplayNames.my_unsolved, count: safeCounts.myUnsolved, viewType: 'my_unsolved' as ViewType },
      { name: viewDisplayNames.recently_updated, count: safeCounts.recentlyUpdated, viewType: 'recently_updated' as ViewType },
      { name: viewDisplayNames.recently_solved, count: safeCounts.recentlySolved, viewType: 'recently_solved' as ViewType },
      // New views
      { name: viewDisplayNames.all_your_requests, count: safeCounts.allYourRequests, viewType: 'all_your_requests' as ViewType },
      { name: viewDisplayNames.urgent_high_priority, count: safeCounts.urgentHighPriority, viewType: 'urgent_high_priority' as ViewType },
      { name: viewDisplayNames.pending_requester_response, count: safeCounts.pendingRequesterResponse, viewType: 'pending_requester_response' as ViewType },
      { name: viewDisplayNames.pending_subtask, count: safeCounts.pendingSubtask, viewType: 'pending_subtask' as ViewType },
      { name: viewDisplayNames.new_today, count: safeCounts.newToday, viewType: 'new_today' as ViewType },
      { name: viewDisplayNames.in_progress, count: safeCounts.inProgress, viewType: 'in_progress' as ViewType },
    ];

    // Filter by visible tabs if provided
    if (visibleTabs && visibleTabs.length > 0) {
      return allViewItems
        .filter(item => visibleTabs.includes(item.viewType))
        .map(({ name, count }) => ({ name, count }));
    }

    // Return all items if no filter
    return allViewItems.map(({ name, count }) => ({ name, count }));
  }, [safeCounts, visibleTabs]);

  // Get current view display name (using URL-derived view for client-side nav support)
  const activeViewDisplayName = viewDisplayNames[urlView];

  // Combined refresh function that refreshes tickets, counts, and business units
  const refresh = useCallback(async () => {
    await Promise.all([refreshTickets(), refreshCounts(), refreshBusinessUnits()]);
  }, [refreshTickets, refreshCounts, refreshBusinessUnits]);

  // Memoize the context value to prevent infinite re-renders
  // HYDRATION SAFETY: Use safe* values which always have SSR fallbacks
  const value: RequestsListContextType = useMemo(
    () => ({
      // Data - use safe values to ensure hydration match
      tickets: safeTickets,
      counts: safeCounts,
      filterCounts: safeFilterCounts,
      viewItems,
      total: safeTotal,
      currentPage,
      perPage,
      allBusinessUnits: safeAllBusinessUnits,
      unassignedCount: safeUnassignedCount,
      isBusinessUnitsValidating,

      // View settings (using URL-derived view for client-side nav support)
      activeView: urlView,
      activeViewDisplayName,

      // Loading states
      isLoading,
      isValidating,
      isCountsValidating,
      isViewChanging,
      isCountsReady,

      // Actions
      refresh,
      refreshCounts,
      decrementViewCount: decrementCount,
      incrementViewCount: incrementCount,
    }),
    [
      safeTickets,
      safeCounts,
      safeFilterCounts,
      viewItems,
      safeTotal,
      currentPage,
      perPage,
      safeAllBusinessUnits,
      safeUnassignedCount,
      isBusinessUnitsValidating,
      urlView,
      activeViewDisplayName,
      isLoading,
      isValidating,
      isCountsValidating,
      isViewChanging,
      isCountsReady,
      refresh,
      refreshCounts,
      decrementCount,
      incrementCount,
    ]
  );

  return (
    <RequestsListContext.Provider value={value}>
      {children}
    </RequestsListContext.Provider>
  );
}

export function useRequestsListContext() {
  const context = useContext(RequestsListContext);
  if (context === undefined) {
    throw new Error('useRequestsListContext must be used within a RequestsListProvider');
  }
  return context;
}
