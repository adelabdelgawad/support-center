import { Skeleton } from '@/components/ui/skeleton';
import { Plus, RefreshCw, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Requests List Loading Skeleton
 *
 * Displays during navigation to the requests list page.
 * - Sidebar view buttons are shown but DISABLED (not clickable)
 * - Right pane (business unit cards + datatable) shows skeleton
 */
export default function RequestsListLoading() {
  // Static view items for skeleton (disabled during loading)
  const skeletonViewItems = [
    { name: 'Unassigned tickets', count: '-' },
    { name: 'All unsolved tickets', count: '-' },
    { name: 'Your unsolved tickets', count: '-' },
    { name: 'Recently updated tickets', count: '-' },
    { name: 'Recently solved tickets', count: '-' },
  ];

  return (
    <div className="flex flex-1 min-h-0 bg-muted/30 overflow-hidden">
      {/* Desktop Sidebar - Visible but DISABLED during loading */}
      <aside
        className="hidden md:flex w-[274px] bg-card border-r border-border flex-col overflow-auto shrink-0"
        data-debug="views-sidebar-loading"
      >
        {/* Sidebar Header - Disabled buttons */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Views</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              disabled
              aria-label="Add view"
            >
              <Plus className="h-4 w-4 text-muted-foreground" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              disabled
              aria-label="Refresh"
            >
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        </div>

        {/* View List - Disabled buttons */}
        <div className="flex-1 overflow-y-auto py-2">
          {skeletonViewItems.map((item, index) => (
            <button
              key={index}
              disabled
              className="w-full flex items-center justify-between px-4 py-3 text-sm text-muted-foreground transition-colors min-h-[48px] cursor-not-allowed opacity-60"
            >
              <span className="flex-1 text-left">{item.name}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {item.count}
              </span>
            </button>
          ))}
        </div>

        {/* Business Unit Filter Skeleton */}
        <div className="border-t border-border p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Business Units</span>
          </div>
          <div className="space-y-1">
            <Skeleton className="h-8 w-full rounded-md" />
            <Skeleton className="h-8 w-full rounded-md" />
            <Skeleton className="h-8 w-full rounded-md" />
          </div>
        </div>

        {/* Sidebar Footer - Disabled */}
        <div className="border-t border-border py-2">
          <span className="flex items-center px-4 py-3 text-sm text-muted-foreground min-h-[48px] cursor-not-allowed opacity-60">
            Manage views
            <ExternalLink className="ml-1 h-3 w-3" />
          </span>
        </div>
      </aside>

      {/* Main Content - Skeleton only on right pane */}
      <main className="flex-1 min-h-0 min-w-0 grid grid-rows-[auto_1fr] overflow-hidden">
        {/* Row 1: Header Skeleton */}
        <header className="bg-card border-b border-border">
          {/* Mobile Header */}
          <div className="md:hidden flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-10 w-10 rounded-md" />
            <div className="flex-1 min-w-0">
              <Skeleton className="h-5 w-24 mb-1" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>

          {/* Desktop Header */}
          <div className="hidden md:flex items-center gap-3 px-6 py-4">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-6 flex-1 max-w-[200px]" />
          </div>
        </header>

        {/* Row 2: Content Body Skeleton */}
        <div className="bg-card grid grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] min-h-0 min-w-0 overflow-hidden">
          {/* Business Unit Cards + Filter Row Skeleton */}
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
        </div>
      </main>
    </div>
  );
}
