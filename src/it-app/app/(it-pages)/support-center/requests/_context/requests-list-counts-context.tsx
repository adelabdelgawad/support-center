'use client';

/**
 * Requests List Counts Context
 * Provides view counts and business unit counts
 *
 * Split from monolithic RequestsListProvider to prevent unnecessary re-renders
 * when ticket data or UI state changes.
 *
 * Now receives view counts from data provider instead of fetching separately,
 * eliminating the redundant double-fetch of view counts.
 */

import { createContext, useContext, useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAllBusinessUnits } from '@/lib/hooks/use-business-unit-counts';
import type { ViewCounts, ViewItem } from '@/types/requests-list';
import type { BusinessUnitCountsResponse } from '@/lib/actions/requests-list-actions';

export interface RequestsListCountsContextType {
  // Counts data
  counts: ViewCounts;
  viewItems: ViewItem[];
  allBusinessUnits: Array<{ id: number; name: string; count: number }>;
  unassignedCount: number;

  // Loading states
  isCountsReady: boolean;
  isCountsValidating: boolean; // True during view counts background refresh
  isBusinessUnitsValidating: boolean;

  // Actions
  refreshCounts: () => Promise<void>;
  decrementViewCount: (view: keyof ViewCounts, amount?: number) => Promise<void>;
  incrementViewCount: (view: keyof ViewCounts, amount?: number) => Promise<void>;
}

const RequestsListCountsContext = createContext<RequestsListCountsContextType | undefined>(undefined);

// Map view types to display names
const viewDisplayNames: Record<string, string> = {
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
  // Additional views
  all_tickets: 'All tickets',
  all_solved: 'All solved tickets',
};

interface RequestsListCountsProviderProps {
  children: React.ReactNode;
  initialData: { counts: ViewCounts };
  initialBusinessUnitsData: BusinessUnitCountsResponse;
  initialView: string;
  visibleTabs?: string[]; // User's visible tabs from custom view
  countsFromData?: ViewCounts; // Counts from data provider (eliminates double-fetch)
}

