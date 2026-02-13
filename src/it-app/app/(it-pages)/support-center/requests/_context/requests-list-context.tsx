'use client';

import { createContext, useContext, useMemo, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { getTechnicianViews, getBusinessUnitCounts } from '@/lib/api/requests-list';
import { cacheKeys } from '@/lib/swr/cache-keys';
import type {
  RequestListItem,
  ViewType,
  TicketTypeCounts,
  ViewCounts,
  ViewItem,
  TechnicianViewsResponse,
} from '@/types/requests-list';
import type { BusinessUnitCountsResponse } from '@/lib/actions/requests-list-actions';

// Single source of truth for view display names
export const viewDisplayNames: Record<string, string> = {
  unassigned: 'Unassigned tickets',
  all_unsolved: 'All unsolved tickets',
  my_unsolved: 'Your unsolved tickets',
  recently_updated: 'Recently updated tickets',
  recently_solved: 'Recently solved tickets',
  all_your_requests: 'All your requests',
  urgent_high_priority: 'Urgent / High priority',
  pending_requester_response: 'Pending requester response',
  pending_subtask: 'Pending subtask',
  new_today: 'New today',
  in_progress: 'In progress',
  all_tickets: 'All tickets',
  all_solved: 'All solved tickets',
};

interface RequestsListContextType {
  // Ticket data
  tickets: RequestListItem[];
  filterCounts: TicketTypeCounts;
  counts: ViewCounts;
  total: number;
  currentPage: number;
  perPage: number;

  // View state
  activeView: ViewType;
  activeViewDisplayName: string;
  viewItems: ViewItem[];

  // Business units
  allBusinessUnits: Array<{ id: number; name: string; count: number }>;
  unassignedCount: number;

  // Loading states
  isLoading: boolean;
  isValidating: boolean;
  isCountsReady: boolean;
  isBusinessUnitsValidating: boolean;

  // Actions
  refresh: () => Promise<void>;
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
  visibleTabs?: ViewType[];
}

export function RequestsListProvider({
  children,
  initialData,
  initialBusinessUnitsData,
  initialView,
  initialPage,
  businessUnitIds: initialBusinessUnitIds,
  visibleTabs,
}: RequestsListProviderProps) {
  // Read current state from URL
  const searchParams = useSearchParams();

  const urlView = (searchParams.get('view') as ViewType) || initialView;
  const urlPage = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : initialPage;
  const urlPerPage = searchParams.get('perPage') ? parseInt(searchParams.get('perPage')!, 10) : initialData.perPage;
  const urlBusinessUnitIds = useMemo(() => {
    const param = searchParams.get('business_unit_ids');
    if (param) {
      return param.split(',').map(id => parseInt(id, 10));
    }
    return initialBusinessUnitIds;
  }, [searchParams, initialBusinessUnitIds]);
  const urlUnread = searchParams.get('unread') === 'true';

  // Save current URL to sessionStorage for back navigation from details page
  useEffect(() => {
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

  // --- Tickets SWR ---
  const {
    data: ticketsData,
    isLoading: ticketsIsLoading,
    isValidating: ticketsIsValidating,
    mutate: mutateTickets,
  } = useSWR<TechnicianViewsResponse>(
    cacheKeys.technicianViews(urlView, urlPage, urlPerPage, urlBusinessUnitIds),
    () => getTechnicianViews(urlView, urlPage, urlPerPage, urlBusinessUnitIds),
    {
      fallbackData: initialData,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      refreshInterval: 60000,
      dedupingInterval: 2000,
      keepPreviousData: true,
    }
  );

  // --- Business Units SWR ---
  const {
    data: businessUnitsData,
    isValidating: businessUnitsIsValidating,
    mutate: mutateBusinessUnits,
  } = useSWR<BusinessUnitCountsResponse>(
    cacheKeys.businessUnitCounts(urlView),
    () => getBusinessUnitCounts(urlView),
    {
      fallbackData: initialBusinessUnitsData,
      revalidateOnMount: !initialBusinessUnitsData,
      revalidateOnFocus: false,
      refreshInterval: 60000,
      dedupingInterval: 10000,
      keepPreviousData: true,
    }
  );

  // --- Return-from-details refresh (single check) ---
  const hasCheckedReturn = useRef(false);
  useEffect(() => {
    if (hasCheckedReturn.current) return;
    hasCheckedReturn.current = true;

    const flag = sessionStorage.getItem('returning-from-details');
    if (flag === 'true') {
      sessionStorage.removeItem('returning-from-details');
      mutateTickets();
      mutateBusinessUnits();
    }
  }, [mutateTickets, mutateBusinessUnits]);

  // --- Derive values from SWR data ---
  const resolvedTickets = ticketsData ?? initialData;

  const tickets = resolvedTickets.data;
  const filterCounts = resolvedTickets.filterCounts;
  const counts = resolvedTickets.counts;
  const total = resolvedTickets.total;
  const currentPage = resolvedTickets.page ?? urlPage;
  const perPage = resolvedTickets.perPage ?? urlPerPage;

  const hasData = ticketsData !== undefined;
  const isLoading = !hasData && ticketsIsLoading;

  const allBusinessUnits = businessUnitsData?.businessUnits ?? initialBusinessUnitsData.businessUnits;
  const unassignedCount = businessUnitsData?.unassignedCount ?? initialBusinessUnitsData.unassignedCount;

  // --- Optimistic count updates ---
  const [countOverrides, setCountOverrides] = useState<Partial<ViewCounts>>({});

  // Reset overrides when SWR data changes (server has latest)
  const countsRef = useRef(counts);
  useEffect(() => {
    if (counts !== countsRef.current) {
      countsRef.current = counts;
      setCountOverrides({});
    }
  }, [counts]);

  const effectiveCounts = useMemo(() => {
    if (Object.keys(countOverrides).length === 0) return counts;
    return { ...counts, ...countOverrides };
  }, [counts, countOverrides]);

  const decrementViewCount = useCallback(async (view: keyof ViewCounts, amount: number = 1) => {
    setCountOverrides(prev => ({
      ...prev,
      [view]: Math.max(0, (prev[view] ?? counts[view]) - amount),
    }));
  }, [counts]);

  const incrementViewCount = useCallback(async (view: keyof ViewCounts, amount: number = 1) => {
    setCountOverrides(prev => ({
      ...prev,
      [view]: (prev[view] ?? counts[view]) + amount,
    }));
  }, [counts]);

  // --- View items ---
  const activeViewDisplayName = viewDisplayNames[urlView] ?? urlView;

  const viewItems: ViewItem[] = useMemo(() => {
    const allViewItems = [
      { name: viewDisplayNames.unassigned, count: effectiveCounts.unassigned, viewType: 'unassigned' },
      { name: viewDisplayNames.all_unsolved, count: effectiveCounts.allUnsolved, viewType: 'all_unsolved' },
      { name: viewDisplayNames.my_unsolved, count: effectiveCounts.myUnsolved, viewType: 'my_unsolved' },
      { name: viewDisplayNames.recently_updated, count: effectiveCounts.recentlyUpdated, viewType: 'recently_updated' },
      { name: viewDisplayNames.recently_solved, count: effectiveCounts.recentlySolved, viewType: 'recently_solved' },
      { name: viewDisplayNames.all_your_requests, count: effectiveCounts.allYourRequests, viewType: 'all_your_requests' },
      { name: viewDisplayNames.urgent_high_priority, count: effectiveCounts.urgentHighPriority, viewType: 'urgent_high_priority' },
      { name: viewDisplayNames.pending_requester_response, count: effectiveCounts.pendingRequesterResponse, viewType: 'pending_requester_response' },
      { name: viewDisplayNames.pending_subtask, count: effectiveCounts.pendingSubtask, viewType: 'pending_subtask' },
      { name: viewDisplayNames.new_today, count: effectiveCounts.newToday, viewType: 'new_today' },
      { name: viewDisplayNames.in_progress, count: effectiveCounts.inProgress, viewType: 'in_progress' },
      { name: viewDisplayNames.all_tickets, count: effectiveCounts.allTickets, viewType: 'all_tickets' },
      { name: viewDisplayNames.all_solved, count: effectiveCounts.allSolved, viewType: 'all_solved' },
    ];

    if (visibleTabs && visibleTabs.length > 0) {
      return allViewItems
        .filter(item => visibleTabs.includes(item.viewType as ViewType))
        .map(({ name, count }) => ({ name, count }));
    }

    return allViewItems.map(({ name, count }) => ({ name, count }));
  }, [effectiveCounts, visibleTabs]);

  // --- Refresh ---
  const refresh = useCallback(async () => {
    await Promise.all([mutateTickets(), mutateBusinessUnits()]);
  }, [mutateTickets, mutateBusinessUnits]);

  // --- Context value ---
  const value: RequestsListContextType = useMemo(
    () => ({
      tickets,
      filterCounts,
      counts: effectiveCounts,
      total,
      currentPage,
      perPage,
      activeView: urlView,
      activeViewDisplayName,
      viewItems,
      allBusinessUnits,
      unassignedCount,
      isLoading,
      isValidating: ticketsIsValidating,
      isCountsReady: true,
      isBusinessUnitsValidating: businessUnitsIsValidating,
      refresh,
      decrementViewCount,
      incrementViewCount,
    }),
    [
      tickets,
      filterCounts,
      effectiveCounts,
      total,
      currentPage,
      perPage,
      urlView,
      activeViewDisplayName,
      viewItems,
      allBusinessUnits,
      unassignedCount,
      isLoading,
      ticketsIsValidating,
      businessUnitsIsValidating,
      refresh,
      decrementViewCount,
      incrementViewCount,
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
