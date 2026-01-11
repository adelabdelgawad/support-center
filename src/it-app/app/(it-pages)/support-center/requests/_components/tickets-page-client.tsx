'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { TicketsPagination } from '@/components/tickets/pagination';
import { TicketsSidebar } from './tickets-sidebar';
import { TicketsHeader } from './tickets-header';
import { TicketsTable } from './tickets-table';
import { BulkStatusChangeDialog } from './bulk-status-change-dialog';
import { BusinessUnitCards } from './business-unit-cards';
import { CustomViewDialog } from './custom-view-dialog';
import { TicketTypeFilter, type TicketTypeFilter as TicketFilterType } from './ticket-type-filter';
import { useRequestsListContext } from '../_context/requests-list-context';
import { useTicketTypeCounts } from '@/lib/hooks/use-ticket-type-counts';
import { useViewport } from '@/hooks/use-mobile';
import type { ViewType } from '@/types/requests-list';

/**
 * Client Component: Tickets Page UI
 *
 * Uses SWR context for background data refresh every 30 seconds
 * Initial render uses SSR data with NO client-side fetch (no spinner on load)
 * URL navigation updates trigger page re-render with new data
 *
 * LAYOUT STRATEGY (CSS Grid - Simple & Maintainable):
 * ====================================================
 * <main> - 2-row grid [header | content]
 *   Row 1: TicketsHeader (auto height - shrinks to content)
 *   Row 2: Content body (1fr - takes remaining space, min-h-0 for scroll containment)
 *     <div> - 3-row grid [filters | table | pagination]
 *       Row 1: Business units + filters (auto height)
 *       Row 2: Table area (1fr - constrained height, triggers scrolling in table)
 *         → Flex chain: wrapper (flex col) → inner (flex-1, flex col) → TicketsTable (flex-1, overflow-auto)
 *       Row 3: Pagination (auto height - only shown when total > 0)
 *
 * CRITICAL for vertical scrolling:
 * - Grid Row 2 (1fr) constrains table area height
 * - Flex chain with min-h-0 at each level passes height constraint down
 * - TicketsTable (innermost) has overflow-auto to handle scroll
 * - Vertical scrollbar appears ONLY on table, pagination always visible
 *
 * CRITICAL for horizontal scrolling:
 * - overflow-x-hidden on page-level containers and cards row (prevents page-level horizontal scroll)
 * - Table wrapper allows horizontal overflow to flow to TicketsTable
 * - TicketsTable has overflow-auto for both axes
 * - Horizontal scrollbar appears ONLY on table container
 *
 * Benefits:
 * - Clear hierarchy: Grid defines 3 distinct areas (filters, table, pagination)
 * - Predictable scrolling: Only table scrolls, pagination always visible
 * - Easy to maintain: Flex chain clearly defined, each level has purpose
 * - No page-level scrolling: All overflow contained within table
 */

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

