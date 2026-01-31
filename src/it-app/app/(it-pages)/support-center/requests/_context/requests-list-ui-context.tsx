'use client';

/**
 * Requests List UI Context
 * Provides UI state for the requests list page (view, navigation state)
 *
 * Split from monolithic RequestsListProvider to prevent unnecessary re-renders
 * when data changes.
 */

import { createContext, useContext, useMemo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import type { ViewType } from '@/types/requests-list';
import type { TechnicianViewsResponse } from '@/types/requests-list';

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

export interface RequestsListUIContextType {
  // View settings
  activeView: ViewType;
  activeViewDisplayName: string;
}

const RequestsListUIContext = createContext<RequestsListUIContextType | undefined>(undefined);

interface RequestsListUIProviderProps {
  children: React.ReactNode;
  initialData: TechnicianViewsResponse;
  initialView: ViewType;
  initialPage: number;
  businessUnitIds?: number[];
}

export function RequestsListUIProvider({
  children,
  initialData,
  initialView,
  initialPage,
  businessUnitIds: initialBusinessUnitIds,
}: RequestsListUIProviderProps) {
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

  // Get current view display name
  const activeViewDisplayName = viewDisplayNames[urlView];

  const value: RequestsListUIContextType = useMemo(
    () => ({
      activeView: urlView,
      activeViewDisplayName,
    }),
    [urlView, activeViewDisplayName]
  );

  return (
    <RequestsListUIContext.Provider value={value}>
      {children}
    </RequestsListUIContext.Provider>
  );
}

export function useRequestsListUI() {
  const context = useContext(RequestsListUIContext);
  if (context === undefined) {
    throw new Error('useRequestsListUI must be used within a RequestsListUIProvider');
  }
  return context;
}
