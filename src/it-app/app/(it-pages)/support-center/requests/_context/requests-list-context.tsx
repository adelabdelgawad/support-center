'use client';

/**
 * Requests List Provider
 * Provides centralized data and actions for the requests list page
 *
 * NOW SPLIT into three separate contexts to prevent unnecessary re-renders:
 * 1. RequestsListDataContext - tickets, pagination, filter counts
 * 2. RequestsListCountsContext - view counts, business unit counts
 * 3. RequestsListUIContext - active view, view changing state
 *
 * Each context independently memoizes its value, so changes in one context
 * don't cause re-renders in components that only consume the other contexts.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import type { ViewType } from '@/types/requests-list';
import type { TechnicianViewsResponse } from '@/types/requests-list';
import type { BusinessUnitCountsResponse } from '@/lib/actions/requests-list-actions';
import { RequestsListDataProvider, useRequestsListData } from './requests-list-data-context';
import { RequestsListCountsProvider, useRequestsListCounts } from './requests-list-counts-context';
import { RequestsListUIProvider, useRequestsListUI } from './requests-list-ui-context';

// Re-export types from individual contexts for backward compatibility
export type { RequestsListDataContextType, RequestsListCountsContextType, RequestsListUIContextType };

interface RequestsListProviderProps {
  children: React.ReactNode;
  initialData: TechnicianViewsResponse;
  initialBusinessUnitsData: BusinessUnitCountsResponse;
  initialView: ViewType;
  initialPage: number;
  businessUnitIds?: number[];
  visibleTabs?: ViewType[];
}

/**
 * Combined provider that wraps all three split providers
 * This maintains the same API as the original monolithic provider
 */
export function RequestsListProvider({
  children,
  initialData,
  initialBusinessUnitsData,
  initialView,
  initialPage,
  businessUnitIds,
  visibleTabs,
}: RequestsListProviderProps) {
  // Shared state for coordinating isViewChanging across contexts
  const [isViewChanging, setIsViewChanging] = useState(false);
  const lastLoadedViewRef = useRef<ViewType>(initialView);

  // Read current state from URL
  const searchParams = useSearchParams();
  const urlView = (searchParams.get('view') as ViewType) || initialView;

  // Callback for data context to notify validation state
  const onDataValidationChange = useCallback((isValidating: boolean) => {
    // Clear isViewChanging when validation completes
    if (!isValidating && isViewChanging) {
      setIsViewChanging(false);
      lastLoadedViewRef.current = urlView;
    }
  }, [isViewChanging, urlView]);

  // Callback for UI context to notify when view changes
  const onViewChange = useCallback((isChanging: boolean) => {
    setIsViewChanging(isChanging);
  }, []);

  return (
    <RequestsListUIProvider
      initialData={initialData}
      initialView={initialView}
      initialPage={initialPage}
      businessUnitIds={businessUnitIds}
      isViewChanging={isViewChanging}
      onViewChange={onViewChange}
    >
      <RequestsListDataProvider
        initialData={initialData}
        initialView={initialView}
        initialPage={initialPage}
        businessUnitIds={businessUnitIds}
        onValidationChange={onDataValidationChange}
      >
        <RequestsListCountsProvider
          initialData={initialData}
          initialBusinessUnitsData={initialBusinessUnitsData}
          initialView={initialView}
          visibleTabs={visibleTabs}
        >
          {children}
        </RequestsListCountsProvider>
      </RequestsListDataProvider>
    </RequestsListUIProvider>
  );
}

/**
 * Combined hook that returns values from all three contexts
 * Maintains backward compatibility with existing code
 */
export function useRequestsListContext() {
  const data = useRequestsListData();
  const counts = useRequestsListCounts();
  const ui = useRequestsListUI();

  // Combine all context values into a single object
  return {
    ...data,
    ...counts,
    ...ui,
  };
}

// Re-export individual hooks for granular access
export { useRequestsListData } from './requests-list-data-context';
export { useRequestsListCounts } from './requests-list-counts-context';
export { useRequestsListUI } from './requests-list-ui-context';
