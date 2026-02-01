'use client';

/**
 * Requests List Data Context
 * Provides ticket list data and pagination state
 *
 * Split from monolithic RequestsListProvider to prevent unnecessary re-renders
 * when counts or UI state changes.
 */

import { createContext, useContext, useMemo, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRequestsList } from '@/lib/hooks/use-requests-list';
import type {
  RequestListItem,
  ViewType,
  TicketTypeCounts,
} from '@/types/requests-list';
import type { TechnicianViewsResponse } from '@/types/requests-list';

export interface RequestsListDataContextType {
  // Ticket data
  tickets: RequestListItem[];
  filterCounts: TicketTypeCounts;
  total: number;
  currentPage: number;
  perPage: number;

  // Loading states
  isLoading: boolean;
  isValidating: boolean; // True during background refresh

  // Actions
  refresh: () => Promise<void>;
}

const RequestsListDataContext = createContext<RequestsListDataContextType | undefined>(undefined);

interface RequestsListDataProviderProps {
  children: React.ReactNode;
  initialData: TechnicianViewsResponse;
  initialView: ViewType;
  initialPage: number;
  businessUnitIds?: number[];
}

export function RequestsListDataProvider({
  children,
  initialData,
  initialView,
  initialPage,
  businessUnitIds: initialBusinessUnitIds,
}: RequestsListDataProviderProps) {
  // HYDRATION GUARD: Track first render to ensure SSR data is used during hydration
  const isFirstRenderRef = useRef(true);

  useEffect(() => {
    isFirstRenderRef.current = false;
  }, []);

  // Read current state from URL for client-side navigation support
  const searchParams = useSearchParams();

  // Parse URL parameters - fall back to initial values from SSR
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

  // Always use SSR data as fallback - SWR will use it only when cache is empty
  const fallbackData = initialData;

  // Use SWR hook with auto-revalidation every 30 seconds for tickets
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

  // Store refresh function in ref for external access
  const refreshTicketsRef = useRef(refreshTickets);

  // Update ref when refresh function changes
  useEffect(() => {
    refreshTicketsRef.current = refreshTickets;
  }, [refreshTickets]);

  // Check if returning from details page and trigger refresh
  const hasCheckedReturnFromDetails = useRef(false);
  useEffect(() => {
    if (hasCheckedReturnFromDetails.current) return;
    hasCheckedReturnFromDetails.current = true;

    const returnFromDetails = sessionStorage.getItem('returning-from-details');
    if (returnFromDetails === 'true') {
      sessionStorage.removeItem('returning-from-details');
      refreshTicketsRef.current();
    }
  }, []);

  // HYDRATION SAFETY: Force SSR data during first render to prevent hydration mismatch
  // eslint-disable-next-line react-hooks/rules-of-hooks, react-hooks/refs
  const safeFilterCounts = isFirstRenderRef.current
    ? initialData.filterCounts
    : (filterCounts ?? initialData.filterCounts);
  // eslint-disable-next-line react-hooks/rules-of-hooks, react-hooks/refs
  const safeTotal = isFirstRenderRef.current
    ? initialData.total
    : (total ?? initialData.total);
  // eslint-disable-next-line react-hooks/rules-of-hooks, react-hooks/refs
  const safeTickets = isFirstRenderRef.current
    ? initialData.data
    : tickets;

  // Combined refresh function
  const refresh = useMemo(
    () => async () => {
      await refreshTickets();
    },
    [refreshTickets]
  );

  const value: RequestsListDataContextType = useMemo(
    () => ({
      tickets: safeTickets,
      filterCounts: safeFilterCounts,
      total: safeTotal,
      currentPage,
      perPage,
      isLoading,
      isValidating,
      refresh,
    }),
    [
      safeTickets,
      safeFilterCounts,
      safeTotal,
      currentPage,
      perPage,
      isLoading,
      isValidating,
      refresh,
    ]
  );

  return (
    <RequestsListDataContext.Provider value={value}>
      {children}
    </RequestsListDataContext.Provider>
  );
}

export function useRequestsListData() {
  const context = useContext(RequestsListDataContext);
  if (context === undefined) {
    throw new Error('useRequestsListData must be used within a RequestsListDataProvider');
  }
  return context;
}