export function TicketsPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isMobile, isTablet, isDesktop, viewport } = useViewport();

  // On mobile, sidebar is hidden by default and shown as a Sheet
  // On desktop/tablet, sidebar is visible by default
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const [selectedTickets, setSelectedTickets] = useState<Set<string>>(new Set());
  const [showBulkStatusDialog, setShowBulkStatusDialog] = useState(false);
  const [showCustomViewDialog, setShowCustomViewDialog] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false); // NEW: Track selection mode for mobile

  // Get filter type from URL parameter
  const filterParam = searchParams.get('filter') as TicketFilterType | null;
  const ticketTypeFilter: TicketFilterType = filterParam && ['all', 'parents', 'subtasks'].includes(filterParam)
    ? filterParam
    : 'all';

  // Get unread filter from URL parameter
  const showUnreadOnly = searchParams.get('unread') === 'true';

  // Get business unit IDs from URL (supports multiple IDs)
  const businessUnitIdsParam = searchParams.get('business_unit_ids');
  const selectedBusinessUnitIds: number[] = useMemo(
    () => businessUnitIdsParam
      ? businessUnitIdsParam.split(',').map(id => parseInt(id, 10))
      : [],
    [businessUnitIdsParam]
  );

  // Get data from context (auto-revalidates every 10 seconds)
  const {
    tickets,
    filterCounts,
    viewItems,
    activeView,
    activeViewDisplayName,
    total,
    currentPage,
    perPage,
    isLoading,
    isValidating,
    isViewChanging,
    refresh,
    counts,
  } = useRequestsListContext();

  // Filter tickets by type and unread status for display
  const filteredTickets = useMemo(() => {
    let result = tickets;

    // Filter by ticket type
    if (ticketTypeFilter === 'parents') {
      result = result.filter(t => !t.parentTaskId);
    } else if (ticketTypeFilter === 'subtasks') {
      result = result.filter(t => t.parentTaskId);
    }

    // Filter by unread status (messages from requesters that technician hasn't read)
    if (showUnreadOnly) {
      result = result.filter(t => t.technicianHasUnread);
    }

    return result;
  }, [tickets, ticketTypeFilter, showUnreadOnly]);

  // Check if any selected ticket has a solved status (for disabling bulk status change)
  const hasSolvedTickets = useMemo(() => {
    if (selectedTickets.size === 0) return false;
    return tickets.some(t =>
      selectedTickets.has(t.id) && t.status?.countAsSolved === true
    );
  }, [selectedTickets, tickets]);

  // Event handlers
  // Toggle sidebar: on mobile opens Sheet, on desktop toggles aside
  const handleToggleSidebar = () => {
    if (isMobile) {
      setMobileDrawerOpen(!mobileDrawerOpen);
    } else {
      setSidebarVisible(!sidebarVisible);
    }
  };

  // Close mobile sidebar
  const handleCloseSidebar = () => {
    setMobileDrawerOpen(false);
  };

  const handleViewChange = (viewName: string) => {
    // Find the view type from display name
    const viewType = Object.entries(viewDisplayNames).find(
      ([_, name]) => name === viewName
    )?.[0] as ViewType | undefined;

    if (viewType) {
      // Navigate to new view (triggers server re-fetch)
      const params = new URLSearchParams();
      params.set('view', viewType);
      params.set('page', '1');
      if (showUnreadOnly) {
        params.set('unread', 'true');
      }
      router.push(`/support-center/requests?${params.toString()}`);
    }
  };

  const handleTicketClick = (ticketId: string) => {
    // Navigate to ticket detail page
    router.push(`/support-center/requests/${ticketId}`);
  };

  const handleFilterChange = (newFilter: TicketFilterType) => {
    // Navigate with new filter (triggers URL update)
    const params = new URLSearchParams();
    params.set('view', activeView);
    params.set('page', currentPage.toString());
    params.set('perPage', perPage.toString());
    params.set('filter', newFilter);
    if (selectedBusinessUnitIds.length > 0) {
      params.set('business_unit_ids', selectedBusinessUnitIds.join(','));
    }
    if (showUnreadOnly) {
      params.set('unread', 'true');
    }
    router.push(`/support-center/requests?${params.toString()}`);
  };

  const handlePageChange = (newPage: number) => {
    // Navigate to new page (triggers server re-fetch)
    const params = new URLSearchParams();
    params.set('view', activeView);
    params.set('page', newPage.toString());
    params.set('perPage', perPage.toString());
    params.set('filter', ticketTypeFilter);
    if (selectedBusinessUnitIds.length > 0) {
      params.set('business_unit_ids', selectedBusinessUnitIds.join(','));
    }
    if (showUnreadOnly) {
      params.set('unread', 'true');
    }
    router.push(`/support-center/requests?${params.toString()}`);
  };

  const handlePageSizeChange = (newSize: number) => {
    // Navigate to new page size (reset to page 1 and triggers server re-fetch)
    const params = new URLSearchParams();
    params.set('view', activeView);
    params.set('page', '1'); // Reset to page 1 when changing page size
    params.set('perPage', newSize.toString());
    params.set('filter', ticketTypeFilter);
    if (selectedBusinessUnitIds.length > 0) {
      params.set('business_unit_ids', selectedBusinessUnitIds.join(','));
    }
    if (showUnreadOnly) {
      params.set('unread', 'true');
    }
    router.push(`/support-center/requests?${params.toString()}`);
  };

  // Business unit card click handler (toggle selection for multiple selection mode)
  const handleBusinessUnitChange = useCallback((id: number) => {
    const newSelection: number[] = [];

    if (id === -1) {
      // Clicking "Unassigned" clears all selections
      // (represents showing only unassigned requests)
    } else if (selectedBusinessUnitIds.includes(id)) {
      // Clicking a selected card deselects it
      newSelection.push(...selectedBusinessUnitIds.filter(bid => bid !== id));
    } else {
      // Clicking an unselected card selects it
      newSelection.push(...selectedBusinessUnitIds, id);
    }

    const params = new URLSearchParams();
    params.set('view', activeView);
    params.set('page', '1'); // Reset to page 1 when filtering
    params.set('perPage', perPage.toString());
    params.set('filter', ticketTypeFilter);
    if (newSelection.length > 0) {
      params.set('business_unit_ids', newSelection.join(','));
    }
    if (showUnreadOnly) {
      params.set('unread', 'true');
    }
    router.push(`/support-center/requests?${params.toString()}`);
  }, [activeView, perPage, router, selectedBusinessUnitIds, ticketTypeFilter, showUnreadOnly]);

  // Business unit filter change handler (multi-selection for sidebar filter)
  const handleBusinessUnitFilterChange = useCallback((ids: number[]) => {
    const params = new URLSearchParams();
    params.set('view', activeView);
    params.set('page', '1'); // Reset to page 1 when filtering
    params.set('perPage', perPage.toString());
    params.set('filter', ticketTypeFilter);
    if (ids.length > 0) {
      params.set('business_unit_ids', ids.join(','));
    }
    if (showUnreadOnly) {
      params.set('unread', 'true');
    }
    router.push(`/support-center/requests?${params.toString()}`);
  }, [activeView, perPage, router, ticketTypeFilter, showUnreadOnly]);

  // Sidebar action handlers
  const handleAddView = () => setShowCustomViewDialog(true);
  const handleRefresh = async () => {
    // Trigger SWR revalidation
    await refresh();
  };
  const handleManageViews = () => setShowCustomViewDialog(true);
  const handleCustomViewSuccess = async () => {
    // Full page refresh to reload custom view settings from server
    // This ensures visible tabs and default tab are updated
    router.refresh();
  };


  // Selection handlers
  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      setSelectedTickets(new Set(filteredTickets.map((t) => t.id)));
    } else {
      setSelectedTickets(new Set());
    }
  }, [filteredTickets]);

  const handleSelectTicket = useCallback((ticketId: string, selected: boolean) => {
    setSelectedTickets((prev) => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(ticketId);
      } else {
        newSet.delete(ticketId);
      }
      return newSet;
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedTickets(new Set());
    setSelectionMode(false); // Exit selection mode when clearing
  }, []);

  // Bulk status change handlers
  const handleBulkStatusChange = useCallback(() => {
    setShowBulkStatusDialog(true);
  }, []);

  const handleBulkStatusSuccess = useCallback(async () => {
    // Clear selection and refresh data
    setSelectedTickets(new Set());
    await refresh();
  }, [refresh]);

  const handleUnreadFilterChange = useCallback((showUnread: boolean) => {
    // Navigate with unread parameter (triggers URL update)
    const params = new URLSearchParams();
    params.set('view', activeView);
    params.set('page', currentPage.toString());
    params.set('perPage', perPage.toString());
    params.set('filter', ticketTypeFilter);
    if (selectedBusinessUnitIds.length > 0) {
      params.set('business_unit_ids', selectedBusinessUnitIds.join(','));
    }
    if (showUnread) {
      params.set('unread', 'true');
    }
    router.push(`/support-center/requests?${params.toString()}`);
    // Clear selection and exit selection mode when filter changes
    setSelectedTickets(new Set());
    setSelectionMode(false);
  }, [activeView, currentPage, perPage, router, selectedBusinessUnitIds, ticketTypeFilter]);

  return (
    <div className="flex flex-1 min-h-0 bg-muted/30 overflow-hidden transition-all duration-200">
      {/* Desktop Sidebar - Hidden on mobile via CSS and JS */}
      {!isMobile && (
      <div className="hidden md:flex">
        <TicketsSidebar
          visible={sidebarVisible}
          activeView={activeViewDisplayName}
          viewItems={viewItems}
          selectedBusinessUnitIds={selectedBusinessUnitIds}
          onViewChange={handleViewChange}
          onBusinessUnitFilterChange={handleBusinessUnitFilterChange}
          onAddView={handleAddView}
          onRefresh={handleRefresh}
          onManageViews={handleManageViews}
          onClose={() => setSidebarVisible(false)}
          disabled={isViewChanging}
        />
      </div>
      )}

      {/* Mobile Sidebar Drawer - Only rendered when open on mobile */}
      {isMobile && mobileDrawerOpen && (
        <Sheet open={true} onOpenChange={(open) => setMobileDrawerOpen(open)}>
          <SheetContent side="left" className="p-0 w-[274px] flex flex-col gap-0" hideClose={true}>
            <SheetHeader className="sr-only">
              <SheetTitle>Views & Filters</SheetTitle>
              <SheetDescription>Select a view and filter tickets by business unit</SheetDescription>
            </SheetHeader>
            <TicketsSidebar
              visible={true}
              activeView={activeViewDisplayName}
              viewItems={viewItems}
              selectedBusinessUnitIds={selectedBusinessUnitIds}
              onViewChange={(viewName) => {
                handleViewChange(viewName);
                setMobileDrawerOpen(false);
              }}
              onBusinessUnitFilterChange={(ids) => {
                handleBusinessUnitFilterChange(ids);
                setMobileDrawerOpen(false);
              }}
              onAddView={() => {
                handleAddView();
                setMobileDrawerOpen(false);
              }}
              onRefresh={handleRefresh}
              onManageViews={() => {
                handleManageViews();
                setMobileDrawerOpen(false);
              }}
              onClose={handleCloseSidebar}
              inSheet={true}
              disabled={isViewChanging}
            />
          </SheetContent>
        </Sheet>
      )}

      {/* Main Content - CSS Grid Layout for clarity */}
      <main className="flex-1 min-h-0 min-w-0 grid grid-rows-[auto_1fr] overflow-hidden" data-debug="main-content">
        {/* Row 1: Fixed Header */}
        <TicketsHeader
          sidebarVisible={sidebarVisible}
          mobileDrawerOpen={mobileDrawerOpen}
          activeView={activeViewDisplayName}
          selectedCount={selectedTickets.size}
          hasSolvedTickets={hasSolvedTickets}
          unsolvedCount={counts?.allUnsolved}
          onToggleSidebar={handleToggleSidebar}
          onToggleMobileDrawer={() => setMobileDrawerOpen(!mobileDrawerOpen)}
          onBulkStatusChange={handleBulkStatusChange}
          onClearSelection={handleClearSelection}
        />

        {/* Row 2: Content Body - CSS Grid for fixed header/footer with scrollable middle */}
        <div className="bg-card grid grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] min-h-0 min-w-0 overflow-hidden" data-debug="content-body">
          {isViewChanging ? (
            /* Skeleton Content Body - shown during view change */
            <>
              {/* Business Unit Cards + Filter Skeleton */}
              <div className="p-3 sm:p-6 pb-0 w-full min-w-0 overflow-x-hidden">
                {/* Business Unit Cards - Desktop */}
                <div className="hidden sm:flex gap-3 mb-4 overflow-x-auto pb-2">
                  <Skeleton className="h-20 w-40 shrink-0 rounded-lg" />
                  <Skeleton className="h-20 w-40 shrink-0 rounded-lg" />
                  <Skeleton className="h-20 w-40 shrink-0 rounded-lg" />
                  <Skeleton className="h-20 w-40 shrink-0 rounded-lg" />
                </div>

                {/* Business Unit Cards - Mobile */}
                <div className="sm:hidden flex gap-2 mb-4 overflow-x-auto pb-2">
                  <Skeleton className="h-16 w-32 shrink-0 rounded-lg" />
                  <Skeleton className="h-16 w-32 shrink-0 rounded-lg" />
                  <Skeleton className="h-16 w-32 shrink-0 rounded-lg" />
                </div>

                {/* Tickets Count */}
                <Skeleton className="h-4 w-24 mb-4" />

                {/* Ticket Type Filter Tabs */}
                <div className="flex gap-2 mb-4">
                  <Skeleton className="h-8 w-16 rounded-md" />
                  <Skeleton className="h-8 w-20 rounded-md" />
                  <Skeleton className="h-8 w-20 rounded-md" />
                </div>
              </div>

              {/* Table Area Skeleton - Desktop */}
              <div className="hidden lg:block px-3 sm:px-6 pb-3 sm:pb-4 pt-3 sm:pt-4 min-h-0 w-full min-w-0">
                <div className="border border-border rounded-md overflow-hidden h-full">
                  {/* Table Header */}
                  <div className="bg-muted/50 border-b-2 border-border">
                    <div className="flex items-center h-12 px-2 gap-4">
                      <Skeleton className="h-4 w-6" />
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 flex-1 max-w-[300px]" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  </div>

                  {/* Table Rows */}
                  <div className="overflow-auto">
                    {Array.from({ length: 8 }).map((_, index) => (
                      <div
                        key={index}
                        className="flex items-center h-14 px-2 gap-4 border-b border-border"
                      >
                        <Skeleton className="h-4 w-6" />
                        <Skeleton className="h-6 w-20 rounded-full" />
                        <div className="flex-1 min-w-0 max-w-[300px]">
                          <Skeleton className="h-4 w-full mb-1" />
                          <Skeleton className="h-3 w-3/4" />
                        </div>
                        <div className="w-24">
                          <Skeleton className="h-4 w-20 mb-1" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-5 w-16 rounded-full" />
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-32" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Cards Area Skeleton - Mobile/Tablet */}
              <div className="lg:hidden px-3 sm:px-6 pb-3 sm:pb-4 pt-3 sm:pt-4 min-h-0 w-full min-w-0">
                <div className="border border-border rounded-md overflow-auto h-full">
                  {/* Mobile Filter Header */}
                  <div className="sticky top-0 z-10 bg-muted/50 border-b border-border px-3 py-2 flex items-center justify-end gap-2">
                    <Skeleton className="h-5 w-20 rounded-md" />
                    <Skeleton className="h-5 w-9 rounded-full" />
                  </div>

                  {/* Ticket Cards */}
                  <div className="divide-y divide-border">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <div key={index} className="p-4 space-y-3">
                        {/* Status + Priority Row */}
                        <div className="flex items-center justify-between">
                          <Skeleton className="h-6 w-24 rounded-full" />
                          <Skeleton className="h-5 w-16 rounded-full" />
                        </div>

                        {/* Subject */}
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-3/4" />

                        {/* Requester + Timestamp */}
                        <div className="flex items-center justify-between pt-2">
                          <div className="flex items-center gap-2">
                            <Skeleton className="h-6 w-6 rounded-full" />
                            <Skeleton className="h-4 w-24" />
                          </div>
                          <Skeleton className="h-3 w-16" />
                        </div>

                        {/* Last Message Preview */}
                        <div className="pt-2 border-t">
                          <Skeleton className="h-3 w-full" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Pagination Skeleton */}
              <div className="border-t border-border min-w-0 w-full">
                <div className="flex items-center justify-between px-4 py-3">
                  <Skeleton className="h-4 w-32" />
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-8 w-8 rounded-md" />
                    <Skeleton className="h-8 w-24 rounded-md" />
                    <Skeleton className="h-8 w-8 rounded-md" />
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* Actual Content Body */
            <>
              {/* Fixed: Business Unit Cards + Filters - Prevent horizontal overflow */}
              <div className="p-3 sm:p-6 pb-0 w-full min-w-0 overflow-x-hidden">
                <BusinessUnitCards
                  selectedIds={selectedBusinessUnitIds}
                  onCardClick={handleBusinessUnitChange}
                  sidebarVisible={sidebarVisible}
                />

                <p className="mb-4 text-sm text-muted-foreground flex items-center gap-2">
                  <span className="tabular-nums">
                    {total} {total === 1 ? 'ticket' : 'tickets'}
                  </span>
                  {/* Only show spinner during background refresh, not initial load */}
                  {!isLoading && isValidating && tickets.length > 0 && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </p>

                <TicketTypeFilter
                  activeFilter={ticketTypeFilter}
                  counts={filterCounts}
                  onFilterChange={handleFilterChange}
                />
              </div>

              {/* Scrollable: Table Area - TicketsTable handles all scrolling internally */}
              <div className="px-3 sm:px-6 pb-3 sm:pb-4 pt-3 sm:pt-4 min-h-0 w-full min-w-0 flex flex-col" data-debug="table-wrapper">
                <div className="min-w-0 flex-1 min-h-0 w-full flex flex-col">
                  <TicketsTable
                    tickets={filteredTickets}
                    selectedTickets={selectedTickets}
                    showUnreadOnly={showUnreadOnly}
                    selectionMode={selectionMode}
                    onTicketClick={handleTicketClick}
                    onSelectAll={handleSelectAll}
                    onSelectTicket={handleSelectTicket}
                    onUnreadFilterChange={handleUnreadFilterChange}
                    onSelectionModeChange={setSelectionMode}
                  />
                </div>
              </div>

              {/* Fixed: Pagination Controls - only show when total > 0 */}
              {total > 0 && (
                <div className="border-t border-border min-w-0 w-full" data-debug="pagination">
                  <TicketsPagination
                    currentPage={currentPage}
                    pageSize={perPage}
                    totalItems={total}
                    totalPages={Math.ceil(total / perPage)}
                    onPageChange={handlePageChange}
                    onPageSizeChange={handlePageSizeChange}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Bulk Status Change Dialog */}
      <BulkStatusChangeDialog
        open={showBulkStatusDialog}
        onOpenChange={setShowBulkStatusDialog}
        selectedTicketIds={Array.from(selectedTickets)}
        onSuccess={handleBulkStatusSuccess}
      />

      {/* Custom View Dialog */}
      <CustomViewDialog
        open={showCustomViewDialog}
        onOpenChange={setShowCustomViewDialog}
        onSuccess={handleCustomViewSuccess}
      />
    </div>
  );
}