export function RequestsListCountsProvider({
  children,
  initialData,
  initialBusinessUnitsData,
  initialView,
  visibleTabs,
  countsFromData,
}: RequestsListCountsProviderProps) {
  // HYDRATION GUARD: Track first render to ensure SSR data is used during hydration
  const isFirstRenderRef = useRef(true);

  useEffect(() => {
    isFirstRenderRef.current = false;
  }, []);

  // Read current view from URL
  const searchParams = useSearchParams();
  const urlView = searchParams.get('view') || initialView;

  // Local state for view counts with optimistic updates
  // Initialized from countsFromData (from data provider), falling back to initialData.counts
  const [counts, setCounts] = useState<ViewCounts>(
    countsFromData ?? initialData.counts
  );

  // Sync local state when countsFromData changes (e.g., after SWR refresh)
  useEffect(() => {
    if (countsFromData) {
      setCounts(countsFromData);
    }
  }, [countsFromData]);

  // Counts are ready when we have data from either source
  const isCountsReady = counts !== undefined;
  const isCountsValidating = false; // No separate fetch, so no validating state

  // Optimistic update functions
  const decrementCount = useCallback(async (view: keyof ViewCounts, amount: number = 1) => {
    setCounts(prev => ({
      ...prev,
      [view]: Math.max(0, prev[view] - amount),
    }));
  }, []);

  const incrementCount = useCallback(async (view: keyof ViewCounts, amount: number = 1) => {
    setCounts(prev => ({
      ...prev,
      [view]: prev[view] + amount,
    }));
  }, []);

  // Refresh counts is now a no-op - counts update when tickets refresh
  const refreshCounts = useCallback(async () => {
    // Counts are tied to tickets refresh, no separate action needed
  }, []);

  // Use state hook for business units with server-side data as fallback (auto-refresh every 30s)
  const {
    allBusinessUnits,
    unassignedCount,
    isValidating: isBusinessUnitsValidating,
    refresh: refreshBusinessUnits,
  } = useAllBusinessUnits(urlView, initialBusinessUnitsData);

  // Store refresh function in ref
  const refreshBusinessUnitsRef = useRef(refreshBusinessUnits);

  // Update ref when refresh function changes
  useEffect(() => {
    refreshBusinessUnitsRef.current = refreshBusinessUnits;
  }, [refreshBusinessUnits]);

  // Check if returning from details page and trigger refresh
  const hasCheckedReturnFromDetails = useRef(false);
  useEffect(() => {
    if (hasCheckedReturnFromDetails.current) return;
    hasCheckedReturnFromDetails.current = true;

    const returnFromDetails = sessionStorage.getItem('returning-from-details');
    if (returnFromDetails === 'true') {
      sessionStorage.removeItem('returning-from-details');
      refreshBusinessUnitsRef.current();
    }
  }, []);

  // HYDRATION SAFETY: Force SSR data during first render to prevent hydration mismatch
  // eslint-disable-next-line react-hooks/rules-of-hooks, react-hooks/refs
  const safeCounts = isFirstRenderRef.current
    ? initialData.counts
    : (counts ?? initialData.counts);
  // eslint-disable-next-line react-hooks/rules-of-hooks, react-hooks/refs
  const safeUnassignedCount = isFirstRenderRef.current
    ? initialBusinessUnitsData.unassignedCount
    : (unassignedCount ?? initialBusinessUnitsData.unassignedCount);
  // eslint-disable-next-line react-hooks/rules-of-hooks, react-hooks/refs
  const safeAllBusinessUnits = isFirstRenderRef.current
    ? initialBusinessUnitsData.businessUnits
    : (allBusinessUnits.length > 0 ? allBusinessUnits : initialBusinessUnitsData.businessUnits);

  // Build view items from counts - filter by visible tabs
  const viewItems: ViewItem[] = useMemo(() => {
    // All available view items - use safeCounts to ensure hydration match
    const allViewItems = [
      // Existing views
      { name: viewDisplayNames.unassigned, count: safeCounts.unassigned, viewType: 'unassigned' },
      { name: viewDisplayNames.all_unsolved, count: safeCounts.allUnsolved, viewType: 'all_unsolved' },
      { name: viewDisplayNames.my_unsolved, count: safeCounts.myUnsolved, viewType: 'my_unsolved' },
      { name: viewDisplayNames.recently_updated, count: safeCounts.recentlyUpdated, viewType: 'recently_updated' },
      { name: viewDisplayNames.recently_solved, count: safeCounts.recentlySolved, viewType: 'recently_solved' },
      // New views
      { name: viewDisplayNames.all_your_requests, count: safeCounts.allYourRequests, viewType: 'all_your_requests' },
      { name: viewDisplayNames.urgent_high_priority, count: safeCounts.urgentHighPriority, viewType: 'urgent_high_priority' },
      { name: viewDisplayNames.pending_requester_response, count: safeCounts.pendingRequesterResponse, viewType: 'pending_requester_response' },
      { name: viewDisplayNames.pending_subtask, count: safeCounts.pendingSubtask, viewType: 'pending_subtask' },
      { name: viewDisplayNames.new_today, count: safeCounts.newToday, viewType: 'new_today' },
      { name: viewDisplayNames.in_progress, count: safeCounts.inProgress, viewType: 'in_progress' },
      // Additional views
      { name: viewDisplayNames.all_tickets, count: safeCounts.allTickets, viewType: 'all_tickets' },
      { name: viewDisplayNames.all_solved, count: safeCounts.allSolved, viewType: 'all_solved' },
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

  const value: RequestsListCountsContextType = useMemo(
    () => ({
      counts: safeCounts,
      viewItems,
      allBusinessUnits: safeAllBusinessUnits,
      unassignedCount: safeUnassignedCount,
      isCountsReady,
      isCountsValidating,
      isBusinessUnitsValidating,
      refreshCounts,
      decrementViewCount: decrementCount,
      incrementViewCount: incrementCount,
    }),
    [
      safeCounts,
      viewItems,
      safeAllBusinessUnits,
      safeUnassignedCount,
      isCountsReady,
      isCountsValidating,
      isBusinessUnitsValidating,
      refreshCounts,
      decrementCount,
      incrementCount,
    ]
  );

  return (
    <RequestsListCountsContext.Provider value={value}>
      {children}
    </RequestsListCountsContext.Provider>
  );
}

export function useRequestsListCounts() {
  const context = useContext(RequestsListCountsContext);
  if (context === undefined) {
    throw new Error('useRequestsListCounts must be used within a RequestsListCountsProvider');
  }
  return context;
}
